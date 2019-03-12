import importer from '../importer'
import rest from '../rest_7'
import assert from './assert'
import { cwd, uid as getUid} from '../util'
import factory from './factory'

const config = factory.getTestConfig()

describe('imports', () => {
  let admin
  const options = { config }

  before(async () => {
    const uid = getUid()
    admin = await factory.createAdmin(uid, options)
  })

  it('combines', async () => {
    const filename = `${cwd}/lib/test/fixtures/importer/Main.sol`
    const source = await importer.combine(filename)
    assert.isAbove(source.indexOf('contract Main'), 0)
    assert.isAbove(source.indexOf('contract A'), 0)
    assert.isAbove(source.indexOf('contract B'), 0)
    assert.isAbove(source.indexOf('contract C'), 0)
    assert.isAbove(source.indexOf('contract D'), 0)
  })

  it('combines and uploads', async () => {
    const filename = `${cwd}/lib/test/fixtures/importer/Main.sol`
    const source = await importer.combine(filename)
    const name = `Main`
    const contractArgs = { name, source, args: {_size: 10} }
    const contract = await rest.createContract(admin, contractArgs, options)
    const state = await rest.getState(contract, options)
    assert.isDefined(state.AA, 'A')
    assert.isDefined(state.BB, 'B')
    assert.isDefined(state.CC, 'C')
    assert.isDefined(state.DD, 'D')
  })

})
