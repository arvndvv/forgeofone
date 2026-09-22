import type { ResidentPosition } from './residents'

export const TALK_TOPICS = ['What are you doing?', 'Tell me about yourself', 'Any work advice?', 'What is nearby?']
export function residentReply(person: ResidentPosition, question: string, metBefore: boolean) {
  const q = question.toLowerCase(), r = person.resident
  if (/doing|working|busy|activity/.test(q)) return `${person.moving ? 'I’m on the move. My next stop: ' + person.activity.replace(/^On my way · /, '') : 'Right now I’m ' + person.activity.charAt(0).toLowerCase() + person.activity.slice(1)}. I’m a ${r.role.toLowerCase()} from ${r.town}. ${person.action === 'gardening' ? 'The plants need regular attention, just like a business.' : 'There’s always another little job to finish, but I can spare a moment.'}`
  if (/yourself|name|who|meet/.test(q)) return `${metBefore ? 'Good to see you again! ' : 'Nice to meet you! '}I’m ${r.name}, a ${r.role.toLowerCase()} from ${r.town}. I’m interested in ${r.interest}. What brought you to town?`
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
  return `You are ${r.name}, a friendly ${r.role} in the offline life-simulation game Forge of One. You live in ${r.town}, work around ${r.workplace}, and like ${r.interest}. Your current activity is: ${person.activity}. Respond in first person in 1-3 short sentences. Keep the career and community setting grounded. The main Job Board is in Founders Green. Local ruins are west of town; a camp and community harvest are south. Do not invent rewards, quests, transactions, or claim to change game state. This is conversation only. Stay in character; never claim to be a real person.`
}
