type Bridge = NonNullable<Window['forgeAI']>
type ChatPayload = Parameters<Bridge['chat']>[0]
const LOCAL_URL = 'http://127.0.0.1:11434'
let useDevelopmentHTTP = false

function canUseLocalDevelopmentConnection() {
  return import.meta.env.DEV && typeof window !== 'undefined'
    && window.location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
}

function bridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /No handler registered|forge:models|forge:chat/i.test(message)
    ? 'The desktop connection needs an update. Close and reopen Forge of One, then connect again.'
    : 'The desktop connection failed. Close and reopen Forge of One, then try again.'
}

async function localModels(): ReturnType<Bridge['models']> {
  try {
    const response = await fetch(`${LOCAL_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw Error(`Ollama returned HTTP ${response.status}.`)
    const data = await response.json()
    if (!Array.isArray(data.models)) throw Error('Ollama returned an invalid model list.')
    return { ok: true, models: data.models.filter((m: { name?: string; remote_model?: string; remote_host?: string; capabilities?: string[] }) =>
      typeof m.name === 'string' && !m.remote_model && !m.remote_host && !/cloud/i.test(m.name) && (!m.capabilities || m.capabilities.includes('completion'))
    ).map((m: { name: string; size?: number }) => ({ name: m.name, size: m.size || 0 })) }
  } catch (error) {
    return { ok: false, models: [], error: error instanceof TypeError
      ? 'Cannot connect to Ollama at 127.0.0.1:11434. Open Ollama and try again.'
      : error instanceof Error && error.name === 'TimeoutError' ? 'Ollama did not respond in time. Try connecting again.' : (error as Error).message }
  }
}

export async function ollamaModels(): ReturnType<Bridge['models']> {
  if (typeof window === 'undefined') return { ok: false, models: [], error: 'Open the game to connect to Ollama.' }
  if (window.forgeAI && !(useDevelopmentHTTP && canUseLocalDevelopmentConnection())) {
    try { return await window.forgeAI.models() }
    catch (error) {
      if (!canUseLocalDevelopmentConnection()) return { ok: false, models: [], error: bridgeError(error) }
      useDevelopmentHTTP = true
    }
  }
  // Vite refreshes the UI without restarting Electron's main process. An older
  // running desktop shell may not have the IPC handlers yet; localhost can
  // connect directly without losing the player's session to a restart.
  if (canUseLocalDevelopmentConnection()) return localModels()
  return { ok: false, models: [], error: 'Open Forge of One in the desktop app to use local conversations.' }
}

export async function ollamaChat(payload: ChatPayload): ReturnType<Bridge['chat']> {
  if (typeof window === 'undefined') return { ok: false, error: 'Open the game to connect to Ollama.' }
  if (window.forgeAI && !(useDevelopmentHTTP && canUseLocalDevelopmentConnection())) {
    try { return await window.forgeAI.chat(payload) }
    catch (error) {
      if (!canUseLocalDevelopmentConnection()) return { ok: false, error: bridgeError(error) }
      useDevelopmentHTTP = true
    }
  }
  if (!canUseLocalDevelopmentConnection()) return { ok: false, error: 'Local conversations need the desktop app.' }
  const installed = await localModels()
  if (!installed.ok) return { ok: false, error: installed.error }
  if (!installed.models.some(m => m.name === payload.model)) return { ok: false, error: 'Choose an installed local model in Mira’s settings.' }
  try {
    const numPredict = Math.min(800, Math.max(60, payload.maxTokens ?? 180))
    const temperature = Number.isFinite(payload.temperature) ? Math.min(1.2, Math.max(0, payload.temperature!)) : 0.65
    const response = await fetch(`${LOCAL_URL}/api/chat`, {
      // Generous: a small Mac can take a while, especially loading the model
      // for the first message. The chat waits (with a "Stop waiting" button);
      // this cap only catches an Ollama that has hung outright.
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300000),
      body: JSON.stringify({
        model: payload.model, messages: payload.messages, stream: false,
        ...(/qwen3/i.test(payload.model) ? { think: false } : {}),
        // A JSON schema (Ollama structured outputs, 0.5+) constrains the reply
        // to exactly that shape; plain json mode only guarantees valid JSON.
        ...(payload.schema ? { format: payload.schema } : payload.json ? { format: 'json' } : {}),
        // Keep the model loaded between messages and chats -- reloading it
        // was most of the wait on each new message.
        keep_alive: '30m', options: { num_predict: numPredict, num_ctx: 4096, temperature },
      }),
    })
    if (!response.ok) throw Error('The local model could not complete that reply.')
    const data = await response.json(), text = data.message?.content?.trim()
    if (!text) throw Error('The local model returned an empty reply.')
    return { ok: true, text: text.slice(0, 6000) }
  } catch (error) { return { ok: false, error: (error as Error).name === 'TimeoutError' ? 'The local model took too long to reply.' : 'Ollama could not finish the reply. Check the connection and try again.' } }
}
