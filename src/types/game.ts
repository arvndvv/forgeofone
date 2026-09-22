export type OpportunityKind = 'freelance' | 'job' | 'business'

export interface Opportunity {
  id: string
  kind: OpportunityKind
  title: string
  payout: number
  durationDays: number
}

export interface ActiveGig extends Opportunity {
  daysRemaining: number
}

export interface Business {
  id: string
  name: string
  dailyRevenueBase: number
  foundedOnDay: number
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
}

export type Decor =
  | 'tree1' | 'tree2' | 'tree3' | 'fence'
  | 'bigtree-a' | 'bigtree-b' | 'goldtree-a' | 'goldtree-b' | 'goldtree-c'
  | 'house-grey' | 'house-red' | 'flowers' | 'sprig' | 'signpost' | 'fencepost' | 'well'
  | 'rock' | 'relic' | 'campfire' | 'crate' | 'bench' | 'mushrooms' | 'ruin'
  | null

export interface Tile {
  type: TileType
  poi: PointOfInterest | null
  decor: Decor
  walkable: boolean
  buildingId?: string
}
