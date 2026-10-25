import { create } from 'zustand'
import { ollamaModels, ollamaChat } from './ollamaConnection'

type Message = { role: 'user' | 'assistant' | 'system'; content: string }
interface LocalAIState {
  mode: 'offline' | 'ollama'; model: string; models: Array<{ name: string; size: number }>
  checking: boolean; connected: boolean; status: string
  check: () => Promise<void>; configure: (mode: 'offline' | 'ollama', model: string) => void
}
function stored() {
  try {
    const data = JSON.parse(localStorage.getItem('forge-local-ai') || '{}')
    return { mode: data.mode === 'ollama' ? 'ollama' as const : 'offline' as const, model: typeof data.model === 'string' ? data.model : '' }
  } catch { return { mode: 'offline' as const, model: '' } }
}
export const useLocalAI = create<LocalAIState>((set, get) => ({
  ...stored(), models: [], checking: false, connected: false, status: '',
  check: async () => {
    if (get().checking) return
    set({ checking: true, status: 'Checking Ollama…' })
    try {
      const result = await ollamaModels()
      const models = [...result.models].sort((a, b) => a.size - b.size)
      set({ connected: result.ok, models, model: models.some(m => m.name === get().model) ? get().model : models[0]?.name ?? '', status: result.ok ? models.length ? `Connected to Ollama · ${models.length} local models available.` : 'Connected to Ollama, but no local chat models are installed.' : result.error || 'Ollama is unavailable.' })
    } catch { set({ connected: false, models: [], status: 'The connection check failed. Please try again.' }) }
    finally { set({ checking: false }) }
  },
  configure: (mode, model) => {
    if (mode === 'ollama' && (!get().connected || !get().models.some(m => m.name === model))) return
    set({ mode, model, status: mode === 'ollama' ? `Using ${model} on this Mac.` : 'Using offline conversations.' })
    try { localStorage.setItem('forge-local-ai', JSON.stringify({ mode, model })) } catch { /* Session settings still work. */ }
  },
}))

export async function conversationReply(system: string, messages: Message[], fallback: string): Promise<{ text: string; notice: string }> {
  const config = useLocalAI.getState()
  if (config.mode !== 'ollama') return { text: fallback, notice: '' }
  try {
    const result = await ollamaChat({ model: config.model, messages: [{ role: 'system', content: system.slice(0, 6500) }, ...messages.slice(-10).map(m => ({ ...m, content: m.content.slice(0, 1500) }))] })
    return result.ok && result.text ? { text: result.text, notice: '' } : { text: fallback, notice: `${result.error || 'Local chat is unavailable.'} Showing an offline reply.` }
  } catch { return { text: fallback, notice: 'Local chat is unavailable. Showing an offline reply.' } }
}

/** Whether the player is currently set up for AI-backed generation --
 *  connected to Ollama with a chosen model, not just "offline replies"
 *  selected. Everything that reads this degrades to static, hand-authored
 *  content when it's false; nothing ever blocks on it being true. */
export function aiReady(): boolean {
  const config = useLocalAI.getState()
  return config.mode === 'ollama' && !!config.model
}

/** For background *content* generation (challenges, job postings) rather
 *  than a conversational reply -- asks for JSON, gets more room to answer
 *  in, and returns null instead of any fallback text on failure so the
 *  caller always has an explicit "didn't work, use the static pool"
 *  signal instead of a piece of prose pretending to be data. Never throws. */
export async function generateJSON(system: string, user: string, maxTokens = 500, opts: { schema?: Record<string, unknown>; temperature?: number } = {}): Promise<unknown | null> {
  const config = useLocalAI.getState()
  if (config.mode !== 'ollama' || !config.model) return null
  try {
    const messages = [{ role: 'system' as const, content: system.slice(0, 6500) }, { role: 'user' as const, content: user.slice(0, 2000) }]
    let result = await ollamaChat({ model: config.model, messages, json: true, maxTokens, schema: opts.schema, temperature: opts.temperature })
    // Ollama older than 0.5 (no structured outputs) or an older desktop
    // shell may reject a schema -- retry once with plain JSON mode.
    if (opts.schema && !result.ok) result = await ollamaChat({ model: config.model, messages, json: true, maxTokens, temperature: opts.temperature })
    if (!result.ok || !result.text) return null
    // Ollama's JSON mode is reliably an object/array, but a small local
    // model can still wrap it in prose or a code fence -- pull out the
    // first {...} or [...] block rather than trusting the whole string.
    const match = result.text.match(/[[{][\s\S]*[\]}]/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch { return null }
}
