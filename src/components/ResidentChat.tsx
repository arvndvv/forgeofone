import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { conversationReply, generateJSON, useLocalAI } from '../services/localAI'
import { residentReply, residentPrompt, TALK_TOPICS, chatActions, requestedActions, intentPrompt, intentTranscript, intentSchema, parseIntent, outcomeNote, cleanReply, type ChatAction, type ChatIntent } from '../world/conversations'
import type { ResidentPosition } from '../world/residents'
import { ResidentPortrait } from './ResidentPortrait'
import { ChatText } from './ChatText'

// Belt-and-suspenders: the backend already times out (45s), but this makes
// sure 'Thinking...' -- and the buttons disabled while busy -- can never
// outlast this no matter what the model/bridge does, so the panel is
// always closable and never looks hung.
/** Dev-only trace of every resident model call: open DevTools (View ->
 *  Toggle Developer Tools) and filter the console by "[resident]" to see
 *  the exact prompt, the raw reply and what the game did with it. */
function trace(kind: string, said: string, system: string, raw: string, result: string) {
  if (!import.meta.env.DEV) return
  console.groupCollapsed(`[resident] ${kind}: "${said.slice(0, 60)}" -> ${result}`)
  console.log('system prompt:\n' + system)
  console.log('raw reply:\n' + raw)
  console.groupEnd()
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(onTimeout), ms)
    promise.then(v => { clearTimeout(timer); resolve(v) }, () => { clearTimeout(timer); resolve(onTimeout) })
  })
}

