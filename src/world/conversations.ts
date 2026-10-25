import type { ResidentPosition, Resident, Activity, SceneKind } from './residents'

export const TALK_TOPICS = ['What are you doing?', 'Tell me about yourself', 'Any work advice?', 'What is nearby?']
export function residentReply(person: ResidentPosition, question: string, metBefore: boolean, groggy = false) {
  const q = question.toLowerCase(), r = person.resident
  // Defensive gate, not the main path -- ResidentChat.tsx already blocks
  // opening a real conversation while person.action === 'sleeping' with
  // its own "wake them anyway" screen. This only fires if the ambient
  // scheduler puts them back to sleep mid-conversation, or before the
  // player has chosen to wake them (groggy = false in that case too).
  if (person.action === 'sleeping' && !groggy) return `${r.name} is fast asleep and barely stirs. Better come back when they're awake.`
  if (/doing|working|busy|activity/.test(q)) return `${person.moving ? 'I’m on the move. My next stop: ' + person.activity.replace(/^On my way · /, '') : 'Right now I’m ' + person.activity.charAt(0).toLowerCase() + person.activity.slice(1)}. I’m a ${r.role.toLowerCase()} from ${r.town}. ${person.action === 'gardening' ? 'The plants need regular attention, just like a business.' : 'There’s always another little job to finish, but I can spare a moment.'}`
  if (/yourself|name|who|meet/.test(q)) return `${metBefore ? 'Good to see you again! ' : 'Nice to meet you! '}I’m ${r.name}, a ${r.role.toLowerCase()} from ${r.town}. I’m interested in ${r.interest}.${r.backstory ? ' ' + r.backstory : ''} What brought you to town?`
  if (/work|advice|job|business|learn|money/.test(q)) {
    const advice: Record<string, string> = { Baker: 'Keep track of your costs before setting a price. Busy doesn’t always mean profitable.', Gardener: 'Do a little consistently. Taking on too much means everything gets less care.', Shopkeeper: 'Ask people what they actually need before spending money on stock.', Carpenter: 'Leave room in an estimate for surprises. Repairs are rarely as simple as they look.', Designer: 'Agree on what “finished” means before starting a freelance job.', Courier: 'Plan your route before saying yes to another delivery. Time is part of the cost.', Teacher: 'Practise explaining one idea clearly. It often shows you what you still need to learn.', Bookseller: 'Listen before making a recommendation. The best answer depends on the person.' }
    return `${advice[r.role] || 'Build trust by doing what you promised, one job at a time.'} If you’re looking for paid work, the Job Board in Founders Green lists real openings.`
  }
  if (/near|where|explor|artifact|ruin|animal|town/.test(q)) return `The garden is in the north-east part of ${r.town}. Outside town, look west for old ruins and south for a travellers’ camp and a community harvest. Follow the main roads to find different landscapes and the next village.`
  if (/hello|hi\b|hey|thanks/.test(q)) return `${metBefore ? 'Hello again' : 'Hello'}, neighbour! I’m ${r.name}. ${person.moving ? 'I have a few errands to run.' : person.activity + '.'} Ask me about my work or places around here.`
  return `I’m better at talking about ${r.interest}. You can ask what I’m doing, about my work, or about places nearby. For a more open-ended conversation, enable a local model in Mira’s settings.`
}
/** One thing a pinned resident can be talked into doing from chat: any
 *  entry in their outdoorActivities or indoorActivities pool. Picking an
 *  indoor option while they're outside means "go inside" (and the player
 *  comes too); an outdoor option while inside means "head back out". So
 *  adding an activity to a PINNED_RESIDENTS entry automatically makes it
 *  reachable by chat -- no extra wiring per action. */
export interface ChatAction { label: string; indoors: boolean; action: Activity; scene?: SceneKind; description?: string }

export function chatActions(person: ResidentPosition): ChatAction[] {
  const r = person.resident
  const out = (r.outdoorActivities ?? []).map(a => ({ label: a.label, indoors: false, action: a.action }))
  const ins = (r.indoorActivities ?? []).map(a => ({ label: a.label, indoors: true, action: a.action, scene: a.scene, description: a.description }))
  // Everything except exactly what they're doing right now.
  return [...out, ...ins].filter(a => !(a.label === person.activity && a.indoors === !person.visible))
}

