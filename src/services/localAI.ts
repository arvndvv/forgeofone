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