const UNTIL_STOP = /\b(till|until)\b[^.?!]{0,20}\bstop\b|\bkeep (on |at it|going|reading|doing)/i
const WHAT_NEXT = /\bwhat('?s| is| are| will| would)?\b[^.?!]{0,20}\b(next|do now|doing next|up to next)\b|\byou (choose|pick|decide)\b/i
const STOP_NOW = /^\s*(ok(ay)?[,!.]?\s*)?(stop|you can stop|that'?s enough|enough|alright,? stop|done)\b/i

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
  // Same side of the door first: when a request fits both ("read a book"),
  // staying put is the natural pick, for the model and the keyword matcher.
  const options = isPinned ? chatActions(person).sort((a, b) => Number(a.indoors !== inside) - Number(b.indoors !== inside)) : []
  const canAskEnter = isPinned && !inside && person.action !== 'home' && options.some(a => a.indoors)
  const canAskExit = isPinned && inside && options.some(a => !a.indoors)
  // Make a chosen activity real: override where they are / what they do,
  // and take the player along when it crosses the door.
  // `long`: "read till I say stop" -- holds for most of a day, until the
  // player says stop (see send) instead of the usual hour or two.
  const apply = (a: Pick<ChatAction, 'indoors' | 'action' | 'label' | 'scene' | 'description'>, long = false) => {
    const now = useGameStore.getState().simMinutesTotal
    const until = now + (long ? 16 * 60 : 90 + Math.floor(Math.random() * 90))
    useGameStore.getState().setResidentOverride(person.resident.id, { indoors: a.indoors, action: a.action, activity: a.label, scene: a.scene, description: a.description, until })
    const moved = { ...person, action: a.action, activity: a.label, scene: a.scene, description: a.description }
    if (a.indoors && !inside) onEnter?.({ ...moved, x: person.resident.home.x, y: person.resident.home.y, visible: false })
    else if (!a.indoors && inside) onExit?.({ ...moved, x: (person.resident.post ?? person.resident.home).x, y: (person.resident.post ?? person.resident.home).y, visible: true })
  }
  // The last request they turned down -- only used by the offline keyword
  // matcher, so "now please" / "come on" can ask again. (With a model
  // connected the intent step reads the whole conversation instead.)
  const pending = useRef<ChatAction[] | null>(null)
  const activeOverride = () => {
    const o = useGameStore.getState().residentOverrides[person.resident.id]
    return o && o.until > useGameStore.getState().simMinutesTotal ? o : undefined
  }
  // Offline stand-in for the intent step.
  const keywordIntent = (said: string): ChatIntent => {
    const insisting = /^\s*(now|please|pls|plz|pretty please|come on|go on|ok|okay|yes|yeah|sure|let'?s go|why not|just for a bit|i insist)\b/i.test(said) || (said.length <= 30 && /\b(please|pls|now|insist)\b/i.test(said))
    const still = pending.current?.filter(a => options.some(o => o.label === a.label))
    const wanted = requestedActions(said, person) ?? (insisting && still?.length ? still : undefined)
    const here = options.filter(o => o.indoors === inside && o.action !== 'sleeping')
    const picked = WHAT_NEXT.test(said) && here.length ? here[Math.floor(Math.random() * here.length)] : undefined
    return { action: wanted?.[Math.floor(Math.random() * wanted.length)], agree: Math.random() >= 0.15, reason: '', untilStop: UNTIL_STOP.test(said), stop: STOP_NOW.test(said), picked }
  }
  // Every message to a pinned resident: work out what it asks for (intent
  // step), decide it, then get a reply that matches what actually happens.
  // `fromButton`: "What will you do next?" pressed -- they always choose
  // something, even if the model left `picks` at 0.
  const talk = async (said: string, fromButton = false) => {
    const next = [...messages, { role: 'user' as const, content: said }].slice(-16), id = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    const ip = intentPrompt(person, options), transcript = intentTranscript(person, next)
    const raw = await withTimeout(generateJSON(ip, transcript, 160, { schema: intentSchema(options), temperature: 0.2 }), 15000, null)
    if (id !== serial.current) return
    const intent = parseIntent(raw, options) ?? keywordIntent(said)
    if (fromButton && !intent.action && !intent.picked) {
      const here = options.filter(o => o.indoors === inside && o.action !== 'sleeping')
      intent.picked = here[Math.floor(Math.random() * here.length)]
    }
    let chosen: ChatAction | undefined, note = '', fallback = ''
    if (intent.stop && activeOverride()) {
      // Something else on the same side of the door, so stopping never
      // teleports them out of the room you're both standing in.
      const here = options.filter(o => o.indoors === inside && o.action !== 'sleeping')
      chosen = here[Math.floor(Math.random() * here.length)]
      if (chosen) { note = outcomeNote(person, { kind: 'stop', action: chosen }); fallback = `*stops and stretches* Alright, that's enough of that.` }
    } else if (intent.action && intent.agree) {
      chosen = intent.action
      note = outcomeNote(person, { kind: 'agree', action: chosen, untilStop: intent.untilStop })
      fallback = chosen.indoors && !inside ? '*opens the door* Sure, come on in.' : !chosen.indoors && inside ? '*heads for the door* Good idea, let’s step out.' : `*${chosen.label.charAt(0).toLowerCase() + chosen.label.slice(1)}* Alright, why not.`
    } else if (intent.action) {
      note = outcomeNote(person, { kind: 'decline', action: intent.action, reason: intent.reason })
      fallback = intent.reason ? `Not just yet, friend -- ${intent.reason.charAt(0).toLowerCase() + intent.reason.slice(1)}` : '*glances back at what they were doing* Not just yet, friend. Give me a little while.'
    } else if (intent.picked) {
      chosen = intent.picked
      note = outcomeNote(person, { kind: 'pick', action: chosen })
      fallback = `*thinks for a moment* I think I'll get on with ${chosen.label.charAt(0).toLowerCase() + chosen.label.slice(1)}.`
    }
    pending.current = intent.action && !intent.agree ? [intent.action] : null
    if (!fallback) fallback = (groggy ? '*still half-asleep* ' : '') + residentReply(person, said, alreadyMet.current, groggy)
    // The model sees the neighbour's words plus the unseen scene note; the log keeps only the words.
    const sent = note ? [...next.slice(0, -1), { role: 'user' as const, content: said + note }] : next
    const system = residentPrompt(person, groggy)
    const reply = await withTimeout(conversationReply(system, sent, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (id !== serial.current) return
    const outcome = intent.stop && chosen ? `stop -> ${chosen.label}` : chosen && chosen === intent.picked && !intent.action ? `picked -> ${chosen.label}` : chosen ? `do -> ${chosen.label}${intent.untilStop ? ' (until stop)' : ''}` : intent.action ? `declined ${intent.action.label}` : 'nothing asked'
    trace('intent', said, ip + '\n\n--- transcript ---\n' + transcript, raw ? JSON.stringify(raw) : '(no model / failed -> keyword matcher)', outcome)
    trace('reply', said, system + (note ? '\n\n[appended to message]' + note : ''), reply.text, outcome)
    setMessages([...next, { role: 'assistant', content: cleanReply(reply.text) }]); setNotice(reply.notice); setBusy(false)
    if (chosen) apply(chosen, !!intent.untilStop && !intent.stop)
  }
  const send = async (text: string, fromButton = false) => {
    if (!text.trim() || busy) return
    const said = text.trim().slice(0, 1000)
    if (isPinned && options.length) { void talk(said, fromButton); return }
    const next = [...messages, { role: 'user' as const, content: said }].slice(-16), id = ++serial.current
    setMessages(next); setDraft(''); setBusy(true); setNotice('')
    const fallback = (groggy ? '*still half-asleep* ' : '') + residentReply(person, text, alreadyMet.current, groggy)
    const system = residentPrompt(person, groggy)
    const reply = await withTimeout(conversationReply(system, next, fallback), 20000, { text: fallback, notice: 'That took too long. Showing an offline reply.' })
    if (id !== serial.current) return
    trace('chat', said, system, reply.text, 'not a pinned resident')
    setMessages([...next, { role: 'assistant', content: cleanReply(reply.text) }]); setNotice(reply.notice); setBusy(false)
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
      <button disabled={busy} onClick={() => void send('What will you do next?', true)}>What will you do next?</button>
      {canAskEnter && <button disabled={busy} onClick={() => void send('Can I come in?')}>Can I come in?</button>}
      {canAskExit && <button disabled={busy} onClick={() => void send('Shall we head outside?')}>Shall we head outside?</button>}
    </div>}
    <form onSubmit={e => { e.preventDefault(); void send(draft) }}><input autoFocus value={draft} maxLength={1000} onChange={e => setDraft(e.target.value)} placeholder="Say something…" aria-label="Message neighbour"/><button disabled={busy || !draft.trim()}>Send</button></form>
    <footer>{mode === 'ollama' ? 'Local conversation' : 'Offline conversation · Enable Ollama in Mira’s settings for open-ended chat'}</footer>
  </aside>
}