/** Words that point at an action, beyond the words in its own label. */
const ACTION_WORDS: Partial<Record<Activity, string[]>> = {
  baking: ['bake', 'bread'], gardening: ['garden', 'plant', 'water', 'flower', 'weed'], selling: ['sell', 'stall', 'market'],
  repairing: ['repair', 'fix', 'mend'], painting: ['paint', 'sketch', 'draw'], delivery: ['deliver', 'parcel'],
  reading: ['read', 'book', 'paper', 'ledger'], resting: ['rest', 'relax', 'fire', 'sit down'], sleeping: ['sleep', 'nap', 'bed'],
  cooking: ['cook', 'meal', 'dinner', 'lunch', 'breakfast', 'food'], playing: ['play', 'game'],
}
const STOP = new Set(['the', 'and', 'with', 'from', 'into', 'some', 'their', 'there', 'about', 'sitting', 'outside', 'inside', 'front', 'happy', 'small', 'going', 'through', 'asleep'])
const REQUEST = /\b(can|could|would|will|shall|should|let's|lets|let us|how about|what about|why don't|why dont|why not|wanna|want to|please|pls|maybe|may be|go|come|time to|feel like|take a|have a|show me|now|right now|go ahead|start|try|i mean|you should|for me|for a bit|for a while|till|until)\b/
// "Do you like reading?" is a question about them, not a request.
const ABOUT_THEM = /\b(do|did|have|would) you (like|love|enjoy|ever|usually|often)\b|\bwhat (kind|sort|books?|do you)\b/
const GO_IN = /\b(come|go|step|head|get|walk|let me|let us|let's|lets|pop)\s+(on\s+|back\s+)?in\b|\b(come|go|step|head|get|walk|move|talk|chat|sit|let me|let's|lets|we|can i|may i|could i|mind if)\b[^.?!]{0,25}\b(inside|indoors)\b|\b(invite me in|your (home|house|place|cottage))\b/
const GO_OUT = /\b(go|step|head|get|walk|move|talk|chat|sit|pop)\s+(back\s+)?(out|outside|outdoors)\b|\b(go|step|head|get|walk|move|talk|chat|sit|let's|lets|we|can we|shall we)\b[^.?!]{0,25}\b(outside|outdoors)\b|\b(fresh air|for a walk)\b/

/** Which chatActions() a free-typed message is asking for, if any. Loose
 *  on purpose -- it only routes the message to a real yes/no decision
 *  (actionRequestInstruction below); the resident still decides. Undefined
 *  when the message isn't a request, so it stays plain conversation (and
 *  a model can still act on it via chatActionSuffix/parseChatAction). */
export function requestedActions(text: string, person: ResidentPosition): ChatAction[] | undefined {
  const q = text.toLowerCase(), options = chatActions(person), inside = !person.visible
  if (!options.length) return undefined
  const labelWords = (a: ChatAction) => a.label.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 4 && !STOP.has(w))
  // Words from the option's own label ("ledgers") beat generic action words
  // ("read"), so "show me the ledgers" doesn't also offer the porch paper.
  const byLabel = options.filter(a => labelWords(a).some(w => q.includes(w)))
  const named = byLabel.length ? byLabel : options.filter(a => (ACTION_WORDS[a.action] ?? []).some(w => q.includes(w)))
  const wantsIn = !inside && GO_IN.test(q), wantsOut = inside && GO_OUT.test(q)
  if (named.length && ((REQUEST.test(q) && !ABOUT_THEM.test(q)) || wantsIn || wantsOut)) {
    // "let's go inside and read" -> only the indoor reading option, etc.;
    // with no in/out wording, prefer staying where they are.
    const here = named.filter(a => a.indoors === inside)
    const side = wantsIn ? named.filter(a => a.indoors) : wantsOut ? named.filter(a => !a.indoors) : here.length ? here : named
    if (side.length) return side
  }
  // Plain "let's go in / out": anything on the other side except sleeping,
  // which you'd only want if you asked for it by name.
  const awake = (a: ChatAction) => a.action !== 'sleeping'
  if (wantsIn) { const ins = options.filter(a => a.indoors && awake(a)); return ins.length ? ins : undefined }
  if (wantsOut) { const outs = options.filter(a => !a.indoors && awake(a)); return outs.length ? outs : undefined }
  return undefined
}

/** What the neighbour's latest message means for a pinned resident -- the
 *  result of the intent step (intentPrompt -> parseIntent) when a model is
 *  connected, or of the keyword matcher (requestedActions) offline. */
