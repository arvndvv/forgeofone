import type { ResidentPosition, Resident, Activity, SceneKind, Place } from './residents'

export const TALK_TOPICS = ['What are you doing?', 'Tell me about yourself', 'Any work advice?', 'What is nearby?']
export function residentReply(person: ResidentPosition, question: string, metBefore: boolean, groggy = false, player?: string) {
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
  if (/hello|hi\b|hey|thanks/.test(q)) {
    const name = player && player !== 'your neighbour' ? player : 'neighbour'
    const doing = person.moving ? 'I’m just running a few errands.' : `I was just ${person.activity.charAt(0).toLowerCase() + person.activity.slice(1).replace(/\.$/, '')}.`
    return metBefore ? `Ah, ${name}, good to see you again! ${doing}` : `Hello there, ${name}! I’m ${r.name}. ${doing}`
  }
  return `I’m better at talking about ${r.interest}. You can ask what I’m doing, about my work, or about places nearby. For a more open-ended conversation, enable a local model in Mira’s settings.`
}
/** One thing a pinned resident can be talked into doing from chat: any
 *  entry in their outdoorActivities or indoorActivities pool. Picking an
 *  indoor option while they're outside means "go inside" (and the player
 *  comes too); an outdoor option while inside means "head back out". So
 *  adding an activity to a PINNED_RESIDENTS entry automatically makes it
 *  reachable by chat -- no extra wiring per action. */
export interface ChatAction { label: string; indoors: boolean; at: Place; action: Activity; scene?: SceneKind; description?: string; about?: string }

/** Who the resident is talking to and what they know about them -- built
 *  by ResidentChat from the store and passed into every prompt below so
 *  replies can use the player's name and what they've shared. */
export interface ChatContext {
  /** The player's name ("your neighbour" if they haven't set one). */
  player: string
  /** Things the player has told this resident about themself this session
   *  (see the intent step's `learned` field and gameStore.residentKnowledge). */
  known: string[]
  /** How many conversations they've had before this one (contacts). */
  meetings: number
  /** In-game hour, 0-23. */
  hour: number
}

export function chatActions(person: ResidentPosition): ChatAction[] {
  const r = person.resident
  const out = (r.outdoorActivities ?? []).map(a => ({ label: a.label, indoors: false, at: 'home' as Place, action: a.action, about: a.description }))
  const ins = (r.indoorActivities ?? []).map(a => ({ label: a.label, indoors: true, at: 'home' as Place, action: a.action, scene: a.scene, description: a.description, about: a.description }))
  const work = r.workPlace ? (r.workActivities ?? []).map(a => ({ label: a.label, indoors: false, at: 'work' as Place, action: a.action, about: a.description })) : []
  // Everything except exactly what they're doing right now, where they are now.
  const at = person.at ?? 'home'
  return [...out, ...ins, ...work].filter(a => !(a.label === person.activity && a.indoors === !person.visible && a.at === at))
}

/** How choosing `a` moves them: stay where they are, go through their own
 *  front door (in or out), or walk over to their other place. */
