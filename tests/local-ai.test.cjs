const assert = require('node:assert/strict')
const { models, chat } = require('../electron/local-ai.cjs')

async function run() {
  const original = global.fetch
  let calls = []
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => url.endsWith('/api/tags') ? { models: [{ name: 'test:local', size: 1024, capabilities: ['completion'] }, { name: 'remote:cloud', remote_model: 'remote' }, { name: 'embed', capabilities: ['embedding'] }] } : { message: { content: 'A useful local reply.' } } }
  }
  try {
    assert.deepEqual((await models()).models.map(m => m.name), ['test:local'])
    calls = []
    assert.equal((await chat({ model: 'test:local', messages: [{ role: 'tool', content: 'invalid' }] })).ok, false)
    assert.equal(calls.length, 0, 'invalid request never reaches a service')
    assert.equal((await chat({ model: 'not-installed', messages: [] })).ok, false)
    assert.ok(!calls.some(c => c.url.endsWith('/api/chat')), 'unknown model cannot generate')
    const result = await chat({ model: 'test:local', messages: [{ role: 'user', content: 'Hello' }] })
    assert.equal(result.text, 'A useful local reply.')
    assert.ok(calls.every(c => c.url.startsWith('http://127.0.0.1:11434/')), 'all requests stay local')
    global.fetch = async () => { throw Error('Service offline') }
    assert.equal((await models()).ok, false)
    assert.equal((await chat({ model: 'test:local', messages: [] })).ok, false)
    console.log('✓ Local AI: local models only, request validation, installed-model checks, reply handling and offline failure')
  } finally { global.fetch = original }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
