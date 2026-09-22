/// <reference types="vite/client" />

interface Window {
  forgeAI?: {
    models: () => Promise<{ ok: boolean; models: Array<{ name: string; size: number }>; error?: string }>
    chat: (payload: { model: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> }) => Promise<{ ok: boolean; text?: string; error?: string }>
  }
}