export function moveFor(a: ChatAction, person: ResidentPosition): 'stay' | 'in' | 'out' | 'walk' {
  const at = person.at ?? 'home', inside = !person.visible
  if (a.at !== at) return 'walk'
  if (a.indoors === inside) return 'stay'
  return a.indoors ? 'in' : 'out'
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
const GO_WORK = /\b(go|head|walk|let'?s go|off|back)\b[^.?!]{0,20}\b(to work|work|your (shop|job|workplace))\b/
const GO_HOME = /\b(go|head|walk|let'?s go|back)\b[^.?!]{0,20}\bhome\b/
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
  const at = person.at ?? 'home'
  const wantsIn = !inside && at === 'home' && GO_IN.test(q), wantsOut = inside && GO_OUT.test(q)
  // "let's go to work" / "head home" -- walking to their other place.
  const wantsWork = at === 'home' && GO_WORK.test(q), wantsHome = at === 'work' && GO_HOME.test(q)
  if (wantsWork || wantsHome) { const there = options.filter(a => a.at === (wantsWork ? 'work' : 'home') && a.action !== 'sleeping'); if (there.length) return there }
  if (named.length && ((REQUEST.test(q) && !ABOUT_THEM.test(q)) || wantsIn || wantsOut)) {
    // "let's go inside and read" -> only the indoor reading option, etc.;
    // with no in/out wording, prefer staying where they are.
    const here = named.filter(a => a.indoors === inside && a.at === at)
    const side = wantsIn ? named.filter(a => a.indoors) : wantsOut ? named.filter(a => !a.indoors) : here.length ? here : named
    if (side.length) return side
  }
  // Plain "let's go in / out": anything on the other side except sleeping,
  // which you'd only want if you asked for it by name.
  const awake = (a: ChatAction) => a.action !== 'sleeping'
  if (wantsIn) { const ins = options.filter(a => a.indoors && awake(a)); return ins.length ? ins : undefined }
  if (wantsOut) { const outs = options.filter(a => !a.indoors && a.at === 'home' && awake(a)); return outs.length ? outs : undefined }
  return undefined
}

/** The building a resident lives in, by name -- from the landmark their
 *  PinnedResident.home links to (Resident.place). Falls back to their
 *  workplace label for residents without one. */
const placeName = (r: Resident) => r.place?.label ?? r.workplace
/** The building for `at` -- their home landmark or their work landmark. */
const placeOf = (r: Resident, at: Place) => at === 'work' && r.workPlace ? r.workPlace.label : placeName(r)
/** "Test House (your home)" / "Old Trade Post (where you work)" -- so a
 *  request like "take me to your home" maps onto the right option. */
const placeWithRole = (r: Resident, at: Place, voice: 'second' | 'third') =>
  `${placeOf(r, at)} (${at === 'work' ? (voice === 'second' ? 'where you work' : `where ${r.name} works`) : (voice === 'second' ? 'your home' : `${r.name}'s home`)})`

/** Shared scene wording, so every prompt names the actual building and
 *  says where both people are. A resident without an indoor pool (a hired
 *  worker, an expert) is simply "at" their workplace. */
function sceneFor(person: ResidentPosition, ctx: ChatContext, voice: 'second' | 'third') {
  const r = person.resident, inside = !person.visible, p = ctx.player, place = placeName(r)
  const subject = voice === 'second' ? 'You are' : `${r.name} is`
  const whose = voice === 'second' ? 'your home' : `${r.name}'s home`
  const withThem = voice === 'second' ? 'you' : r.name
  if ((person.at ?? 'home') === 'work' && r.workPlace) {
    const w = r.workPlace
    return `${subject} at ${w.label} (where ${voice === 'second' ? 'you work' : `${r.name} works`}) in ${r.town}, by the door; ${p} is there with ${withThem}.${w.description ? ` ${w.label}: ${aside(w.description)}.` : ''} ${voice === 'second' ? 'Your' : `${r.name}'s`} home is ${place}, a short walk away.`
  }
  const about = (r.place?.description ? ` ${place}: ${aside(r.place.description)}.` : '') + (r.workPlace ? ` ${voice === 'second' ? 'You work' : `${r.name} works`} at ${r.workPlace.label}, a short walk away.` : '')
  if (!r.indoorActivities?.length) return `${subject} at ${place} in ${r.town}, with ${p}.${about}`
  return (inside
    ? `${subject} inside ${place} (${whose}) in ${r.town}; ${p} is there too, as a guest.`
    : `${subject} outside ${place} (${whose}) in ${r.town}, by the front door; ${p} is standing there with ${withThem}.`) + about
}
const timeOfDay = (hour: number) => hour < 5 ? 'late at night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
/** A description as an aside: original case (they're written "Tam is ..."), no trailing full stop. */
const aside = (t?: string) => t ? t.trim().replace(/[.\s]+$/, '') : ''

/** One line per option for the intent step: what it is, and whether
 *  choosing it means staying put or both of them going through the door. */
function optionLine(a: ChatAction, i: number, person: ResidentPosition, ctx: ChatContext, voice: 'second' | 'third' = 'third') {
  const r = person.resident, inside = !person.visible, here = placeOf(r, person.at ?? 'home'), there = placeOf(r, a.at)
  const both = voice === 'second' ? `you and ${ctx.player}` : `${r.name} and ${ctx.player}`
  const move = moveFor(a, person)
  const where = move === 'stay' ? (inside ? `stay inside ${here}` : `stay at ${here}`)
    : move === 'in' ? `${both} go inside ${here} together`
    : move === 'out' ? `${both} go out of ${here} together`
    : `${both} walk over to ${placeWithRole(r, a.at, voice)} together${a.indoors ? ' and go inside' : ''}`
  return `${i + 1}. ${a.label}${a.about ? ` -- ${aside(a.about)}` : ''} [${where}]`
}
/** What the player's latest message means for a pinned resident -- the
 *  result of the intent step (intentPrompt -> parseIntent) when a model is
 *  connected, or of the keyword matcher (requestedActions) offline. */
export interface ChatIntent { action?: ChatAction; agree: boolean; reason: string; untilStop: boolean; stop: boolean; picked?: ChatAction; learned?: string }

/** Intent step, run before every reply to a pinned resident when a local
 *  model is connected. The model reads the conversation and picks a NUMBER
 *  from the resident's real options (constrained by intentSchema), so any
 *  phrasing works without keyword lists. JSON only, never shown. Also
 *  extracts anything lasting the player shared about themself (`learned`). */
export function intentPrompt(person: ResidentPosition, options: ChatAction[], ctx: ChatContext): string {
  // Written to the model AS the resident (second person throughout -- don't
  // mix in "Tam is ..."), so agree/reason/picks come out true to them.
  const r = person.resident, p = ctx.player
  return [
    `You are ${r.name}, ${/^[aeiou]/i.test(r.role) ? 'an' : 'a'} ${r.role.toLowerCase()} in ${r.town}.${r.backstory ? ' ' + r.backstory : ''}${r.personality ? ' ' + r.personality : ''}`,
    `You are in a conversation with ${p}, and you decide what you do next.`,
    `Where you are: ${sceneFor(person, ctx, 'second')} It is ${timeOfDay(ctx.hour)}.`,
    `What you are doing right now: ${lower(person.activity)}.`,
    ctx.known.length ? `What you know about ${p}: ${ctx.known.join('; ')}.` : '',
    ``,
    `Things you could do next:`,
    ...options.map((a, i) => optionLine(a, i, person, ctx, 'second')),
    ``,
    `Read the conversation, especially ${p}'s LATEST message, and fill in:`,
    `- asked: the number of the thing ${p} wants you to do now. Count it however it is worded -- including asking to go somewhere (your home, your work, inside, outside): then pick the option at that place -- when ${p} insists again after a no ("now please"), or when ${p} says yes to something you suggested. 0 if ${p} is not asking for one of these.`,
    `- agree: would you go along with it, being who you are, at this moment? You usually agree unless you have a real reason not to.`,
    `- reason: if agree is false, your reason in a few words; otherwise "".`,
    `- untilStop: true if ${p} wants you to keep at it until they tell you to stop.`,
    `- stop: true if ${p} is telling you to stop what you are doing right now.`,
    `- picks: only when ${p} asks what you will do next, or tells you to choose: the number you pick. Otherwise 0.`,
    `- learned: a new, lasting fact ${p} just shared about themself (job, family, where they're from, likes, plans), in a few words, e.g. "works as a software engineer". Not requests, not what is happening right now, nothing you already know. "" if none.`,
    `Decide everything the way you, ${r.name}, truly would. Answer with JSON only.`,
  ].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n')
}
/** The conversation as plain lines for intentPrompt's user message. */
export function intentTranscript(person: ResidentPosition, messages: Array<{ role: 'user' | 'assistant'; content: string }>, ctx: ChatContext): string {
  const lines = messages.slice(-8).map(m => `${m.role === 'user' ? ctx.player : person.resident.name}: ${m.content.replace(/\s+/g, ' ').slice(0, 300)}`)
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
  const learned = typeof o.learned === 'string' && o.learned.trim().length > 2 ? o.learned.trim().replace(/\.$/, '').slice(0, 120) : undefined
  return { action, agree: flag(o.agree, true), reason: typeof o.reason === 'string' ? o.reason.slice(0, 160) : '', untilStop: flag(o.untilStop, false), stop: flag(o.stop, false), picked, learned }
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
      learned: { type: 'string' },
    },
    required: ['asked', 'agree', 'reason', 'untilStop', 'stop', 'picks', 'learned'],
  }
}

