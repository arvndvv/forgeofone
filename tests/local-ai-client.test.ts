import assert from 'node:assert/strict'
import { ollamaModels, ollamaChat } from '../src/services/ollamaConnection'
import { useLocalAI } from '../src/services/localAI'

async function run() {
  const calls: string[] = []
  const missingHandler = async () => { throw Error("No handler registered for 'forge:models'") }
  const browser = { location: { protocol: 'http:', hostname: 'localhost' }, forgeAI: { models: missingHandler, chat: missingHandler } }
  Object.assign(globalThis, { window: browser, localStorage: { setItem() {}, getItem() { return null } } })
  globalThis.fetch = (async (url: string) => {
    calls.push(url)
    return { ok: true, json: async () => url.endsWith('/api/tags')
      ? { models: [{ name: 'test:local', size: 100 }, { name: 'test:cloud', remote_host: 'remote' }] }
      : { message: { content: 'Local development reply.' } } }
  }) as typeof fetch
  await useLocalAI.getState().check()
  assert.equal(useLocalAI.getState().connected, true, 'stale Electron IPC recovers over loopback in development')
  assert.deepEqual(useLocalAI.getState().models.map(m => m.name), ['test:local'])
  useLocalAI.getState().configure('ollama', 'test:local')
  assert.equal(useLocalAI.getState().mode, 'ollama')
  assert.equal((await ollamaChat({ model: 'test:local', messages: [{ role: 'user', content: 'hello' }] })).text, 'Local development reply.')
  assert.ok(calls.every(url => url.startsWith('http://127.0.0.1:11434/')))
  calls.length = 0
  browser.location.hostname = 'example.com'
  const unavailable = await ollamaModels()
  assert.equal(unavailable.ok, false)
  assert.match(unavailable.error!, /Close and reopen/, 'bridge failure does not incorrectly report the server offline')
  assert.equal(calls.length, 0, 'remote pages never fall back to a local fetch')
  browser.location.hostname = 'localhost'
  globalThis.fetch = async () => { throw TypeError('Failed to fetch') }
  await useLocalAI.getState().check()
  assert.equal(useLocalAI.getState().connected, false)
  assert.deepEqual(useLocalAI.getState().models, [], 'failed checks clear stale model options')
  useLocalAI.getState().configure('offline', '')
  useLocalAI.getState().configure('ollama', 'test:local')
  assert.equal(useLocalAI.getState().mode, 'offline', 'unavailable models cannot be enabled')
  console.log('✓ Local connection: stale IPC recovery, real status, local-only fallback and cleared stale models')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
