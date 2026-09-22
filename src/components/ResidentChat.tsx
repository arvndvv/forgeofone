import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { conversationReply, useLocalAI } from '../services/localAI'
import { residentReply, residentPrompt, TALK_TOPICS } from '../world/conversations'
import type { ResidentPosition } from '../world/residents'

export function ResidentChat({ person, onClose }: { person: ResidentPosition; onClose: () => void }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const alreadyMet = useRef(!!useGameStore.getState().contacts[person.resident.id]), registered = useRef(false), serial = useRef(0)
  const mode = useLocalAI(s => s.mode), end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!registered.current) { registered.current = true; const r = person.resident; useGameStore.getState().meetResident(r.id, r.name, r.role) }
    setMessages([{ role: 'assistant', content: residentReply(person, 'hello', alreadyMet.current) }])
    return () => { serial.current++ }
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])
  const send = async (text: string) => {
    if (!text.trim() || busy) return
    const next = [...messages, { role: 'user' as const, content: text.trim().slice(0, 1000) }].slice(-16), request = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    const reply = await conversationReply(residentPrompt(person), next, residentReply(person, text, alreadyMet.current))
    if (request !== serial.current) return
    setMessages([...next, { role: 'assistant', content: reply.text }]); setNotice(reply.notice); setBusy(false)
  }
  return <aside className="resident-chat" role="dialog" aria-label={`Talk to ${person.resident.name}`} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
    <header><div><small>{alreadyMet.current ? 'A FAMILIAR FACE' : 'MEET YOUR NEIGHBOUR'}</small><h2>{person.resident.name} <span>· {person.resident.role}</span></h2><p>{person.activity}</p></div><button aria-label="Close conversation" onClick={onClose}>×</button></header>
    <div className="resident-messages" aria-live="polite">{messages.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}{busy && <p>Thinking…</p>}<div ref={end}/></div>
    {notice && <p className="conversation-notice" role="status">{notice}</p>}
    <div className="conversation-topics">{TALK_TOPICS.map(topic => <button key={topic} disabled={busy} onClick={() => void send(topic)}>{topic}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); void send(draft) }}><input autoFocus value={draft} maxLength={1000} onChange={e => setDraft(e.target.value)} placeholder="Say something…" aria-label="Message neighbour"/><button disabled={busy || !draft.trim()}>Send</button></form>
    <footer>{mode === 'ollama' ? 'Local conversation' : 'Offline conversation · Enable Ollama in Mira’s settings for open-ended chat'}</footer>
  </aside>
}
