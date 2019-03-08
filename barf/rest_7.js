import api from './api_7'
import apiUtil from './api.util'
import * as constants from './constants'

function isTxSuccess(txResult) {
  return txResult.status === constants.SUCCESS
}

function isTxFailure(txResult) {
  return txResult.status === constants.FAILURE
}

// /users
async function getUsers(args, options) {
  const users = await api.getUsers(args, options)
  return users
}

// /users/:username
async function getUser(args, options) {
  const [address] = await api.getUser(args, options)
  return address
}

/*
  createUser
 */
async function createUser(args, options) {
  return (args.token) ? createUserAuth(args, options) : createUserBloc(args, options)
}

async function createUserBloc(args, options) {
  const address = await api.createUser(args, options)
  const user = Object.assign(args, { address })
  // async creation
  if (options.isAsync) {
    return user
  }
  // otherwise - block for faucet fill call
  const txResult = await fill(user, options)
  return user // TODO flow user object
}

async function createUserAuth(args, options) {
  const address = await createOrGetKey(args, options)
  const user = Object.assign({}, args, { address })
  return user
}

async function fill(user, options) {
  const txResult = await api.fill(user, options)
  if (!isTxSuccess(txResult)) {
    throw new Error(JSON.stringify(txResult)) // TODO make a RestError
  }
  return txResult
}

/*
  createContracts
 */
async function createContract(user, contract, options) {
  return (user.token)
    ? createContractAuth(user, contract, options)
    : createContractBloc(user, contract, options)
}

async function createContractBloc(user, contract, options) {
  const pendingTxResult = await api.createContractBloc(user, contract, options)
  if (options.isAsync) {
    return pendingTxResult
  }

  const resolvedTxResult = await resolveResult(pendingTxResult, options)

  const result = (resolvedTxResult.length) ? resolvedTxResult[0] : resolvedTxResult

  if (isTxFailure(result)) {
    throw new Error(result.txResult.message) // TODO throw RestError
  }
  // options.isDetailed - return all the data
  if (options.isDetailed) {
    return result.data.contents
  }
  // return basic contract object
  return { name: result.data.contents.name, address: result.data.contents.address }
}

async function createContractAuth(user, contract, options) {
  const pendingTxResult = await api.createContractAuth(user, contract, options)
  if (options.isAsync) {
    return pendingTxResult[0]
  }

  const resolvedTxResult = await resolveResult(pendingTxResult, options)

  const result = (resolvedTxResult.length) ? resolvedTxResult[0] : resolvedTxResult

  if (isTxFailure(result)) {
    throw new Error(result.txResult.message) // TODO throw RestError
  }
  // options.isDetailed - return all the data
  if (options.isDetailed) {
    return result.data.contents
  }
  // return basic contract object
  return { name: result.data.contents.name, address: result.data.contents.address }
}

async function getKey(user, options) {
  const response = await api.getKey(user, options);
  return response.address;
}

async function createKey(user, options) {
  const response = await api.createKey(user, options);
  return response.address;
}

async function createOrGetKey(user, options) {
  try {
    const response = await api.getKey(user, options)
    await fill({ address: response.address }, { isAsync: false, ...options })
    return response.address
  } catch (err) {
    const response = await api.createKey(user, options)
    await fill({ address: response.address }, { isAsync: false, ...options })
    return response.address
  }
}

async function resolveResult(result, options) {
  return (await resolveResults([result], options))[0]
}

async function resolveResults(pendingResults, _options = {}) {
  const options = Object.assign({ isAsync: true }, _options)

  // wait until there no no more PENDING results
  const predicate = (results) => results.filter(r => r.status === constants.PENDING ).length == 0
  const action = async () => getBlocResults(pendingResults.map(r => r.hash), options)
  const resolvedResults = await until(predicate, action, options)
  return resolvedResults
}

async function until(predicate, action, options, timeout = 60000) {
  const phi = 10
  let dt = 500
  let totalSleep = 0
  while (totalSleep < timeout) {
    const result = await action(options)
    console.log( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>', result)
    if (predicate(result)) {
      return result
    }
    else {
      console.log( '>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> SLEEPING',)
      await promiseTimeout(dt)
      totalSleep += dt
      dt += phi
    }
  }
  throw new Error(`until: timeout ${timeout} ms exceeded`)
}





async function getBlocResults(hashes, options = {}) {
  const result = await api.blocResults(hashes, options)
  return result
}

async function getState(contract, options) {
  const result = await api.getState(contract, options)
  return result
}

async function getArray(contract, name, options) {
  const MAX_SEGMENT_SIZE = 100
  options.stateQuery = { name, length: true }
  const state = await getState(contract, options)
  const length = state[name]
  const result = []
  for (let segment = 0; segment < length / MAX_SEGMENT_SIZE; segment++) {
    options.stateQuery = { name, offset: segment * MAX_SEGMENT_SIZE, count: MAX_SEGMENT_SIZE }
    const state = await getState(contract, options)
    result.push(...state[options.stateQuery.name])
  }
  return result
}

async function call(user, contract, method, args, value, options) {
  return (user.token)
    ? callAuth(user, contract, method, args, value, options)
    : callBloc(user, contract, method, args, value, options)
}

async function callBloc(user, contract, method, args, value, options) {
  // call
  const pendingTxResult = await api.callBloc(user, contract, method, args, value, options)
  // check return status
  if (isTxFailure(pendingTxResult)) {
    throw new Error(JSON.stringify(pendingTxResult.txResult)) // TODO throw RestError
  }
  // async - do not resolve
  if (options.isAsync) {
    return pendingTxResult
  }

  const resolvedTxResult = await resolveResult(pendingTxResult, options)

  const result = (resolvedTxResult.length) ? resolvedTxResult[0] : resolvedTxResult

  if (result.status === constants.FAILURE) {
    throw new Error(result.txResult.message) // TODO throw RestError
  }
  // options.isDetailed - return all the data
  if (options.isDetailed) {
    return result
  }
  // return basic contract object
  return result.data.contents
}

async function callAuth(user, contract, method, args, value, options) {
  const pendingTxResult = await api.callAuth(user, contract, method, args, value, options)
  if (isTxFailure(pendingTxResult)) {
    throw new Error(JSON.stringify(pendingTxResult.txResult)) // TODO throw RestError
  }

  if (options.isAsync) {
    return pendingTxResult
  }

  const resolvedTxResult = await resolveResult(pendingTxResult, options)

  const result = (resolvedTxResult.length) ? resolvedTxResult[0] : resolvedTxResult

  if (result.status === constants.FAILURE) {
    throw new Error(result.txResult.message) // TODO throw RestError
  }
  // options.isDetailed - return all the data
  if (options.isDetailed) {
    return result
  }
  // return basic contract object
  return result.data.contents
}

function promiseTimeout(timeout) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve()
    }, timeout)
  })
}

export default  {
  getUsers,
  getUser,
  createUser,
  createContract,
  getState,
  getArray,
  call,
  //
  resolveResult,
  //
  getKey,
  createKey,
  createOrGetKey,
}
