import { MultiCall } from 'eth-multicall';
import {
  BALANCE_FETCH_BALANCES_BEGIN,
  BALANCE_FETCH_BALANCES_DONE,
  BALANCE_FETCH_REWARDS_BEGIN,
  BALANCE_FETCH_REWARDS_DONE,
} from '../constants';
import { config } from '../../../config/config';
import { isEmpty } from '../../../helpers/utils';

import erc20Abi from '../../../config/abi/erc20.json';
import multicallAbi from '../../../config/abi/multicall.json';
import boostAbi from '../../../config/abi/boost.json';

const boostRegex = /^moo.*Boost$/;

const getBalances = async (state, dispatch) => {
  console.log('redux getBalances() processing...');
  const address = state.walletReducer.address;
  const web3 = state.walletReducer.rpc;

  const multicall = [];
  const calls = [];

  for (let net in web3) {
    multicall[net] = new MultiCall(web3[net], config[net].multicallAddress);
    calls[net] = [];

    for (let tokenSymbol in state.balanceReducer.tokens[net]) {
      if (boostRegex.test(tokenSymbol)) continue; // Skip Boost enties

      let token = state.balanceReducer.tokens[net][tokenSymbol];

      if (tokenSymbol === config[net].walletSettings.nativeCurrency.symbol) {
        const tokenContract = new web3[net].eth.Contract(multicallAbi, multicall[net].contract);
        calls[net].push({
          amount: tokenContract.methods.getEthBalance(address),
          token: tokenSymbol,
        });
      } else {
        if (token.isGovVault) {
          const tokenContract = new web3[net].eth.Contract(erc20Abi, token.address);
          const poolContract = new web3[net].eth.Contract(boostAbi, token.poolAddress);
          console.log('GOV TOKEN');
          console.log(token);
          console.log(`addres is  ${address}`);
          console.log(`token symbol ${tokenSymbol}`);
          console.log(`net is ${net}`);
          calls[net].push({
            token: token.baseSymbol,
            amount: tokenContract.methods.balanceOf(address),
            // balance: poolContract.methods.balanceOf(address),
            // rewards: poolContract.methods.rewards(address),
            allowance: tokenContract.methods.allowance(address, token.poolAddress),
            isGovVault: 'true',
            address: token.address,
            spender: token.poolAddress,
          });

          calls[net].push({
            token: tokenSymbol,
            balance: poolContract.methods.balanceOf(address),
            rewards: poolContract.methods.earned(address),
            isGovVault: 'true',
          });
        } else {
          const tokenContract = new web3[net].eth.Contract(erc20Abi, token.address);
          calls[net].push({
            amount: tokenContract.methods.balanceOf(address),
            token: tokenSymbol,
            address: token.address,
          });

          for (let spender in token.allowance) {
            calls[net].push({
              allowance: tokenContract.methods.allowance(address, spender),
              token: tokenSymbol,
              spender: spender,
            });
          }
        }
      }
    }
  }

  const tokens = { ...state.balanceReducer.tokens };

  for (let key in multicall) {
    const response = (await multicall[key].all([calls[key]]))[0];

    for (let index in response) {
      const item = response[index];

      if (item.isGovVault) {
        console.log('ITEM IS GOV POOL');
        console.log(item);

        if (!isEmpty(item.balance)) {
          tokens[key][item.token].balance = item.balance;
          tokens[key][item.token].rewards = item.rewards;
          console.log('KIKI');
          console.log(tokens[key][item.token]);
        }

        if (!isEmpty(item.allowance)) {
          tokens[key][item.token].allowance = {
            ...tokens[key][item.token].allowance,
            [item.spender]: item.allowance,
          };
          tokens[key][item.token].balance = item.amount;
          tokens[key][item.token].address = item.address;

          console.log('KEKE');
          console.log(tokens[key][item.token]);
        }
      } else {
        if (!isEmpty(item.amount)) {
          tokens[key][item.token].balance = item.amount;
          tokens[key][item.token].address = item.address;
        }

        if (!isEmpty(item.allowance)) {
          tokens[key][item.token].allowance = {
            ...tokens[key][item.token].allowance,
            [item.spender]: item.allowance,
          };
        }
      }
    }
  }

  dispatch({
    type: BALANCE_FETCH_BALANCES_DONE,
    payload: {
      tokens: tokens,
      lastUpdated: new Date().getTime(),
    },
  });

  return true;
};

