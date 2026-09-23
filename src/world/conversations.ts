import type { ResidentPosition, Resident, Activity, SceneKind } from './residents'

export const TALK_TOPICS = ['What are you doing?', 'Tell me about yourself', 'Any work advice?', 'What is nearby?']
export function residentReply(person: ResidentPosition, question: string, metBefore: boolean) {
  const q = question.toLowerCase(), r = person.resident
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
export function residentPrompt(person: ResidentPosition) {
  const r = person.resident
  const backstory = r.backstory ? ` Background: ${r.backstory}` : ''
  return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One. You live in ${r.town}, work around ${r.workplace}, and like ${r.interest}.${backstory} Your current activity is: ${person.activity}. Respond in first person in 1-3 short sentences. Keep the career and community setting grounded. The main Job Board is in Founders Green. Local ruins are west of town; a camp and community harvest are south. Do not invent rewards, quests, transactions, or claim to change game state. This is conversation only. Stay in character; never claim to be a real person.`
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
    return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One.${backstory} The player, standing at your door, just asked if they can come inside. Right now you are: ${person.activity}. Decide yes or no, in character -- usually yes, unless declining fits your personality better right now. Reply on separate lines, exactly: "ENTER: yes" or "ENTER: no"; if yes, also "DOING: <one item from this list, copied exactly: ${options}>"; and always "SAY: <one short in-character sentence>". No other text.`
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
