import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { conversationReply, useLocalAI } from '../services/localAI'
import { residentReply, residentPrompt, TALK_TOPICS, residentDecisionPrompt, residentDecisionFallback, parseResidentDecision, chatActions, requestedActions, actionRequestInstruction, parseActionRequest, chatActionSuffix, parseChatAction, type ChatAction } from '../world/conversations'
import type { ResidentPosition } from '../world/residents'
import { ResidentPortrait } from './ResidentPortrait'
import { ChatText } from './ChatText'

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

export function ResidentChat({ person, onClose, onEnter, onExit }: { person: ResidentPosition; onClose: () => void; onEnter?: (position: ResidentPosition) => void; onExit?: (position: ResidentPosition) => void }) {
  // One conversation's history. Lives only as long as this panel: it keeps
  // going while you walk in or out together (the panel stays mounted), and
  // starts fresh after you close the chat or press Clear.
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
      ? `*yawns, rubbing their eyes* Mmph... what is it? I was asleep.`
      : residentReply(person, 'hello', alreadyMet.current)
    setMessages(old => old.length ? old : [{ role: 'assistant', content: greeting }])
    return () => { serial.current++ }
  }, [asleep])
  const clearChat = () => {
    serial.current++; setBusy(false); setNotice(''); setDraft('')
    setMessages([{ role: 'assistant', content: residentReply(person, 'hello', true) }])
  }
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy])
  const groggy = person.action === 'sleeping' && woke
  const isPinned = !!person.resident.outdoorActivities?.length
  const inside = !person.visible
  const options = isPinned ? chatActions(person) : []
  const canAskEnter = isPinned && !inside && person.action !== 'home' && options.some(a => a.indoors)
  const canAskExit = isPinned && inside && options.some(a => !a.indoors)
  // Make a chosen activity real: override where they are / what they do,
  // and take the player along when it crosses the door.
  const apply = (a: Pick<ChatAction, 'indoors' | 'action' | 'label' | 'scene' | 'description'>) => {
    const until = useGameStore.getState().simMinutesTotal + 90 + Math.floor(Math.random() * 90)
    useGameStore.getState().setResidentOverride(person.resident.id, { indoors: a.indoors, action: a.action, activity: a.label, scene: a.scene, description: a.description, until })
    const moved = { ...person, action: a.action, activity: a.label, scene: a.scene, description: a.description }
    if (a.indoors && !inside) onEnter?.({ ...moved, x: person.resident.home.x, y: person.resident.home.y, visible: false })
    else if (!a.indoors && inside) onExit?.({ ...moved, x: (person.resident.post ?? person.resident.home).x, y: (person.resident.post ?? person.resident.home).y, visible: true })
  }
  // A message that clearly asks for something on offer: a real yes/no.
  const request = async (said: string, wanted: ChatAction[]) => {
    const next = [...messages, { role: 'user' as const, content: said }].slice(-16), id = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    // The model sees the player's words plus a short game note; the log keeps only the words.
    const sent = [...next.slice(0, -1), { role: 'user' as const, content: said + actionRequestInstruction(person, wanted) }]
    const pick = wanted[Math.floor(Math.random() * wanted.length)]
    const fallback = Math.random() < 0.15 ? 'NO\nMaybe a little later.' : `YES\n${pick.indoors && inside === false ? 'Sure, come on in.' : !pick.indoors && inside ? 'Good idea, let’s step out.' : 'Alright, why not.'}`
    const reply = await withTimeout(conversationReply(residentPrompt(person, groggy), sent, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (id !== serial.current) return
    const parsed = parseActionRequest(reply.text, reply.text === fallback ? [pick] : wanted)
    setMessages([...next, { role: 'assistant', content: parsed.text }]); setNotice(reply.notice); setBusy(false)
    if (parsed.granted && parsed.action) apply(parsed.action)
  }
  const send = async (text: string) => {
    if (!text.trim() || busy) return
    const said = text.trim().slice(0, 1000)
    const wanted = isPinned ? requestedActions(said, person) : undefined
    if (wanted?.length) { void request(said, wanted); return }
    const next = [...messages, { role: 'user' as const, content: said }].slice(-16), id = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    const fallback = (groggy ? '*still half-asleep* ' : '') + residentReply(person, text, alreadyMet.current, groggy)
    const system = residentPrompt(person, groggy) + (isPinned ? chatActionSuffix(person) : '')
    const reply = await withTimeout(conversationReply(system, next, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (id !== serial.current) return
    const parsed = isPinned ? parseChatAction(reply.text, person) : { text: reply.text, action: undefined }
    setMessages([...next, { role: 'assistant', content: parsed.text }]); setNotice(reply.notice); setBusy(false)
    if (parsed.action) apply(parsed.action)
  }
  const decide = async (ask: 'next' | 'enter') => {
    if (busy) return
    const question = ask === 'enter' ? 'Can I come in?' : 'What will you do next?'
    const next = [...messages, { role: 'user' as const, content: question }].slice(-16), id = ++serial.current
    setMessages(next); setBusy(true); setNotice('')
    const fallback = residentDecisionFallback(person, ask)
    const reply = await withTimeout(conversationReply(residentDecisionPrompt(person, ask), next, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (id !== serial.current) return
    const decision = parseResidentDecision(reply.text, ask, person.resident, person)
    setMessages([...next, { role: 'assistant', content: decision.say }]); setNotice(reply.notice); setBusy(false)
    if (ask === 'enter' && !decision.granted) return
    apply({ indoors: decision.indoors, action: decision.action ?? (decision.indoors ? 'resting' : 'chatting'), label: decision.activity ?? (decision.indoors ? 'Indoors' : 'Out and about'), scene: decision.scene, description: decision.description })
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
    <header><div><h2>{person.resident.name} <span>· {person.resident.role}</span></h2><p>{person.activity} <span className="activity-tag">{person.action}</span></p></div><button className="resident-chat-clear" disabled={messages.length < 2} title="Start this conversation over" onClick={clearChat}>Clear</button><button aria-label="Close conversation" onClick={onClose}>×</button></header>
    <div className="resident-messages" aria-live="polite">{messages.map((m, i) => <p key={i} className={m.role}><ChatText text={m.content} /></p>)}{busy && <p>Thinking…</p>}<div ref={end}/></div>
    {notice && <p className="conversation-notice" role="status">{notice}</p>}
    <div className="conversation-topics">{TALK_TOPICS.map(topic => <button key={topic} disabled={busy} onClick={() => void send(topic)}>{topic}</button>)}</div>
    {isPinned && <div className="conversation-topics">
      <button disabled={busy} onClick={() => void decide('next')}>What will you do next?</button>
      {canAskEnter && <button disabled={busy} onClick={() => void decide('enter')}>Can I come in?</button>}
      {canAskExit && <button disabled={busy} onClick={() => void send('Shall we head outside?')}>Shall we head outside?</button>}
    </div>}
    <form onSubmit={e => { e.preventDefault(); void send(draft) }}><input autoFocus value={draft} maxLength={1000} onChange={e => setDraft(e.target.value)} placeholder="Say something…" aria-label="Message neighbour"/><button disabled={busy || !draft.trim()}>Send</button></form>
    <footer>{mode === 'ollama' ? 'Local conversation' : 'Offline conversation · Enable Ollama in Mira’s settings for open-ended chat'}</footer>
  </aside>
}
