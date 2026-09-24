export type OpportunityKind = 'freelance' | 'job' | 'business'

export interface Opportunity {
  id: string
  kind: OpportunityKind
  title: string
  payout: number
  durationDays: number
  /** Town this posting is based in -- every kind is anchored to a real town
   *  somewhere in the generated world, never left as an abstract "remote"
   *  gig, so postings feel like they're coming from a real, sprawling
   *  economy. */
  location?: string
  /** Who's actually offering this -- a real company's name for a `job`
   *  posting, or a real person's name for a `freelance` one. Not set for
   *  `business` (that's the player founding their own venture, not working
   *  for someone). Always picked by game code from a real building/resident
   *  that already exists in `location` -- never invented flavor text -- so
   *  the player could in principle walk there. See world/residents.ts's
   *  pickEmployer(). */
  employer?: string
  /** The real building (see world/generation.ts's Building.id) `employer`
   *  is physically based at -- the company's premises for a `job`, or the
   *  client's own home for a `freelance` gig. */
  employerBuildingId?: string
  /** The actual person the player would deal with, present at
   *  employerBuildingId -- a manager resident found working at the company
   *  for a `job` posting, or (same name as `employer`) the client
   *  themself for `freelance`. Left unset only in the rare case no
   *  resident could be matched to the building. */
  contact?: string
  /** Sim day this posting appeared -- lets a stale, never-acted-on posting
   *  get pruned instead of sitting on the board forever. */
  postedOnDay?: number
  /** Set on a posting drafted by the connected local model rather than
   *  pulled from the static pool. */
  aiGenerated?: true
}

export interface ActiveGig extends Opportunity {
  daysRemaining: number
}

export type PremisesType = 'rented' | 'owned'

/** A real resident who's expressed interest in an opening posted at one of
 *  the player's own businesses (see gameStore's postOpening/pickApplicants
 *  in world/residents.ts) -- same "no invented people" rule as Opportunity's
 *  employer/contact: `id` is that resident's actual id, so hiring them
 *  (hireApplicant) can mark them unavailable to every other posting at the
 *  same time. Sits on Business.applicants until hired or declined. */
export interface Applicant {
  id: string
  name: string
  role: string
  interest: string
  /** Carried straight from the real resident's own Resident.sprite (world/
   *  residents.ts) so, if hired onsite, they visibly look like the same
   *  person once they show up at the business instead of at their old
   *  routine. */
  sprite: number
}

/** A real resident the player has actually hired into one of their own
 *  businesses -- `id` is the same stable resident id Applicant carried, so
 *  one person can't be on two payrolls at once (see gameStore's
 *  hireApplicant). `dailyWage` and `dailyRevenueBonus` are both fixed at
 *  hire time and never renegotiated; the daily tick applies wage as a flat
 *  cost and revenue bonus the same way business revenue is applied
 *  (efficiency/variance-scaled), so hiring is a real trade-off, not free
 *  money. */
export interface Employee {
  id: string
  name: string
  role: string
  hiredOnDay: number
  dailyWage: number
  dailyRevenueBonus: number
  sprite: number
  /** 'onsite' means this real person actually shows up near the business
   *  -- see world/residents.ts's employeeResidents(), rendered through the
   *  same position pipeline as every other resident. 'remote' means they
   *  stay wherever they already were; no physical presence is added for
   *  them. Chosen by the player at hire time (see gameStore's
   *  hireApplicant), not decided by the job itself. */
  workMode: 'onsite' | 'remote'
}

export interface Business {
  id: string
  name: string
  dailyRevenueBase: number
  foundedOnDay: number
  /** Whether this venture rents an existing office or owns land it built
   *  on -- set once at founding, drives ongoing costs below. */
  premises: PremisesType
  /** Town name this business is based in. */
  location: string
  /** Recurring rent, charged daily (as a 1/30th share) -- only set when
   *  premises === 'rented'. Owned buildings have no recurring rent. */
  monthlyRent?: number
  /** Days of construction left before an owned building opens for business
   *  and starts earning -- only set when premises === 'owned'. Absent or 0
   *  means the building is finished (or this business rents, and so never
   *  had a build phase). */
  buildDaysRemaining?: number
  /** Real people currently on staff -- see Employee above. Optional so
   *  businesses founded before v0.18 (which have neither field saved)
   *  still load fine; every read site falls back to `?? []`. */
  employees?: Employee[]
  /** Real candidates from the most recent postOpening() call, waiting on
   *  an accept/decline -- cleared (or replaced) once acted on. */
  applicants?: Applicant[]
}

export interface LogEntry {
  id: string
  day: number
  message: string
  kind?: 'player' | 'world'
}

export interface Quest {
  id: string
  title: string
  description: string
  hint: string
  completed: boolean
}

export interface RivalBusiness {
  id: string
  name: string
  sector: string
  foundedOnDay: number
  closed: boolean
  /** Town this rival is based in -- rivals are spread across the whole
   *  generated world, not just the player's home town. */
  location: string
}

export interface ChatMessage {
  id: string
  role: 'player' | 'mira'
  text: string
}