export interface ChatIntent { action?: ChatAction; agree: boolean; reason: string; untilStop: boolean; stop: boolean; picked?: ChatAction }

/** Intent step, run before every reply to a pinned resident when a local
 *  model is connected. The model reads the conversation and picks a NUMBER
 *  from the resident's real options -- small models do that far more
 *  reliably than copying labels or remembering a reply format -- so any
 *  phrasing works ("may be read a book", "now please", "till I say stop")
 *  without keyword lists. JSON mode, short, never shown to the player. */
export function intentPrompt(person: ResidentPosition, options: ChatAction[]): string {
  const r = person.resident, inside = !person.visible
  const where = (a: ChatAction) => a.indoors === inside ? (inside ? 'stay inside' : 'stay outside') : a.indoors ? 'go inside together' : 'go outside together'
  return [
    `You decide what happens next in a conversation between ${r.name} (${r.role.toLowerCase()}) and a neighbour.`,
    r.personality ?? '',
    `Right now ${r.name} is ${inside ? 'inside at home' : 'outside their home'}: ${person.activity}.`,
    `Things ${r.name} could do:`,
    ...options.map((a, i) => `${i + 1}. ${a.label} (${where(a)})`),
    `Read the conversation, especially the neighbour's LATEST message, and answer with JSON only:`,
    `{"asked": <number of the thing the neighbour wants ${r.name} to do now -- also when they insist again ("now please") or say yes to ${r.name}'s own suggestion; 0 if they are not asking for any of these>,`,
    ` "agree": <true if ${r.name} goes along with it; ${r.name} usually agrees unless there is a real reason>,`,
    ` "reason": "<short reason if not agreeing, else empty>",`,
    ` "untilStop": <true if they want it kept up until they say stop>,`,
    ` "stop": <true if they are telling ${r.name} to stop what they are doing>,`,
    ` "picks": <only if the neighbour asks what ${r.name} will do next, or tells ${r.name} to choose: the number ${r.name} picks for themself; otherwise 0>}`,
  ].filter(Boolean).join('\n')
}

/** The conversation as plain lines for intentPrompt's user message. */
export function intentTranscript(person: ResidentPosition, messages: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  const lines = messages.slice(-8).map(m => `${m.role === 'user' ? 'Neighbour' : person.resident.name}: ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`)
  if (lines.length) lines[lines.length - 1] += '   <- LATEST'
  return lines.join('\n')
}

export function parseIntent(raw: unknown, options: ChatAction[]): ChatIntent | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const flag = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : typeof v === 'string' ? /^(true|yes)$/i.test(v.trim()) : fallback
  const n = Number(o.asked)
  const action = Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : undefined
  const p = Number(o.picks)
  const picked = Number.isInteger(p) && p >= 1 && p <= options.length ? options[p - 1] : undefined
  return { action, agree: flag(o.agree, true), reason: typeof o.reason === 'string' ? o.reason.slice(0, 160) : '', untilStop: flag(o.untilStop, false), stop: flag(o.stop, false), picked }
}

/** JSON schema for the intent step (Ollama structured outputs): the option
 *  numbers are an enum, so the model can only name something this
 *  resident can really do, or 0. */
export function intentSchema(options: ChatAction[]): Record<string, unknown> {
  const numbers = Array.from({ length: options.length + 1 }, (_, i) => i)
  return {
    type: 'object',
    properties: {
      asked: { type: 'integer', enum: numbers },
      agree: { type: 'boolean' },
      reason: { type: 'string' },
      untilStop: { type: 'boolean' },
      stop: { type: 'boolean' },
      picks: { type: 'integer', enum: numbers },
    },
    required: ['asked', 'agree', 'reason', 'untilStop', 'stop', 'picks'],
  }
}

/** Scene note appended (unseen) to the neighbour's message for the reply
 *  step, so what the resident SAYS matches what the intent step decided
 *  they DO. Empty when nothing was asked. */