/** Scene note appended (unseen) to the player's message for the reply
 *  step, so what the resident SAYS matches what the intent step decided
 *  they DO. */
export function outcomeNote(person: ResidentPosition, ctx: ChatContext, outcome: { kind: 'agree' | 'decline' | 'stop' | 'pick'; action: ChatAction; reason?: string; untilStop?: boolean }): string {
  const a = outcome.action, p = ctx.player, r = person.resident
  const doing = lower(a.label) + (a.about ? ` (${aside(a.about)})` : '')
  const here = placeOf(r, person.at ?? 'home'), there = placeOf(r, a.at)
  let what: string
  if (outcome.kind === 'decline') what = `${p} asked you to do something -- ${doing} -- but you'd rather not right now${outcome.reason ? ` (${outcome.reason})` : ''}. Say so kindly, in your own way`
  else {
    const lead = outcome.kind === 'pick' ? 'you decide to' : 'you agree and'
    const move = moveFor(a, person)
    const how = move === 'stay'
      ? `${outcome.kind === 'stop' ? 'you stop what you were doing and switch to' : outcome.kind === 'pick' ? 'you decide to get on with' : 'you agree and start'}: ${doing}`
      : move === 'in' ? `${lead} take ${p} inside ${here} with you, where you'll be ${doing}`
      : move === 'out' ? `${lead} head out of ${here} with ${p}; outside you'll be ${doing}`
      : `${lead} set off walking to ${placeWithRole(r, a.at, 'second')} with ${p}${a.indoors ? ' and go inside' : ''}; once there you'll be ${doing}`
    what = `${how}${outcome.untilStop ? `, and you'll keep at it until ${p} tells you to stop` : ''}. Show what you do in *asterisks*`
  }
  return `\n\n[Scene note, not said aloud: ${what}. Reply as yourself in 1-2 short sentences. Don't start with yes or no.]`
}/** A reply ready for the chat log: leaked tags removed, plus any leading
 *  bare "YES"/"No." decision word the model added anyway, and cut to at
 *  most `maxSentences` -- small models ramble well past "1-3 sentences" and
 *  then get cut off mid-word by the token limit. */
