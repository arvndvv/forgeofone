import { create } from 'zustand'
import { conversationReply } from '../services/localAI'
import { getTile, getInteraction } from '../world/generation'
import { facingForStep, type Facing } from '../world/facing'
import type { Opportunity, ActiveGig, Business, LogEntry, Quest, RivalBusiness, ChatMessage, CollectedItem } from '../types/game'
import type { ResidentOverride } from '../world/residents'

// --- Currency ---------------------------------------------------------------
// World runs on INR (rupees), not dollars. Reference costs below are written
// as USD baselines (easy to reason about / tune) and converted through this
// rate -- same idea as pricing data you'd find quoted in $ elsewhere.
// Rate sourced Sept 2026; update USD_TO_INR if you want to resync later.
const USD_TO_INR = 95.6
const usdToInr = (usd: number) => Math.round((usd * USD_TO_INR) / 10) * 10
export const formatInr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`

// --- Tunable constants -----------------------------------------------------
const SPEED_MULTIPLIER = 25 // sim clock runs this many times faster than real time (20-30x range)
const TICK_INTERVAL_MS = 1000 // one clock tick per real second
const FOCUS_CAPACITY = 3 // commitments a player can juggle before efficiency starts dropping
const DEV_JOB_DAILY_INCOME = usdToInr(220)
const DAILY_LIVING_COST = usdToInr(140) // food + rent + insurance, combined for v0.1
export const BUSINESS_STARTUP_COST = usdToInr(3000)
const BUSINESS_DAILY_REVENUE_BASE = usdToInr(180)
const SICK_CHANCE = 0.05
const SICK_COST = usdToInr(250)
const OPPORTUNITY_SPAWN_CHANCE = 0.4
const MAX_OPEN_OPPORTUNITIES = 3
const STARTING_MONEY = 0

// World-sim tunables (rival businesses + NPC flavor -- makes the town feel
// alive independent of the player)
const RIVAL_SPAWN_CHANCE = 0.14
const MAX_RIVAL_BUSINESSES = 6
const RIVAL_BASE_CLOSE_CHANCE = 0.02 // grows slowly with age -- young shops rarely fold, old struggling ones eventually do
const NPC_FLAVOR_CHANCE = 0.3

let miraRequest = 0
let idCounter = 0
const nextId = () => `id-${Date.now()}-${idCounter++}`

const OPPORTUNITY_POOL: Array<Omit<Opportunity, 'id'>> = [
  { kind: 'freelance', title: "Freelance: landing page for local shop", payout: usdToInr(600), durationDays: 3 },
  { kind: 'freelance', title: "Freelance: fix a client's API bug", payout: usdToInr(350), durationDays: 1 },
  { kind: 'freelance', title: 'Freelance: build a dashboard MVP', payout: usdToInr(1200), durationDays: 5 },
  { kind: 'job', title: 'Job offer: senior dev role, better base pay', payout: 0, durationDays: 0 },
  { kind: 'business', title: 'Opportunity: co-found a small studio', payout: 0, durationDays: 0 },
]

const RIVAL_NAME_POOL: Array<{ name: string; sector: string }> = [
  { name: 'Meera\'s Bakery', sector: 'bakery' },
  { name: 'QuickFix Repairs', sector: 'repair shop' },
  { name: 'Northside Print Co.', sector: 'print shop' },
  { name: 'Two Dogs Cafe', sector: 'cafe' },
  { name: 'Vantage Consulting', sector: 'consulting' },
  { name: 'Riverbend Grocers', sector: 'grocery' },
  { name: 'Pixel & Thread', sector: 'design studio' },
  { name: 'Old Town Hardware', sector: 'hardware store' },
  { name: 'Lantern Bookshop', sector: 'bookshop' },
  { name: 'Fleet Motors', sector: 'garage' },
]

const NPC_NAME_POOL = ['Asha', 'Devon', 'Priya', 'Sam', 'Ravi', 'Elena', 'Tomas', 'Nisha', 'Marcus', 'Kavya']
const NPC_ACTIVITY_POOL = [
  'hurrying to open up shop before the morning rush',
  'arguing with a delivery driver over a late shipment',
  'posting a "help wanted" sign in a window downtown',
  'sitting outside the cafe, sketching something on a napkin',
  'carrying a stack of flyers for a shop that just opened',
  'fixing a flat tire outside the garage',
  'reading the job board notices with a frown',
  'closing up early, looking tired',
  'chatting with a regular customer on the street corner',
  'counting coins at a market stall',
]

// Shared deterministic world, collision map, and interaction points.
export { getTile, hashCoord } from '../world/generation'

const QUEST_DEFS: Array<Omit<Quest, 'completed'>> = [
  {
    id: 'first-day',
    title: 'Get Your Bearings',
    description: 'Walk into town and see what work is already lined up for you.',
    hint: 'Open the Dev Desk -- your steady coding work is already active and paying out each day.',
  },
  {
    id: 'first-paycheck',
    title: 'First Paycheck',
    description: 'Make it to day 2 and see your first day of income land.',
    hint: 'Just let the clock run -- income is calculated automatically at the start of each new day.',
  },
  {
    id: 'try-freelance',
    title: 'Take On Freelance Work',
    description: 'Accept a freelance gig from the Job Board when one appears.',
    hint: 'Check the Job Board -- new gigs show up on their own every so often. Accept one.',
  },
  {
    id: 'explore-beyond',
    title: 'Step Outside Town',
    description: 'Walk out past the town square and see what the wider world holds.',
    hint: 'Right on the World screen, walk with the arrows past the paved town square until you find a marked site, then Investigate it.',
  },
  {
    id: 'steady-books',
    title: 'Steady the Books',
    description: `Build up savings of ${formatInr(50000)} or more.`,
    hint: 'Keep your dev job running and take freelance work on the side to grow your balance.',
  },
  {
    id: 'first-venture',
    title: 'Found Your First Venture',
    description: `Save up ${formatInr(BUSINESS_STARTUP_COST)} and found your first business.`,
    hint: 'Visit Your Ventures once you have enough saved, and give your business a name.',
  },
  {
    id: 'overcommitted',
    title: 'Learn Your Limits',
    description: 'Take on more than you can focus on at once, and feel efficiency drop.',
    hint: `Juggling more than ${FOCUS_CAPACITY} things at once (job + gigs + businesses) spreads your focus thin -- try it and watch the Efficiency number in the header.`,
  },
  {
    id: 'watch-world',
    title: 'Watch the World Move',
    description: 'Notice a business elsewhere in town open or close on its own.',
    hint: 'The town keeps moving whether you watch it or not -- check the Hall of Records for what other people are up to.',
  },
  {
    id: 'ask-mira',
    title: 'Ask For Guidance',
    description: 'Open Mira, your Forge assistant, and ask her something.',
    hint: 'Click the "Ask Mira" button in the corner of any screen. She can see your whole situation and will talk you through it.',
  },
]

interface GameState {
  playerName: string | null
  day: number
  hour: number
  minute: number
  simMinutesTotal: number
  money: number
  health: number
  devJobActive: boolean
  businesses: Business[]
  activeGigs: ActiveGig[]
  opportunities: Opportunity[]
  log: LogEntry[]
  running: boolean
  _tickHandle: ReturnType<typeof setInterval> | null

  // world simulation (independent of the player)
  rivalBusinesses: RivalBusiness[]

  // infinite explorable world -- position + per-character seed + what's been found
  playerX: number
  playerY: number
  playerFacing: Facing
  worldSeed: number
  discoveries: Record<string, true>
  inventory: CollectedItem[]
  contacts: Record<string, { name: string; role: string; meetings: number }>
  meetResident: (id: string, name: string, role: string) => void

  // pinned-resident interaction state -- an explicit escape hatch from the
  // "position is a pure function of the clock" rule, only for a resident a
  // player has just talked to (see ResidentOverride in world/residents.ts).
  // Not saved (the game has no save/load), keyed by resident.id.
  residentOverrides: Record<string, ResidentOverride>
  setResidentOverride: (id: string, override: ResidentOverride) => void

  // onboarding / quest system
  quests: Quest[]
  everOvercommitted: boolean

  // in-game assistant
  assistantOpen: boolean
  miraThinking: boolean
  miraNotice: string
  chat: ChatMessage[]

  createCharacter: (name: string) => void
  resetGame: () => void
  startClock: () => void
  stopClock: () => void
  toggleDevJob: () => void
  startBusiness: (name: string) => void
  acceptOpportunity: (id: string) => void
  declineOpportunity: (id: string) => void
  addLog: (message: string, kind?: 'player' | 'world') => void
  efficiency: () => number
  commitmentCount: () => number
  activeQuest: () => Quest | null
  movePlayer: (dx: number, dy: number) => void
  returnToTown: () => void
  investigateHere: () => void
  openAssistant: () => void
  closeAssistant: () => void
  askMira: (question: string) => Promise<void>
  _checkQuests: () => void
  _completeQuest: (id: string) => void
  _runDailyTick: (newDay: number) => void
}

function buildMiraReply(state: GameState, questionRaw: string): string {
  const q = questionRaw.toLowerCase()
  const eff = state.efficiency()
  const commitments = state.commitmentCount()
  const quest = state.activeQuest()

  if (/money|afford|save|broke|budget|rich|poor/.test(q)) {
    const gap = BUSINESS_STARTUP_COST - state.money
    if (gap > 0) {
      return `You're sitting on ${formatInr(state.money)} right now. You'd need ${formatInr(gap)} more to found a business outright (that costs ${formatInr(BUSINESS_STARTUP_COST)}). Your dev job alone nets about ${formatInr(DEV_JOB_DAILY_INCOME - DAILY_LIVING_COST)} a day after living costs, so it's a matter of time and staying healthy.`
    }
    return `You've got ${formatInr(state.money)} banked -- that's enough to found a business if you haven't already. Just don't spread yourself too thin once you do.`
  }
  if (/efficien|juggl|focus|overcommit|spread/.test(q)) {
    return `You're currently committed to ${commitments} thing${commitments === 1 ? '' : 's'} (job, gigs, and businesses combined). Anything past ${FOCUS_CAPACITY} at once and your attention gets split -- right now your efficiency is ${(eff * 100).toFixed(0)}%. It's not a hard cap, it just means everything earns less while you're stretched thin.`
  }
  if (/quest|objective|next|what should i do|do next|stuck|help|guidance|direction/.test(q)) {
    if (!quest) return "You've worked through everything I had queued up for you. Keep an eye on the Job Board and the Hall of Records -- the town keeps generating its own opportunities."
    return `Right now I'd point you at "${quest.title}": ${quest.description} ${quest.hint}`
  }
  if (/gig|freelance/.test(q)) {
    if (state.activeGigs.length === 0) return 'No freelance gigs running at the moment. Check the Job Board -- new ones post on their own every so often.'
    return `You've got ${state.activeGigs.length} gig${state.activeGigs.length === 1 ? '' : 's'} running: ${state.activeGigs.map((g) => `"${g.title}" (${g.daysRemaining}d left, ${formatInr(g.payout)} on completion)`).join('; ')}.`
  }
  if (/business|venture|firm|company|start.*shop/.test(q)) {
    if (state.businesses.length === 0) return `You haven't founded anything yet. It costs ${formatInr(BUSINESS_STARTUP_COST)} to start one, and once it's running it earns roughly ${formatInr(BUSINESS_DAILY_REVENUE_BASE)}/day before efficiency is applied.`
    return `You're running ${state.businesses.length} business${state.businesses.length === 1 ? '' : 'es'}: ${state.businesses.map((b) => `"${b.name}" (since day ${b.foundedOnDay})`).join(', ')}. Remember each one you add competes for your focus same as a job or a gig.`
  }
  if (/health|sick|tired/.test(q)) {
    return `Your health is at ${state.health.toFixed(0)}%. There's a small daily chance of getting sick, which costs money and health both -- staying under ${FOCUS_CAPACITY} commitments doesn't reduce that risk directly, but keeping your finances stable means a sick day won't sink you.`
  }
  if (/world|rival|competitor|town|other (business|firm|shop)/.test(q)) {
    const rivals = state.rivalBusinesses.filter((r) => !r.closed)
    if (rivals.length === 0) return "The town's quiet right now -- no other businesses currently open that I'm tracking. Check back, they come and go on their own."
    return `Right now ${rivals.length} other business${rivals.length === 1 ? ' is' : 'es are'} open around town: ${rivals.map((r) => `"${r.name}" (${r.sector})`).join(', ')}. They open and close on their own -- it's not just your economy out there.`
  }
  if (/job\b|dev desk|steady work/.test(q)) {
    return state.devJobActive
      ? `Your dev job is active, bringing in ${formatInr(DEV_JOB_DAILY_INCOME)}/day before efficiency. You can step away from it any time from the Dev Desk if you want to focus elsewhere.`
      : "You've stepped away from your dev job right now. Head to the Dev Desk if you want to pick it back up."
  }
  if (/explore|outside|map|wander|walk around|open world|wider world/.test(q)) {
    const found = Object.keys(state.discoveries).length
    const distFromTown = Math.max(Math.abs(state.playerX), Math.abs(state.playerY))
    if (found === 0) {
      return "The World screen isn't just the town square -- walk past the paved center with the arrows or the D-pad and it keeps generating in every direction. Look for a marked site and Investigate it. It never runs out."
    }
    return `You're ${distFromTown} step${distFromTown === 1 ? '' : 's'} out from the town square right now, and you've found ${found} site${found === 1 ? '' : 's'} out there so far. It keeps generating in every direction -- there's always more if you keep walking.`
  }
  if (/who are you|what are you|mira/.test(q)) {
    return "I'm Mira -- I can see your money, health, commitments, quests, and what's happening elsewhere in town. Ask me about any of it."
  }
  return `Here's where things stand: ${formatInr(state.money)} banked, health at ${state.health.toFixed(0)}%, efficiency ${(eff * 100).toFixed(0)}% across ${commitments} commitment${commitments === 1 ? '' : 's'}. ${quest ? `If you're not sure what's next: "${quest.title}" -- ${quest.hint}` : 'Ask me about money, efficiency, gigs, businesses, health, or the rest of the town.'}`
}

