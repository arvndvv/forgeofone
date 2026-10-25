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
const REQUEST = /\b(can|could|would|will|shall|should|let's|lets|let us|how about|what about|why don't|why dont|why not|wanna|want to|please|maybe|go|come|time to|feel like|take a|have a|show me)\b/
const GO_IN = /\b(come|go|step|head|get|walk|let me|let us|let's|lets|pop)\s+(on\s+|back\s+)?in\b|\b(come|go|step|head|get|walk|move|talk|chat|sit|let me|let's|lets|we|can i|may i|could i|mind if)\b[^.?!]{0,25}\b(inside|indoors)\b|\b(invite me in|your (home|house|place|cottage))\b/
const GO_OUT = /\b(go|step|head|get|walk|move|talk|chat|sit|pop)\s+(back\s+)?(out|outside|outdoors)\b|\b(go|step|head|get|walk|move|talk|chat|sit|let's|lets|we|can we|shall we)\b[^.?!]{0,25}\b(outside|outdoors)\b|\b(fresh air|for a walk)\b/

/** Which chatActions() a free-typed message is asking for, if any. Loose
 *  on purpose -- it only routes the message to a real yes/no decision
 *  (residentActionPrompt below); the resident still decides. Undefined
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
  if (named.length && (REQUEST.test(q) || wantsIn || wantsOut)) {
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

const describe = (a: ChatAction, person: ResidentPosition) =>
  `${a.label}${a.indoors !== !person.visible ? (a.indoors ? ' (go inside together)' : ' (head back outside together)') : ''}`

/** Prompt for a message that IS a request (see requestedActions): agree
 *  to one of `options` or decline, in character. Same KEY: value shape as
 *  residentDecisionPrompt so one parser handles model and fallback. */
export function residentActionPrompt(person: ResidentPosition, options: ChatAction[]): string {
  const r = person.resident
  const backstory = r.backstory ? ` Background: ${r.backstory}` : ''
  return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One.${backstory} You are ${person.visible ? 'outside' : 'inside your home'}: ${person.activity}. The player's latest message asks you to do something. Decide, in character, whether you agree -- usually yes, unless declining genuinely fits you right now. Options, copy one exactly: ${options.map(a => describe(a, person)).join('; ')}. Reply on separate lines, exactly: "ACTION: <chosen option>" or "ACTION: none", then "SAY: <one or two short in-character sentences replying to the player>". No other text.`
}

export function residentActionFallback(options: ChatAction[]): string {
  if (!options.length || Math.random() < 0.15) return 'ACTION: none\nSAY: Maybe a little later.'
  const pick = options[Math.floor(Math.random() * options.length)]
  return `ACTION: ${pick.label}\nSAY: ${pick.indoors ? 'Sure, ' : 'Alright, '}why not.`
}

/** Instruction appended to the player's own message (only in what's sent
 *  to the model, never shown) when requestedActions() says it's a request.
 *  Small local models ignore format rules in the system prompt once a chat
 *  has some history, but reliably follow one in the latest user turn -- and
 *  a bare YES/NO first line is the one format they get right. Which option
 *  they end up doing is picked in code (parseActionRequest), not by them. */
export function actionRequestInstruction(person: ResidentPosition, wanted: ChatAction[]): string {
  const inside = !person.visible
  const crossing = wanted.every(a => a.indoors !== inside)
  const what = crossing
    ? (inside ? 'to head back outside together with them' : 'to go inside your home together with them')
    : `for you to switch to: ${wanted.map(a => a.label).join(' / ')}`
  return `\n\n(Game note, not spoken by the player: you are currently ${inside ? 'INSIDE your home' : 'OUTSIDE'}. The player is asking ${what}. Decide in character. Your first line must be exactly YES or NO. Then one or two short in-character sentences that match that decision${crossing ? (inside ? ' -- if YES, you are heading out the door now' : ' -- if YES, you are leading them in now') : ''}.)`
}

const AGREE = /\b(yes|yeah|sure|of course|certainly|absolutely|alright|all right|okay|ok|gladly|why not|come on in|let's go|lets go|follow me|after you|right this way|with pleasure|i'd love|i would love|good idea|sounds good|happy to)\b/i
const DECLINE = /\b(no|nope|not now|not right now|not today|another time|maybe later|rather not|i'd rather|i would rather|can't|cannot|won't|sorry)\b/i

/** Reads a reply to actionRequestInstruction(): YES/NO from the first line,
 *  or, when the model skipped it, a best guess from the prose itself.
 *  Picks which of `wanted` to do -- the one the reply mentions most, else
 *  the first -- so the model never has to copy a label exactly. */
export function parseActionRequest(text: string, wanted: ChatAction[]): { granted: boolean; action?: ChatAction; text: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const head = (lines[0] ?? '').replace(/[*_"'`.!:]/g, '').trim().toLowerCase()
  let granted: boolean | undefined
  let body = lines
  if (/^(yes|no)\b/.test(head)) {
    granted = head.startsWith('yes')
    const rest = lines[0].replace(/^[*_"'`\s]*(yes|no)[*_"'`.!:,\s-]*/i, '').trim()
    body = rest ? [rest, ...lines.slice(1)] : lines.slice(1)
  }
  const shown = stripTags(body.join('\n')).text
  if (granted === undefined) {
    const agrees = AGREE.test(shown), declines = DECLINE.test(shown)
    granted = agrees || !declines
  }
  if (!granted) return { granted: false, text: shown || 'Maybe a little later.' }
  const lower = shown.toLowerCase()
  const score = (a: ChatAction) => a.label.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && lower.includes(w)).length
  const action = [...wanted].sort((a, b) => score(b) - score(a))[0]
  return { granted: true, action, text: shown || 'Alright.' }
}

/** Extra instructions for an ordinary chat reply. Rather than a machine
 *  tag (small models leak it into the chat, or name things that don't
 *  exist), the model narrates what it physically does in *asterisks* --
 *  which reads naturally, is styled in the chat (ChatText), and is matched
 *  back to a real activity by parseChatAction() below. */
export function chatActionSuffix(person: ResidentPosition): string {
  const options = chatActions(person)
  if (!options.length) return ''
  return ` When you physically do something, describe it briefly in *asterisks*, e.g. *picks up the paper*. If the player asks you to do something and you agree, or you decide to on your own, actually do it in asterisks. Things you can do right now: ${options.map(a => describe(a, person)).join('; ')}. Never write labels like "Action:" -- just speak and act in character.`
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

/** *Stage directions* in a reply, without the asterisks. */
export const emotes = (text: string) => [...text.matchAll(/\*{1,2}([^*\n]+)\*{1,2}/g)].map(m => m[1].trim())

const DOOR_IN = /\b(inside|indoors|in the door|the door|leads you in|steps in|heads in|goes in|ushers you)\b/i
const DOOR_OUT = /\b(outside|outdoors|out the door|the door|steps out|heads out|goes out|fresh air)\b/i

/** Best real activity for a free-form phrase ("picks up the paper",
 *  "reading" from a stray tag). Only actions this resident actually has
 *  can come back; anything else is ignored. Crossing the door needs door
 *  wording (or an explicit tag, `allowCross`). */
export function matchAction(phrase: string, person: ResidentPosition, allowCross = false): ChatAction | undefined {
  const q = phrase.toLowerCase(), inside = !person.visible
  const cross = allowCross || (inside ? DOOR_OUT.test(q) : DOOR_IN.test(q))
  let best: ChatAction | undefined, bestScore = 0
  for (const a of chatActions(person)) {
    if (a.indoors !== inside && !cross) continue
    const label = a.label.toLowerCase()
    if (label === q.trim()) return a
    let score = a.label.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !STOP.has(w) && q.includes(w)).length * 2
    score += (ACTION_WORDS[a.action] ?? []).filter(w => q.includes(w)).length
    if (q.includes(a.action.replace(/ing$/, ''))) score += 1
    if (a.indoors === inside) score += 0.5 * Math.sign(score) // ties stay where they are
    if (score > bestScore) { best = a; bestScore = score }
  }
  // A bare door move ("*leads you inside*") with nothing more specific.
  if (!best && cross && (inside ? DOOR_OUT.test(q) : DOOR_IN.test(q))) best = chatActions(person).find(a => a.indoors !== inside && a.action !== 'sleeping')
  return best
}

/** Cleans an ordinary chat reply and works out whether it actually did
 *  something: an explicit tag (if the model leaked one anyway) wins, then
 *  the last *stage direction* that matches a real activity. */
export function parseChatAction(text: string, person: ResidentPosition): { text: string; action?: ChatAction } {
  const { text: shown, tags } = stripTags(text)
  for (const tag of tags) { const a = matchAction(tag, person, true); if (a) return { text: shown || text.trim(), action: a } }
  const directions = emotes(shown)
  for (let i = directions.length - 1; i >= 0; i--) { const a = matchAction(directions[i], person); if (a) return { text: shown, action: a } }
  return { text: shown || text.trim() }
}

export function residentPrompt(person: ResidentPosition, groggy = false) {
  const r = person.resident
  const backstory = r.backstory ? ` Background: ${r.backstory}` : ''
  const groggyNote = groggy ? ' The player just woke you up from sleeping -- you are groggy and a little annoyed about it, so keep replies noticeably shorter and a bit curt for this whole conversation, though not rude.' : ''
  return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One. You live in ${r.town}, work around ${r.workplace}, and like ${r.interest}.${backstory}${groggyNote} Your current activity is: ${person.activity}. Respond in first person in 1-3 short sentences. Keep the career and community setting grounded. The main Job Board is in Founders Green. Local ruins are west of town; a camp and community harvest are south. Do not invent rewards, quests, transactions, or claim to change game state. This is conversation only. Stay in character; never claim to be a real person.`
}

/** Structured result of a player-driven resident decision (see
 *  residentDecisionPrompt/-Fallback below), ready to become a
 *  gameStore.ResidentOverride and a line shown in the chat log. */
export interface ResidentDecision { granted: boolean; indoors: boolean; action?: Activity; activity?: string; scene?: SceneKind; description?: string; say: string }

/** Prompt for the two interactive decisions a pinned resident can make
 *  while talking to the player: 'next' ("what will you do next?", picked
 *  from whichever pool -- outdoor or indoor -- matches where they are
 *  right now) and 'enter' ("can I come in?", only meaningful while they're
 *  outdoors with an indoorActivities pool). The reply format is deliberately
 *  narrow (a few "KEY: value" lines) so parseResidentDecision() can read
 *  either a real model reply or the pre-formatted fallback below with the
 *  same code path. */
export function residentDecisionPrompt(person: ResidentPosition, ask: 'next' | 'enter'): string {
  const r = person.resident
  const backstory = r.backstory ? ` Background: ${r.backstory}` : ''
  if (ask === 'enter') {
    const options = r.indoorActivities?.map(a => a.label).join('; ') || 'resting at home'
    return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One.${backstory} The player, standing at your door, wants to come inside (see their latest message, in context of your conversation so far). Right now you are: ${person.activity}. Decide yes or no, in character -- usually yes, unless declining fits your personality better right now. Reply on separate lines, exactly: "ENTER: yes" or "ENTER: no"; if yes, also "DOING: <one item from this list, copied exactly: ${options}>"; and always "SAY: <one short in-character sentence>". No other text.`
  }
  const indoors = !person.visible
  const pool = (indoors ? r.indoorActivities?.map(a => a.label) : r.outdoorActivities?.map(a => a.label)) ?? []
  const options = (pool.length ? pool : [person.activity]).join('; ')
  return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One.${backstory} The player just asked what you'll do next. Right now you are ${indoors ? 'inside' : 'outside'}: ${person.activity}. Pick ONE thing you'll do next from this list, copied exactly: ${options}. Reply on separate lines, exactly: "NEXT: <the chosen item>" and "SAY: <one short in-character sentence>". No other text.`
}

/** Pre-formatted fallback used when no local model is connected (or the
 *  call fails) -- same "KEY: value" shape as the prompt above expects back,
 *  so parseResidentDecision() needs only one parsing path. Picks randomly
 *  rather than deterministically: this only runs on an explicit player
 *  interaction, not every frame, so it doesn't need to be pure. */
export function residentDecisionFallback(person: ResidentPosition, ask: 'next' | 'enter'): string {
  const r = person.resident
  if (ask === 'enter') {
    const pool = r.indoorActivities
    if (!pool?.length || Math.random() < 0.15) return 'ENTER: no\nSAY: Maybe another time.'
    const pick = pool[Math.floor(Math.random() * pool.length)]
    return `ENTER: yes\nDOING: ${pick.label}\nSAY: Sure, come on in.`
  }
  const indoors = !person.visible
  const pool = indoors ? r.indoorActivities : r.outdoorActivities
  const pick = pool?.length ? pool[Math.floor(Math.random() * pool.length)] : undefined
  const label = pick?.label ?? person.activity
  return `NEXT: ${label}\nSAY: I think I'll get to that.`
}

/** Reads a residentDecisionPrompt() reply (real or fallback, see above) into
 *  a ResidentDecision the caller can turn into a gameStore ResidentOverride.
 *  Falls back to the first pool entry (or the current activity) when the
 *  reply doesn't cleanly name one of the offered options, so a slightly
 *  off-format model reply still produces something sensible. */
export function parseResidentDecision(text: string, ask: 'next' | 'enter', resident: Resident, person: ResidentPosition): ResidentDecision {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const get = (key: string) => lines.find(l => new RegExp(`^${key}\\s*:`, 'i').test(l))?.replace(new RegExp(`^${key}\\s*:`, 'i'), '').trim()
  const findByLabel = <T extends { label: string }>(pool: T[] | undefined, wanted?: string): T | undefined => {
    if (!pool?.length) return undefined
    if (wanted) {
      const lower = wanted.toLowerCase()
      const exact = pool.find(a => a.label.toLowerCase() === lower)
      if (exact) return exact
      const loose = pool.find(a => lower.includes(a.label.toLowerCase()) || a.label.toLowerCase().includes(lower))
      if (loose) return loose
    }
    return pool[0]
  }
  if (ask === 'enter') {
    const say = get('SAY') || 'Sure, come on in.'
    const granted = (get('ENTER') || 'no').toLowerCase().startsWith('y')
    if (!granted) return { granted: false, indoors: false, say: get('SAY') || 'Maybe another time.' }
    const match = findByLabel(resident.indoorActivities, get('DOING'))
    return { granted: true, indoors: true, action: match?.action ?? 'resting', activity: match?.label, scene: match?.scene, description: match?.description, say }
  }
  const say = get('SAY') || "I'll get to that."
  const indoors = !person.visible
  const next = get('NEXT')
  if (indoors) {
    const match = findByLabel(resident.indoorActivities, next)
    return { granted: true, indoors: true, action: match?.action ?? 'resting', activity: match?.label, scene: match?.scene, description: match?.description, say }
  }
  const match = findByLabel(resident.outdoorActivities, next)
  return { granted: true, indoors: false, action: match?.action, activity: match?.label, say }
}
