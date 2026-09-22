import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useLocalAI } from '../services/localAI'
import { MiraPet } from './MiraPet'

export function MiraWidget({ docked = false }: { docked?: boolean }) {
  const open = useGameStore(s => s.assistantOpen), chat = useGameStore(s => s.chat)
  const thinking = useGameStore(s => s.miraThinking), notice = useGameStore(s => s.miraNotice)
  const ai = useLocalAI(), [draft, setDraft] = useState(''), [settings, setSettings] = useState(false)
  const [happy, setHappy] = useState(false), end = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); if (chat.length > 1 && chat.at(-1)?.role === 'mira') { setHappy(true); const id = setTimeout(() => setHappy(false), 1800); return () => clearTimeout(id) } }, [chat, thinking])
  if (!open) return docked ? null : <button className="mira-launcher" onClick={() => useGameStore.getState().openAssistant()}><MiraPet size={42} />Ask Mira</button>
  const send = () => { if (!draft.trim() || thinking) return; void useGameStore.getState().askMira(draft); setDraft('') }
  return <aside className="mira-panel" role="dialog" aria-label="Talk to Mira" onKeyDown={e => { if (e.key === 'Escape') useGameStore.getState().closeAssistant() }}>
    <header className="mira-header"><MiraPet size={62} mood={thinking ? 'thinking' : happy ? 'happy' : draft ? 'listening' : 'idle'} /><div><h2>Mira</h2><small>Your little star companion</small><small>{ai.mode === 'ollama' ? `Local · ${ai.model}` : 'Offline guide'}</small></div><button aria-label="Mira settings" title="Conversation settings" onClick={() => { setSettings(v => !v); if (!settings) void ai.check() }}>⚙</button><button aria-label="Close Mira" onClick={() => useGameStore.getState().closeAssistant()}>×</button></header>
    {settings && <div className="mira-settings">
      <strong>Conversations on your Mac</strong>
      <p>Connect an installed Ollama model for Mira and neighbours, or choose offline replies.</p>
      {ai.models.length > 0 && <label className="mira-model-label">Local model<select aria-label="Local conversation model" value={ai.model} onChange={e => useLocalAI.setState({ model: e.target.value })}>{ai.models.map(m => <option key={m.name} value={m.name}>{m.name} · {(m.size / 1e9).toFixed(1)} GB</option>)}</select></label>}
      <div className="mira-settings-actions">
        <button disabled={ai.checking} onClick={() => void ai.check()}>{ai.checking ? 'Checking…' : 'Check Ollama'}</button>
        {ai.models.length > 0 && <button disabled={!ai.connected || ai.checking} onClick={() => ai.configure('ollama', ai.model)}>Use local model</button>}
        <button onClick={() => ai.configure('offline', ai.model)}>Use offline replies</button>
      </div>
      <p className="mira-connection-status" role="status">{ai.status}</p>
    </div>}
    {notice && <p className="mira-notice" role="status">{notice}</p>}
    <div className="mira-chat" aria-live="polite">{chat.map(m => <div className={`mira-bubble ${m.role === 'player' ? 'player' : ''}`} key={m.id}>{m.text}</div>)}{thinking && <div className="mira-bubble">Thinking about that…</div>}<div ref={end}/></div>
    <form className="mira-compose" onSubmit={e => { e.preventDefault(); send() }}><input ref={input} value={draft} maxLength={1500} onChange={e => setDraft(e.target.value)} placeholder="Ask about work, life or the world…" aria-label="Message Mira" /><button disabled={!draft.trim() || thinking}>Ask</button></form>
  </aside>
}