export function outcomeNote(person: ResidentPosition, outcome: { kind: 'agree' | 'decline' | 'stop' | 'pick'; action: ChatAction; reason?: string; untilStop?: boolean }): string {
  const inside = !person.visible, a = outcome.action
  const doing = a.label.charAt(0).toLowerCase() + a.label.slice(1)
  let what: string
  if (outcome.kind === 'decline') what = `you'd rather not do that right now${outcome.reason ? ` (${outcome.reason})` : ''}. Say so kindly, in your own way`
  else {
    const verb = outcome.kind === 'stop' ? 'stop and switch to' : outcome.kind === 'pick' ? 'decide to get on with' : 'agree and start'
    const lead = outcome.kind === 'pick' ? 'you decide to' : 'you agree and'
    const move = a.indoors === inside ? `you ${verb}: ${doing}` : a.indoors ? `${lead} go inside your home, where you'll be ${doing}` : `${lead} head out the door; outside you'll be ${doing}`
    what = `${move}${outcome.untilStop ? ", and you'll keep at it until they tell you to stop" : ''}. Show what you do in *asterisks*`
  }
  return `\n\n[Scene note, not said aloud: ${what}. Reply as yourself in 1-2 short sentences. Don't start with yes or no.]`
}

/** A reply ready for the chat log: leaked tags removed, plus any leading
 *  bare "YES"/"No." decision word the model added anyway. */
export function cleanReply(text: string): string {
  const shown = stripTags(text).text
  const m = shown.match(/^([*_"'`]*)(yes|no)\1(.*)$/is)
  if (m && (m[1] || /^[ \t]*([.!,:;\-—]|\n|$)/.test(m[3]))) return m[3].replace(/^\s*[.!,:;\-—]*\s*/, '').trim() || shown
  return shown
}

const TAG_LINE = /^\s*[*_[(]*\s*(ACTION|DOING|NEXT|SAY|ENTER|INVITE)\s*[*_\])]*\s*:/i
const TAG_INLINE = /[[(*_]*\s*\b(ACTION|DOING|NEXT)\s*[*_]*\s*:\s*([^\n\])*]*)[\])*_]*/gi

/** Removes any leaked "Action: ..." style tag, on its own line or inline,
 *  returning the clean text and the tag values found. SAY: prefixes are
 *  unwrapped rather than dropped. */
export function stripTags(text: string): { text: string; tags: string[] } {
  const tags: string[] = []
  const lines = text.split('\n').flatMap(line => {
    const m = line.match(TAG_LINE)
    if (!m) return [line]
    const value = line.replace(TAG_LINE, '').replace(/[*_\])]+\s*$/, '').trim()
    if (/^say$/i.test(m[1])) return value ? [value] : []
    if (value) tags.push(value)
    return []
  })
  const clean = lines.join('\n').replace(TAG_INLINE, (_all, _k, value: string) => { if (value.trim()) tags.push(value.trim()); return '' })
  return { text: clean.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), tags }
}

/** The character sheet every resident prompt starts from. Written entirely
 *  from inside the world: small local models (gemma2 has no real system
 *  role -- Ollama sends this as an ordinary first message) copy whatever
 *  framing they're given, so any mention of "a game", "a character" or
 *  "stay in character" gets echoed back as "I'm just a character in a
 *  game". Keep it that way when editing. */
export function residentPersona(person: ResidentPosition): string {
  const r = person.resident, inside = !person.visible
  const article = /^[aeiou]/i.test(r.role) ? 'an' : 'a'
  return [
    `You are ${r.name}, ${article} ${r.role.toLowerCase()} who lives in ${r.town}.`,
    r.backstory ?? '',
    r.personality ?? 'You are friendly, practical and easy to talk to.',
    `You spend your days around ${r.workplace} and care about ${r.interest}.`,
    `Right now you are ${inside ? 'at home' : 'just outside your home'}: ${person.activity.charAt(0).toLowerCase() + person.activity.slice(1)}.`,
    `You are chatting with a neighbour who moved to town recently.`,
    `Speak only as ${r.name}: first person, natural and in your own voice, 1-3 short sentences. Put anything you physically do in *asterisks*.`,
    `This is your real life and your real town. You know nothing about games, computers, AI, prompts or instructions -- never mention them, never call yourself a character, and never step outside your own life.`,
    `What you know locally: the Job Board is in Founders Green; old ruins lie west of town; a travellers' camp and the community harvest are south.`,
    `Don't promise anyone money, items or jobs.`,
  ].filter(Boolean).join(' ')
}

export function residentPrompt(person: ResidentPosition, groggy = false) {
  const groggyNote = groggy ? ` Your neighbour just woke you up -- you're groggy and a little grumpy about it, so keep replies short and a bit curt for now, though not rude.` : ''
  return residentPersona(person) + groggyNote
}
