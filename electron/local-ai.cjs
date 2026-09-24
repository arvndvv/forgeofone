const OLLAMA = 'http://127.0.0.1:11434'

async function models() {
  try {
    const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) throw Error('Ollama could not list its models.')
    const data = await response.json()
    return { ok: true, models: (data.models || []).filter(m => typeof m.name === 'string' && !m.remote_model && !m.remote_host && !/cloud/i.test(m.name) && (!m.capabilities || m.capabilities.includes('completion'))).map(m => ({ name: m.name, size: m.size })) }
  } catch { return { ok: false, models: [], error: 'Ollama is not reachable. Open Ollama on this Mac, then check again.' } }
}

async function chat(payload) {
  try {
    if (!payload || typeof payload.model !== 'string' || payload.model.length > 120 || !Array.isArray(payload.messages) || payload.messages.length > 16) throw Error('Invalid chat request.')
    if (payload.messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 7000)) throw Error('Invalid chat message.')
    if (payload.messages.reduce((n, m) => n + m.content.length, 0) > 24000) throw Error('Conversation is too long.')
    const installed = await models()
    if (!installed.ok) throw Error(installed.error)
    if (!installed.models.some(m => m.name === payload.model)) throw Error('Choose an installed local model in Mira’s settings.')
    // maxTokens/json are used by structured background generation (world-economy
    // content, challenges) which needs more room and a parseable shape than an
    // ordinary chat reply -- clamped and validated, never trusted as-is.
    const numPredict = Math.min(800, Math.max(60, Number.isFinite(payload.maxTokens) ? payload.maxTokens : 180))
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: payload.model, messages: payload.messages, stream: false,
        ...(/qwen3/i.test(payload.model) ? { think: false } : {}),
        ...(payload.json ? { format: 'json' } : {}),
        keep_alive: '2m', options: { num_predict: numPredict, num_ctx: 4096, temperature: 0.65 },
      }),
    })
    if (!response.ok) throw Error('The local model could not complete that reply.')
    const data = await response.json(), text = data.message?.content?.trim()
    if (!text) throw Error('The local model returned an empty reply.')
    return { ok: true, text: text.slice(0, 6000) }
  } catch (error) { return { ok: false, error: error.name === 'TimeoutError' ? 'The local model took too long. The offline reply is ready instead.' : error.message || 'Local chat is unavailable.' } }
}

function registerLocalAI(ipcMain, allowedURL) {
  const allowed = event => event.senderFrame && allowedURL(event.senderFrame.url)
  ipcMain.handle('forge:models', event => allowed(event) ? models() : { ok: false, models: [], error: 'Unavailable outside the game.' })
  ipcMain.handle('forge:chat', (event, payload) => allowed(event) ? chat(payload) : { ok: false, error: 'Unavailable outside the game.' })
}
module.exports = { registerLocalAI, models, chat }