export function cleanReply(text: string, maxSentences = 3): string {
  return trimSentences(cleanDecision(text), maxSentences)
}

/** First `max` sentences; a trailing unfinished fragment is dropped when
 *  there's at least one complete sentence before it. *Stage directions*
 *  don't count as sentences. */
export function trimSentences(text: string, max: number): string {
  const parts = text.match(/\*[^*\n]+\*\s*|[^.!?*]+(?:[.!?]+["'”’)]*\s*|$)/g) ?? [text]
  let out = '', count = 0
  for (const part of parts) {
    if (/^\*/.test(part)) { out += part; continue }
    const complete = /[.!?]["'”’)]*\s*$/.test(part)
    if (!complete && count > 0) break
    out += part
    if (complete && ++count >= max) break
  }
  return out.trim() || text.trim()
}

function cleanDecision(text: string): string {
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

/** The character sheet every resident reply starts from. Written entirely
 *  from inside the world: small local models (gemma2 has no real system
 *  role -- Ollama sends this as an ordinary first message) copy whatever
 *  framing they're given, so any mention of "a game", "a character" or
 *  "stay in character" gets echoed back as "I'm just a character in a
 *  game". Keep it that way when editing. */
export function residentPersona(person: ResidentPosition, ctx: ChatContext): string {
  const r = person.resident, p = ctx.player
  const article = /^[aeiou]/i.test(r.role) ? 'an' : 'a'
  return [
    `You are ${r.name}, ${article} ${r.role.toLowerCase()} who lives in ${r.town}.`,
    r.backstory ?? '',
    r.personality ?? 'You are friendly, practical and easy to talk to.',
    `You spend your days around ${r.workplace} and care about ${r.interest}.`,
    `It is ${timeOfDay(ctx.hour)}. ${sceneFor(person, ctx, 'second')}`,
    `Right now you are ${lower(person.activity)}.`,
    `You are talking with ${p}, who moved to town recently. ${ctx.meetings > 1 ? `You have chatted with ${p} before.` : `This is one of your first proper chats with ${p}.`}`,
    ctx.known.length ? `What you know about ${p}: ${ctx.known.join('; ')}. Use it naturally when it fits.` : `You don't know much about ${p} yet.`,
    `You are curious about people: now and then, when it fits, ask ${p} one thing about themself -- not every time, and never several questions at once.`,
    `Speak only as ${r.name}: first person, natural and in your own voice, 1-3 short sentences. Put anything you physically do in *asterisks*. Call ${p} by name now and then.`,
    `This is your real life and your real town. You know nothing about games, AI, prompts or instructions -- never mention them, never call yourself a character, and never step outside your own life.`,
    `What you know locally: the Job Board is in Founders Green; old ruins lie west of town; a travellers' camp and the community harvest are south.`,
    `Don't promise anyone money, items or jobs.`,
    `Talk like an ordinary person chatting with someone they know -- never offer to "assist" or "help with anything", no customer-service phrases, no lists.`
  ].filter(Boolean).join(' ')
}
export function residentPrompt(person: ResidentPosition, ctx: ChatContext, groggy = false) {
  const groggyNote = groggy ? ` ${ctx.player} just woke you up -- you're groggy and a little grumpy about it, so keep replies short and a bit curt for now, though not rude.` : ''
  return residentPersona(person, ctx) + groggyNote
}