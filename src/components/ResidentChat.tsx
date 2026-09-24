import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { conversationReply, useLocalAI } from '../services/localAI'
import { residentReply, residentPrompt, TALK_TOPICS, residentDecisionPrompt, residentDecisionFallback, parseResidentDecision } from '../world/conversations'
import type { ResidentPosition } from '../world/residents'
import { ResidentPortrait } from './ResidentPortrait'

// Belt-and-suspenders: the backend already times out (45s), but this makes
// sure 'Thinking...' -- and the buttons disabled while busy -- can never
// outlast this no matter what the model/bridge does, so the panel is
// always closable and never looks hung.
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(onTimeout), ms)
    promise.then(v => { clearTimeout(timer); resolve(v) }, () => { clearTimeout(timer); resolve(onTimeout) })
  })
}

export function ResidentChat({ person, onClose, onEnter }: { person: ResidentPosition; onClose: () => void; onEnter?: (position: ResidentPosition) => void }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  // Asleep residents don't get a real conversation until their own
  // schedule wakes them -- unless the player explicitly wakes them, which
  // has a small, contained consequence: shorter, curter replies for the
  // rest of THIS conversation (residentPrompt's groggy flag below), not a
  // lasting penalty. `woke` starts true for anyone who isn't asleep right
  // now, so it never gates a normal conversation.
  const [woke, setWoke] = useState(person.action !== 'sleeping')
  const alreadyMet = useRef(!!useGameStore.getState().contacts[person.resident.id]), registered = useRef(false), serial = useRef(0)
  const mode = useLocalAI(s => s.mode), end = useRef<HTMLDivElement>(null)
  const asleep = person.action === 'sleeping' && !woke
  useEffect(() => {
    if (asleep) return
    if (!registered.current) { registered.current = true; const r = person.resident; useGameStore.getState().meetResident(r.id, r.name, r.role) }
    const greeting = person.action === 'sleeping'
      ? `(yawns, rubbing their eyes) Mmph... what is it? I was asleep.`
      : residentReply(person, 'hello', alreadyMet.current)
    setMessages([{ role: 'assistant', content: greeting }])
    return () => { serial.current++ }
  }, [asleep])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])
  const groggy = person.action === 'sleeping' && woke
  const send = async (text: string) => {
    if (!text.trim() || busy) return
    const next = [...messages, { role: 'user' as const, content: text.trim().slice(0, 1000) }].slice(-16), request = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    const fallback = (groggy ? '(still half-asleep) ' : '') + residentReply(person, text, alreadyMet.current, groggy)
    const reply = await withTimeout(conversationReply(residentPrompt(person, groggy), next, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (request !== serial.current) return
    setMessages([...next, { role: 'assistant', content: reply.text }]); setNotice(reply.notice); setBusy(false)
  }
  const isPinned = !!person.resident.outdoorActivities?.length
  const canAskEnter = isPinned && person.action !== 'home' && !!person.resident.indoorActivities?.length
  const decide = async (ask: 'next' | 'enter') => {
    if (busy) return
    const question = ask === 'enter' ? 'Can I come in?' : 'What will you do next?'
    const next = [...messages, { role: 'user' as const, content: question }].slice(-16), request = ++serial.current
    setMessages(next); setBusy(true); setNotice('')
    const fallback = residentDecisionFallback(person, ask)
    const reply = await withTimeout(conversationReply(residentDecisionPrompt(person, ask), next, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (request !== serial.current) return
    const decision = parseResidentDecision(reply.text, ask, person.resident, person)
    const until = useGameStore.getState().simMinutesTotal + 90 + Math.floor(Math.random() * 90)
    useGameStore.getState().setResidentOverride(person.resident.id, { indoors: decision.indoors, action: decision.action, activity: decision.activity, scene: decision.scene, description: decision.description, until })
    setMessages([...next, { role: 'assistant', content: decision.say }]); setNotice(reply.notice); setBusy(false)
    if (ask === 'enter' && decision.granted && onEnter) {
      onEnter({ ...person, action: decision.action ?? 'resting', activity: decision.activity ?? 'Indoors', scene: decision.scene, description: decision.description, x: person.resident.home.x, y: person.resident.home.y, visible: false })
    }
  }
  if (asleep) {
    return <aside className="resident-chat" role="dialog" aria-label={`${person.resident.name} is asleep`} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="resident-portrait-wrap"><ResidentPortrait resident={person.resident} /></div>
      <header><div><h2>{person.resident.name} <span>· {person.resident.role}</span></h2><p>Asleep <span className="activity-tag">sleeping</span></p></div><button aria-label="Close conversation" onClick={onClose}>×</button></header>
      <div className="resident-messages" aria-live="polite"><p className="assistant">{person.description ?? `${person.resident.name} is fast asleep.`} They won't really wake up and talk right now -- best to come back later, unless you want to disturb them.</p></div>
      <div className="conversation-topics">
        <button onClick={onClose}>Leave them be</button>
        <button onClick={() => setWoke(true)}>Wake them anyway</button>
      </div>
      <footer>Waking someone up gets you a conversation, but a grumpier, shorter one.</footer>
    </aside>
  }
  return <aside className="resident-chat" role="dialog" aria-label={`Talk to ${person.resident.name}`} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
    <div className="resident-portrait-wrap"><ResidentPortrait resident={person.resident} /></div>
    <header><div><h2>{person.resident.name} <span>· {person.resident.role}</span></h2><p>{person.activity} <span className="activity-tag">{person.action}</span></p></div><button aria-label="Close conversation" onClick={onClose}>×</button></header>
    <div className="resident-messages" aria-live="polite">{messages.map((m, i) => <p key={i} className={m.role}>{m.content}</p>)}{busy && <p>Thinking…</p>}<div ref={end}/></div>
    {notice && <p className="conversation-notice" role="status">{notice}</p>}
    <div className="conversation-topics">{TALK_TOPICS.map(topic => <button key={topic} disabled={busy} onClick={() => void send(topic)}>{topic}</button>)}</div>
    {isPinned && <div className="conversation-topics">
      <button disabled={busy} onClick={() => void decide('next')}>What will you do next?</button>
      {canAskEnter && <button disabled={busy} onClick={() => void decide('enter')}>Can I come in?</button>}
    </div>}
    <form onSubmit={e => { e.preventDefault(); void send(draft) }}><input autoFocus value={draft} maxLength={1000} onChange={e => setDraft(e.target.value)} placeholder="Say something…" aria-label="Message neighbour"/><button disabled={busy || !draft.trim()}>Send</button></form>
    <footer>{mode === 'ollama' ? 'Local conversation' : 'Offline conversation · Enable Ollama in Mira’s settings for open-ended chat'}</footer>
  </aside>
}