export const useGameStore = create<GameState>((set, get) => ({
  playerName: null,
  day: 1,
  hour: 8,
  minute: 0,
  simMinutesTotal: 8 * 60,
  money: STARTING_MONEY,
  health: 100,
  devJobActive: true,
  businesses: [],
  activeGigs: [],
  opportunities: [],
  log: [],
  running: false,
  _tickHandle: null,

  rivalBusinesses: [],

  playerX: 0,
  playerY: 0,
  playerFacing: 'south',
  worldSeed: 1,
  discoveries: {},
  inventory: [],
  contacts: {},
  residentOverrides: {},

  quests: QUEST_DEFS.map((q) => ({ ...q, completed: false })),
  everOvercommitted: false,

  assistantOpen: false,
  miraThinking: false,
  miraNotice: '',
  chat: [
    {
      id: nextId(),
      role: 'mira',
      text: "Hi, I'm Mira. I can see everything going on in your world -- money, health, your quests, even what other businesses in town are up to. Ask me anything, or tap the objective banner up top if you just want to know what's next.",
    },
  ],

  createCharacter: (name) => {
    miraRequest++
    set({ playerName: name, playerX: 0, playerY: 0, playerFacing: 'south', worldSeed: Math.floor(Math.random() * 1_000_000), discoveries: {}, inventory: [], contacts: {}, residentOverrides: {}, miraThinking: false, miraNotice: '' })
    get().addLog(`${name} wakes up on day 1 with ${formatInr(STARTING_MONEY)} to their name, ready to start their working life.`)
    get()._completeQuest('first-day')
    get().startClock()
  },

  resetGame: () => {
    miraRequest++
    get().stopClock()
    set({
      playerName: null,
      day: 1,
      hour: 8,
      minute: 0,
      simMinutesTotal: 8 * 60,
      money: STARTING_MONEY,
      health: 100,
      devJobActive: true,
      businesses: [],
      activeGigs: [],
      opportunities: [],
      log: [],
      running: false,
      rivalBusinesses: [],
      playerX: 0,
      playerY: 0,
      playerFacing: 'south',
      worldSeed: 1,
      discoveries: {},
      inventory: [],
      contacts: {},
      residentOverrides: {},
      quests: QUEST_DEFS.map((q) => ({ ...q, completed: false })),
      everOvercommitted: false,
      assistantOpen: false,
      miraThinking: false,
      miraNotice: '',
      chat: [
        {
          id: nextId(),
          role: 'mira',
          text: "Hi, I'm Mira. I can see everything going on in your world -- money, health, your quests, even what other businesses in town are up to. Ask me anything, or tap the objective banner up top if you just want to know what's next.",
        },
      ],
    })
  },

  startClock: () => {
    if (get()._tickHandle) return
    const handle = setInterval(() => {
      const state = get()
      const simMinutesPerTick = SPEED_MULTIPLIER / 60
      const newTotal = state.simMinutesTotal + simMinutesPerTick
      const prevDayIndex = Math.floor(state.simMinutesTotal / 1440)
      const newDayIndex = Math.floor(newTotal / 1440)
      const minuteOfDay = newTotal % 1440
      set({
        simMinutesTotal: newTotal,
        day: newDayIndex + 1,
        hour: Math.floor(minuteOfDay / 60),
        minute: Math.floor(minuteOfDay % 60),
      })
      if (newDayIndex > prevDayIndex) {
        get()._runDailyTick(newDayIndex + 1)
      }
    }, TICK_INTERVAL_MS)
    set({ running: true, _tickHandle: handle })
  },

  stopClock: () => {
    const handle = get()._tickHandle
    if (handle) clearInterval(handle)
    set({ running: false, _tickHandle: null })
  },

  commitmentCount: () => {
    const state = get()
    return (state.devJobActive ? 1 : 0) + state.businesses.length + state.activeGigs.length
  },

  efficiency: () => {
    const commitments = get().commitmentCount()
    if (commitments <= FOCUS_CAPACITY) return 1
    return FOCUS_CAPACITY / commitments
  },

  activeQuest: () => {
    return get().quests.find((q) => !q.completed) ?? null
  },

  movePlayer: (dx, dy) => {
    const state = get()
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return
    const x = state.playerX + dx, y = state.playerY + dy
    const playerFacing = facingForStep(dx, dy)
    if (!getTile(x, y, state.worldSeed).walkable) { set({ playerFacing }); return }
    set({ playerX: x, playerY: y, playerFacing })
  },

  returnToTown: () => set({ playerX: 0, playerY: 0, playerFacing: 'south' }),

  investigateHere: () => {
    const state = get()
    const interaction = getInteraction(state.playerX, state.playerY, state.worldSeed)
    if (!interaction || interaction.poi.screen) return
    const tile = { poi: interaction.poi }
    const key = `${interaction.point.x},${interaction.point.y}`
    if (state.discoveries[key]) return
    const item = tile.poi.item
    const inventory = item ? state.inventory.some(i => i.id === item.id) ? state.inventory.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i) : [...state.inventory, { ...item, quantity: 1 }] : state.inventory
    set({ discoveries: { ...state.discoveries, [key]: true }, money: state.money + tile.poi.reward, inventory })
    const rewardNote = tile.poi.reward > 0 ? ` You found ${formatInr(tile.poi.reward)}.` : ''
    get().addLog(`${tile.poi.label}: ${tile.poi.flavor}${rewardNote}`, 'world')
    get()._checkQuests()
  },

  toggleDevJob: () => {
    const active = !get().devJobActive
    set({ devJobActive: active })
    get().addLog(active ? 'Took on developer work again.' : 'Stepped away from developer work for now.')
    get()._checkQuests()
  },

  startBusiness: (name) => {
    const state = get()
    if (state.money < BUSINESS_STARTUP_COST) {
      get().addLog(`Tried to found "${name}" but didn't have the ${formatInr(BUSINESS_STARTUP_COST)} needed to start it.`)
      return
    }
    const business: Business = {
      id: nextId(),
      name,
      dailyRevenueBase: BUSINESS_DAILY_REVENUE_BASE,
      foundedOnDay: state.day,
    }
    set({ money: state.money - BUSINESS_STARTUP_COST, businesses: [...state.businesses, business] })
    get().addLog(`Founded a new business: "${name}" for ${formatInr(BUSINESS_STARTUP_COST)}.`)
    get()._checkQuests()
  },

  acceptOpportunity: (id) => {
    const state = get()
    const opp = state.opportunities.find((o) => o.id === id)
    if (!opp) return
    const remaining = state.opportunities.filter((o) => o.id !== id)
    if (opp.kind === 'freelance') {
      const gig: ActiveGig = { ...opp, daysRemaining: opp.durationDays }
      set({ opportunities: remaining, activeGigs: [...state.activeGigs, gig] })
      get().addLog(`Accepted freelance gig: "${opp.title}" (${formatInr(opp.payout)} on completion).`)
      get()._completeQuest('try-freelance')
    } else if (opp.kind === 'job') {
      set({ opportunities: remaining, devJobActive: true })
      get().addLog(`Accepted job offer: "${opp.title}".`)
    } else {
      set({ opportunities: remaining })
      get().startBusiness(opp.title.replace('Opportunity: ', ''))
    }
    get()._checkQuests()
  },

  declineOpportunity: (id) => {
    set({ opportunities: get().opportunities.filter((o) => o.id !== id) })
  },

  addLog: (message, kind = 'player') => {
    const state = get()
    const entry: LogEntry = { id: nextId(), day: state.day, message, kind }
    set({ log: [entry, ...state.log].slice(0, 60) })
  },

  meetResident: (id, name, role) => {
    const contacts = get().contacts
    set({ contacts: { ...contacts, [id]: { name, role, meetings: (contacts[id]?.meetings ?? 0) + 1 } } })
  },

  setResidentOverride: (id, override) => {
    set({ residentOverrides: { ...get().residentOverrides, [id]: override } })
  },

  openAssistant: () => set({ assistantOpen: true }),
  closeAssistant: () => set({ assistantOpen: false }),

  askMira: async (question) => {
    const trimmed = question.trim().slice(0, 1500)
    if (!trimmed || get().miraThinking) return
    const state = get(), request = ++miraRequest
    const playerMsg: ChatMessage = { id: nextId(), role: 'player', text: trimmed }
    const messages = [...state.chat, playerMsg].slice(-20)
    set({ chat: messages, miraThinking: true, miraNotice: '' })
    const context = { player: state.playerName, day: state.day, hour: state.hour, moneyINR: Math.round(state.money), health: state.health, efficiency: state.efficiency(), commitments: state.commitmentCount(), jobActive: state.devJobActive, startupCostINR: BUSINESS_STARTUP_COST, businesses: state.businesses.map(b => b.name), gigs: state.activeGigs.map(g => ({ title: g.title, days: g.daysRemaining })), quest: state.activeQuest(), inventory: state.inventory.map(i => i.name), neighboursMet: Object.keys(state.contacts).length }
    const reply = await conversationReply(`You are Mira, the warm, practical companion in Forge of One, an offline career and community life-sim. Speak in 2-4 concise sentences. Help with careers, planning, focus, exploring, and learning. Use only this live game state for facts: ${JSON.stringify(context)}. Currency is INR. Current game actions are work, freelance opportunities, businesses, exploring, collecting items, and talking to neighbours. Do not claim to perform actions or change money. Do not invent game mechanics. If asked about an unavailable feature, say it is not built yet.`, messages.map(m => ({ role: m.role === 'mira' ? 'assistant' : 'user', content: m.text })), buildMiraReply(state, trimmed))
    if (request !== miraRequest) return
    set({ chat: [...get().chat, { id: nextId(), role: 'mira' as const, text: reply.text }].slice(-24), miraThinking: false, miraNotice: reply.notice })
    get()._completeQuest('ask-mira')
  },

  _completeQuest: (id) => {
    const state = get()
    const target = state.quests.find((q) => q.id === id)
    if (!target || target.completed) return
    set({ quests: state.quests.map((q) => (q.id === id ? { ...q, completed: true } : q)) })
    get().addLog(`Objective complete: "${target.title}".`)
  },

  _checkQuests: () => {
    const state = get()
    if (state.money >= 50000) get()._completeQuest('steady-books')
    if (state.businesses.length > 0) get()._completeQuest('first-venture')
    if (state.day >= 2) get()._completeQuest('first-paycheck')
    if (state.commitmentCount() > FOCUS_CAPACITY) {
      if (!state.everOvercommitted) set({ everOvercommitted: true })
      get()._completeQuest('overcommitted')
    }
    if (Object.keys(state.discoveries).length > 0) get()._completeQuest('explore-beyond')
  },

  _runDailyTick: (newDay) => {
    const state = get()
    const eff = get().efficiency()
    let money = state.money
    let health = state.health

    if (state.devJobActive) money += DEV_JOB_DAILY_INCOME * eff
    for (const biz of state.businesses) {
      const variance = 0.8 + Math.random() * 0.4
      money += biz.dailyRevenueBase * eff * variance
    }

    const finishedGigs: string[] = []
    const remainingGigs = state.activeGigs
      .map((gig) => ({ ...gig, daysRemaining: gig.daysRemaining - 1 }))
      .filter((gig) => {
        if (gig.daysRemaining <= 0) {
          money += gig.payout * eff
          finishedGigs.push(gig.title)
          return false
        }
        return true
      })

    money -= DAILY_LIVING_COST

    let sickToday = false
    if (Math.random() < SICK_CHANCE) {
      sickToday = true
      money -= SICK_COST
      health = Math.max(0, health - 10)
    } else {
      health = Math.min(100, health + 2)
    }

    let opportunities = state.opportunities
    let spawned = false
    if (opportunities.length < MAX_OPEN_OPPORTUNITIES && Math.random() < OPPORTUNITY_SPAWN_CHANCE) {
      const template = OPPORTUNITY_POOL[Math.floor(Math.random() * OPPORTUNITY_POOL.length)]
      opportunities = [...opportunities, { ...template, id: nextId() }]
      spawned = true
    }

    // --- World simulation: rival businesses open and close independent of the player ---
    let rivals = state.rivalBusinesses
    const openRivals = rivals.filter((r) => !r.closed)
    let rivalOpened: RivalBusiness | null = null
    if (openRivals.length < MAX_RIVAL_BUSINESSES && Math.random() < RIVAL_SPAWN_CHANCE) {
      const usedNames = new Set(rivals.map((r) => r.name))
      const candidates = RIVAL_NAME_POOL.filter((c) => !usedNames.has(c.name))
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        rivalOpened = { id: nextId(), name: pick.name, sector: pick.sector, foundedOnDay: newDay, closed: false }
        rivals = [...rivals, rivalOpened]
      }
    }
    const rivalsClosed: RivalBusiness[] = []
    rivals = rivals.map((r) => {
      if (r.closed) return r
      const age = newDay - r.foundedOnDay
      const closeChance = RIVAL_BASE_CLOSE_CHANCE * (1 + age / 60)
      if (age > 3 && Math.random() < closeChance) {
        rivalsClosed.push(r)
        return { ...r, closed: true }
      }
      return r
    })

    // --- NPC flavor: occasional sightings of townsfolk doing their own thing ---
    let npcLine: string | null = null
    if (Math.random() < NPC_FLAVOR_CHANCE) {
      const npc = NPC_NAME_POOL[Math.floor(Math.random() * NPC_NAME_POOL.length)]
      const activity = NPC_ACTIVITY_POOL[Math.floor(Math.random() * NPC_ACTIVITY_POOL.length)]
      npcLine = `You spot ${npc} ${activity}.`
    }

    set({ money, health, activeGigs: remainingGigs, opportunities, rivalBusinesses: rivals })

    get().addLog(`Day ${newDay} began. Living costs paid (${formatInr(DAILY_LIVING_COST)}), efficiency was ${(eff * 100).toFixed(0)}%.`)
    finishedGigs.forEach((title) => get().addLog(`Freelance gig completed: "${title}".`))
    if (sickToday) get().addLog(`Got sick -- lost health and paid ${formatInr(SICK_COST)} for care.`)
    if (spawned) get().addLog('A new opportunity appeared in the world.')
    if (rivalOpened) get().addLog(`"${rivalOpened.name}" opened downtown -- a new ${rivalOpened.sector}.`, 'world')
    rivalsClosed.forEach((r) => get().addLog(`"${r.name}" shut its doors after ${newDay - r.foundedOnDay} days in business.`, 'world'))
    if (npcLine) get().addLog(npcLine, 'world')

    get()._checkQuests()
    if (rivalOpened || rivalsClosed.length > 0) get()._completeQuest('watch-world')
  },
}))