export interface CollectedItem {
  id: string
  name: string
  category: 'artifact' | 'material' | 'food'
  description: string
  quantity: number
}

export type TileType = 'grass' | 'path' | 'plot' | 'plaza' | 'water' | 'sand' | 'bridge' | 'field'

export interface PointOfInterest {
  key: string
  label: string
  flavor: string
  reward: number
  item?: Omit<CollectedItem, 'quantity'>
  /** When set, this tile is a fixed town landmark -- standing on it offers
   *  to open this screen (by id) instead of a one-time "investigate". */
  screen?: string
  /** When set, this tile is a physical shop's doorstep -- standing on it
   *  offers to step inside (ShopInterior) instead of a one-time
   *  "investigate" or a big app screen. See Building.shopType in
   *  world/generation.ts, which is where this gets assigned. */
  shop?: 'food' | 'book'
}

/** The categories a food shop's stock is grouped into -- "different types of
 *  foods... in different place[s]" per the design ask, though today every
 *  food-shop building shows the same full catalog grouped by these
 *  categories, rather than each shop specializing in just one. */
export type FoodCategory = 'fruit' | 'bakery' | 'fast-food' | 'drink'

/** A purchasable food item at a physical food shop (see world/shopping.ts's
 *  FOOD_CATALOG) -- hand-written, not AI-generated, since these are just
 *  flavor + fixed numbers, not open-ended scenario content. Buying one adds
 *  it to the player's CollectedItem inventory (category 'food'); eating a
 *  stored one (gameStore's eatStored) looks the relief/healthBonus back up
 *  here by id. */
export interface FoodItem {
  id: string
  name: string
  category: FoodCategory
  price: number
  /** Hunger (craving) relief from eating one, same scale as the existing
   *  cheap/quality quick-eat tiers. */
  relief: number
  healthBonus?: number
  description: string
}

/** A book on sale at the bookshop -- title/blurb are flavor text only
 *  (hand-written fallback, or AI-drafted when a local model is connected),
 *  price is a fixed number same as everything else purchasable. */
export interface Book {
  id: string
  title: string
  blurb: string
  price: number
  /** Set on a book drafted by the connected local model rather than one of
   *  the static fallback titles -- same convention as Challenge/Opportunity. */
  aiGenerated?: true
}

/** A book the player has bought, kept in their home library (gameStore's
 *  `library`). Reading it (gameStore's readBook) appends a short quote/note
 *  -- AI-drafted when connected, a hand-written fallback line otherwise --
 *  this is flavor text only, same safety rule as every other AI feature. */
export interface OwnedBook extends Book {
  notes: string[]
}

export type Decor =
  | 'tree1' | 'tree2' | 'tree3' | 'fence'
  | 'bigtree-a' | 'bigtree-b' | 'goldtree-a' | 'goldtree-b' | 'goldtree-c'
  | 'house-grey' | 'house-red' | 'flowers' | 'sprig' | 'signpost' | 'fencepost' | 'well'
  | 'rock' | 'relic' | 'campfire' | 'crate' | 'bench' | 'mushrooms' | 'ruin'
  | null

export type SkillDomain =
  | 'architecture' | 'code-review' | 'debugging' | 'legacy-code' | 'db-modeling'
  | 'estimation' | 'incident-response' | 'refactoring' | 'ai-systems' | 'security' | 'performance'
  | 'technical-writing' | 'negotiation' | 'interviewing' | 'teaching' | 'requirements' | 'personal-finance' | 'public-speaking'

export interface ChallengeOption {
  label: string
  /** What happened, told straight -- shown after picking this option. */
  outcome: string
  /** The actual lesson, written at a working engineer's level, not a
   *  beginner's -- this is the point of the whole system. */
  lesson: string
  deltaMoney?: number
  deltaHealth?: number
  deltaFocus?: number
  /** Skill points earned in this challenge's domain -- always applied,
   *  the better option just earns more. */
  skillGain: number
}

/** A situation pulled from work, running a business, or ordinary life --
 *  the actual mechanism for "learning happens while you play." Each one
 *  ties to a real skill domain from the game's skill-coaching list and
 *  offers a few genuinely different approaches, not a right-answer quiz. */
export interface Challenge {
  id: string
  domain: SkillDomain
  source: 'dev' | 'business' | 'life'
  title: string
  scenario: string
  options: ChallengeOption[]
  /** Scale of the situation -- a 'big' one runs bigger deltas and more
   *  skillGain. Absent on the older hand-written entries, which read as
   *  'small'/'medium' either way; AI-generated ones always set it,
   *  scaled up as the player's skill in that domain grows. */
  difficulty?: 'small' | 'big'
  /** Set on a challenge drafted by the connected local model rather than
   *  hand-written -- lets the pool it lives in (and its removal once
   *  used) be told apart from the fixed seed content. */
  aiGenerated?: true
}

export interface Loan {
  principal: number
  dailyPayment: number
  daysRemaining: number
}

export interface Tile {
  type: TileType
  poi: PointOfInterest | null
  decor: Decor
  walkable: boolean
  buildingId?: string
}