const getBoostBalances = async (items, state, dispatch) => {
  console.log('redux getBoostBalances() processing...');
  const address = state.walletReducer.address;
  const web3 = state.walletReducer.rpc;

  const multicall = [];
  const calls = [];

  for (let key in web3) {
    multicall[key] = new MultiCall(web3[key], config[key].multicallAddress);
    calls[key] = [];
  }

  for (let key in items) {
    const tokenContract = new web3[items[key].network].eth.Contract(
      erc20Abi,
      items[key].tokenAddress
    );
    const earnContract = new web3[items[key].network].eth.Contract(
      boostAbi,
      items[key].earnContractAddress
    );

    calls[items[key].network].push({
      amount: tokenContract.methods.balanceOf(address),
      token: items[key].token,
      address: items[key].tokenAddress,
    });

    calls[items[key].network].push({
      amount: earnContract.methods.balanceOf(address),
      token: items[key].token + 'Boost',
      address: items[key].tokenAddress,
    });

    calls[items[key].network].push({
      allowance: tokenContract.methods.allowance(address, items[key].earnContractAddress),
      token: items[key].token + 'Boost',
      spender: items[key].earnContractAddress,
    });
  }

  let response = [];

  for (let key in multicall) {
    const resp = await multicall[key].all([calls[key]]);
    response = [...response, ...resp[0]];
  }

  const tokens = state.balanceReducer.tokens;

  for (let index in response) {
    const item = response[index];

    if (!isEmpty(item.amount)) {
      tokens[item.token].balance = item.amount;
      tokens[item.token].address = item.address;
    }

    if (!isEmpty(item.allowance)) {
      tokens[item.token].allowance = {
        ...tokens[item.token].allowance,
        [item.spender]: item.allowance,
      };
    }
  }

  dispatch({
    type: BALANCE_FETCH_BALANCES_DONE,
    payload: {
      tokens: tokens,
      lastUpdated: new Date().getTime(),
    },
  });

  return true;
};

const getBoostRewards = async (items, state, dispatch) => {
  console.log('redux getBoostRewards() processing...');
  const address = state.walletReducer.address;
  const web3 = state.walletReducer.rpc;

  const multicall = [];
  const calls = [];
  const tokens = [];

  for (let key in web3) {
    multicall[key] = new MultiCall(web3[key], config[key].multicallAddress);
    calls[key] = [];
  }

  for (let key in items) {
    tokens[items[key].earnedToken] = {
      balance: 0,
      allowance: { [items[key].earnContractAddress]: 0 },
    };

    const earnContract = new web3[items[key].network].eth.Contract(
      boostAbi,
      items[key].earnContractAddress
    );

    calls[items[key].network].push({
      amount: earnContract.methods.earned(address),
      token: items[key].earnedToken,
      address: items[key].earnedTokenAddress,
    });
  }

  let response = [];

  for (let key in multicall) {
    const resp = await multicall[key].all([calls[key]]);
    response = [...response, ...resp[0]];
  }

  for (let index in response) {
    const item = response[index];

    if (!isEmpty(item.amount)) {
      tokens[item.token].balance = item.amount;
      tokens[item.token].address = item.address;
    }

    if (!isEmpty(item.allowance)) {
      tokens[item.token].allowance = {
        ...tokens[item.token].allowance,
        [item.spender]: item.allowance,
      };
    }
  }

  dispatch({
    type: BALANCE_FETCH_REWARDS_DONE,
    payload: {
      rewards: tokens,
      lastUpdated: new Date().getTime(),
    },
  });

  return true;
};

const fetchBalances = (item = false) => {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.walletReducer.address && state.balanceReducer.isBalancesLoading === false) {
      dispatch({ type: BALANCE_FETCH_BALANCES_BEGIN });
      return await getBalances(state, dispatch);
    }
  };
};

const fetchBoostBalances = (item = false) => {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.walletReducer.address) {
      const boosts = state.vaultReducer.boosts;
      dispatch({ type: BALANCE_FETCH_BALANCES_BEGIN });
      return await getBoostBalances(item ? [item] : boosts, state, dispatch);
    }
  };
};

const fetchBoostRewards = item => {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.walletReducer.address) {
      dispatch({ type: BALANCE_FETCH_REWARDS_BEGIN });
      return await getBoostRewards([item], state, dispatch);
    }
  };
};

export const balance = {
  fetchBalances,
  fetchBoostBalances,
  fetchBoostRewards,
};