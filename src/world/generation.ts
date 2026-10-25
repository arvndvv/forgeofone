import type { Decor, PointOfInterest, Tile } from '../types/game'
import { BIOMES, regionBiome, type Biome } from './regions'
import { FOOD_SHOP_NAMES, BOOK_SHOP_NAME } from './shopping'

export interface Point { x: number; y: number }
export interface Building extends Point {
  id: string
  width: number
  height: number
  door: Point
  label: string
  kind: 'home' | 'shop' | 'work' | 'civic'
  roof: number
  poi?: PointOfInterest
  /** Set on a kind:'shop' building whose flavor name (see SHOPS below) maps
   *  to a physical, explorable shop -- its doorstep poi gets `shop` set to
   *  match (see poi assignment below), which is what tells WorldView to open
   *  a ShopInterior instead of treating it as a decorative building. Workshop
   *  and Flower Shop are left untagged for now, still purely decorative. */
  shopType?: 'food' | 'book'
  /** Set when this building comes from a TOWN_LANDMARKS entry: that entry's
   *  stable id. This is what a resident's `home` (residents.ts) points at. */
  landmarkId?: string
  /** The landmark's `description`, if any -- what the place is like,
   *  given to the local model whenever a resident is in or near it. */
  description?: string
}
export interface Settlement extends Point {
  id: string
  name: string
  buildings: Building[]
  park: Point
  biome: Biome
}

export const REGION_SIZE = 64
export const CHUNK_SIZE = 16
const MAX_CHUNKS = 128
const MAX_REGIONS = 64
const chunks = new Map<string, Tile[]>()
const settlements = new Map<string, Settlement>()
export const mod = (n: number, d: number) => ((n % d) + d) % d

// Integer multiplication keeps all seed bits; multiplying large JS floats used
// to erase seed differences. Floor division also makes negative chunks seamless.
export function hashCoord(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, seed: number, scale: number) {
  const gx = Math.floor(x / scale), gy = Math.floor(y / scale)
  const sx = mod(x, scale) / scale, sy = mod(y, scale) / scale
  const u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy)
  const a = hashCoord(gx, gy, seed), b = hashCoord(gx + 1, gy, seed)
  const c = hashCoord(gx, gy + 1, seed), d = hashCoord(gx + 1, gy + 1, seed)
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V, max: number) {
  cache.set(key, value)
  if (cache.size > max) cache.delete(cache.keys().next().value!)
  return value
}

const PREFIXES = ['Willow', 'Amber', 'Cedar', 'Fern', 'Maple', 'Birch', 'Moss', 'Oak']
const SUFFIXES = ['brook', 'field', 'haven', 'ridge', 'wick', 'meadow']
const SHOPS = ['Bakery', 'General Store', 'Coffee House', 'Bookshop', 'Workshop', 'Flower Shop']
type Landmark = { col: number; row: number; label: string; screen?: string; flavor?: string }
/** A hand-authored building in TOWN_LANDMARKS. `id` is the stable handle
 *  everything else links to -- a resident's `home` in PINNED_RESIDENTS
 *  (residents.ts) is this id -- so keep it unchanged once used. */
export type TownLandmark = Landmark & {
  id: string
  /** What the place is like, in a sentence or two -- inside and out. Given to
   *  the local model whenever a resident is in or near it, so concrete
   *  details ("a green door, a bench out front, a fireplace inside") show
   *  up naturally in conversation. Optional. */
  description?: string
}
// The origin town's core landmarks open the app's own screens -- these are
// part of the game itself, not meant to be edited casually.
const CORE_LANDMARKS: Landmark[] = [
  { col: 1, row: 1, label: 'Dev Desk', screen: 'work' },
  { col: 2, row: 1, label: 'Your Ventures', screen: 'ventures' },
  { col: 2, row: 2, label: 'The Job Board', screen: 'opportunities' },
  { col: 1, row: 2, label: 'Hall of Records', screen: 'chronicle' },
  // The bank is deliberately NOT in the quick tab bar (App.tsx's TAB_DEFS) --
  // per the locked design, banking (taking/viewing a loan) is meant to be
  // physical-only, unlike every other screen here which is reachable both
  // by walking AND by tab. Cash-in-hand and savings interest still show
  // (passively) on Life & Home; only the loan teller service is gated here.
  { col: 0, row: 1, label: 'The Bank', screen: 'bank' },
]

/** Extra named/landmark buildings for any town, keyed by region id "rx,ry"
 *  (Founders Green, the start town, is "0,0"). Add an entry here to give a
 *  specific town a custom building beyond its procedurally-generated homes
 *  and shops -- for example a mentor's workshop with its own name and
 *  flavor text, optionally paired with a PINNED_RESIDENTS entry (in
 *  residents.ts) so a specific character is always found there.
 *
 *  col/row picks the building's slot in that town's 4x4 grid (0-3, 0-3).
 *  The slot col===3 && row===1 is always the public garden and can't be
 *  used; for the origin town, also avoid the four CORE_LANDMARKS slots
 *  above; for any non-origin town in a woodland or highlands biome, row 0
 *  col 1 and col 2 are skipped too (that biome leaves those two slots
 *  empty), so pick a different slot there. `screen` is optional -- only
 *  set it if entering the building should open one of the app's own
 *  screens; leave it out for a building that's just a named place with
 *  its own flavor text. */
export const TOWN_LANDMARKS: Record<string, TownLandmark[]> = {
  '1,0': [{
    id: 'test-house', col: 0, row: 0, label: 'Test House', flavor: 'Testing house',
    description: 'A small stone cottage with a green door and a bench out front. Inside: a low beamed room, a crackling fireplace, a worn armchair and shelves of old ledgers.',
  }, {
    id: 'old-trade-post', col: 1, row: 2, label: 'Old Trade Post', flavor: 'Dusty shelves of shipping records and a long wooden counter.',
    description: 'The town’s first trading counter, now a little records room: a long scuffed counter, crates of shipping ledgers and a faded route map on the wall.',
  }],
}

/** Where a TOWN_LANDMARKS entry lives, by its id -- the town key ("rx,ry")
 *  and the entry itself. Undefined for an unknown id. */
export function findLandmark(id: string): { townKey: string; landmark: TownLandmark } | undefined {
  for (const [townKey, list] of Object.entries(TOWN_LANDMARKS)) {
    const landmark = list.find(l => l.id === id)
    if (landmark) return { townKey, landmark }
  }
  return undefined
}

// Catch authoring mistakes early (dev only): duplicate ids, or a landmark in
// a slot that is never built (the garden, or a core landmark's slot).
if (import.meta.env?.DEV) {
  const seen = new Set<string>()
  for (const [townKey, list] of Object.entries(TOWN_LANDMARKS)) for (const l of list) {
    if (seen.has(l.id)) console.warn(`[world] TOWN_LANDMARKS: duplicate id "${l.id}" -- ids must be unique across all towns.`)
    seen.add(l.id)
    if (l.col === 3 && l.row === 1) console.warn(`[world] TOWN_LANDMARKS "${l.id}": slot col 3, row 1 is always the public garden -- pick another slot.`)
    if (townKey === '0,0' && CORE_LANDMARKS.some(c => c.col === l.col && c.row === l.row)) console.warn(`[world] TOWN_LANDMARKS "${l.id}": that slot in Founders Green is taken by "${CORE_LANDMARKS.find(c => c.col === l.col && c.row === l.row)!.label}".`)
  }
}

export function getSettlement(rx: number, ry: number, seed: number): Settlement {
  const key = `${seed}:${rx},${ry}`
  const cached = settlements.get(key)
  if (cached) return cached
  const x = rx * REGION_SIZE, y = ry * REGION_SIZE
  const origin = rx === 0 && ry === 0
  const townKey = `${rx},${ry}`
  const biome = regionBiome(rx, ry, seed)
  const name = origin ? 'Founders Green' : PREFIXES[Math.floor(hashCoord(rx, ry, seed + 11) * PREFIXES.length)] + SUFFIXES[Math.floor(hashCoord(rx, ry, seed + 12) * SUFFIXES.length)]
  const buildings: Building[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      // The north-east block is a public garden, with room to gather.
      if (col === 3 && row === 1) continue
      if (!origin && row === 0 && (col === 1 || col === 2) && (biome === 'woodland' || biome === 'highlands')) continue
      const core = origin ? CORE_LANDMARKS.find(l => l.col === col && l.row === row) : undefined
      const authored = core ? undefined : TOWN_LANDMARKS[townKey]?.find(l => l.col === col && l.row === row)
      const landmark: Landmark | undefined = core ?? authored
      const roll = hashCoord(x + col, y + row, seed + 27)
      const kind = landmark ? (landmark.screen === 'work' ? 'work' : 'civic') : row === 1 || row === 2 ? 'shop' : 'home'
      const shopName = SHOPS[Math.floor(roll * SHOPS.length)]
      const shopType: 'food' | 'book' | undefined = kind === 'shop' ? (FOOD_SHOP_NAMES.has(shopName) ? 'food' : shopName === BOOK_SHOP_NAME ? 'book' : undefined) : undefined
      const label = landmark?.label ?? (kind === 'home' ? `${1 + row * 4 + col} ${name} Lane` : `${name} ${shopName}`)
      const width = landmark ? 5 : kind === 'home' ? (roll < 0.5 ? 3 : 4) : (roll < 0.3 ? 4 : 5)
      const bx = x - 17 + col * 10 + (width === 3 ? 1 : 0), by = y - 17 + row * 10
      buildings.push({
        id: `${rx},${ry}:${col},${row}`, x: bx, y: by, width, height: 4,
        door: { x: bx + Math.floor(width / 2), y: by + 4 }, label, kind,
        roof: landmark?.screen === 'work' || landmark?.screen === 'chronicle' ? 0 : Math.floor(roll * 2),
        shopType,
        landmarkId: authored?.id, description: authored?.description,
        poi: landmark
          ? { key: landmark.screen ?? `landmark:${rx},${ry}:${col},${row}`, label, screen: landmark.screen, flavor: landmark.flavor ?? 'Come in and take a look.', reward: 0 }
          : shopType
          ? { key: `shop:${rx},${ry}:${col},${row}`, label, flavor: shopType === 'food' ? 'The smell of fresh food drifts out the door.' : 'Shelves of books line the walls, softly lit.', reward: 0, shop: shopType }
          : undefined,
      })
    }
  }
  return remember(settlements, key, { id: `${rx},${ry}`, x, y, name, biome, buildings, park: { x: x + 15, y: y - 4 } }, MAX_REGIONS)
}

export function getSites(town: Settlement): Array<Point & { poi: PointOfInterest; decor: Decor }> {
  const woodland = town.biome === 'woodland', rocky = town.biome === 'highlands'
  return [
    { x: town.x - 24, y: town.y - 8, decor: 'relic', poi: {
      key: `relic:${town.id}`, label: rocky ? 'Old Survey Station' : 'Wayfarer’s Ruins', reward: 0,
      flavor: 'Among the weathered stones lies a keepsake from an earlier traveller. You carefully add it to your collection.',
      item: { id: rocky ? 'survey-compass' : 'trade-token', name: rocky ? 'Brass Survey Compass' : 'Old Trade Token', category: 'artifact', description: rocky ? 'Its scratched rim records journeys through the hills.' : 'A copper token from the first shops along this route.' },
    } },
    { x: town.x + 12, y: town.y + 25, decor: woodland ? 'mushrooms' : 'crate', poi: {
      key: `supplies:${town.id}`, label: woodland ? 'Forager’s Clearing' : 'Community Harvest', reward: 0,
      flavor: woodland ? 'A local guide has marked these mushrooms as part of the community harvest.' : 'A little sign invites travellers to take a share of the harvest.',
      item: { id: woodland ? 'woodland-mushrooms' : 'orchard-apples', name: woodland ? 'Woodland Mushrooms' : 'Orchard Apples', category: 'food', description: 'A small gift from the people who tend this land.' },
    } },
    { x: town.x - 12, y: town.y + 25, decor: 'campfire', poi: {
      key: `camp:${town.id}`, label: 'Travellers’ Camp', reward: 0,
      flavor: 'A dry bench, a warm fire, and a notebook full of stories from the road. You keep a loose page as a memento.',
      item: { id: 'travellers-notes', name: 'Travellers’ Notes', category: 'artifact', description: 'Stories about the trades, places and people of the Greenway.' },
    } },
  ]
}

export function settlementAt(x: number, y: number, seed: number) {
  return getSettlement(Math.floor((x + REGION_SIZE / 2) / REGION_SIZE), Math.floor((y + REGION_SIZE / 2) / REGION_SIZE), seed)
}

export function nearbySettlements(x: number, y: number, seed: number, radius: number) {
  const result: Settlement[] = []
  for (let ry = Math.floor((y - radius + 32) / 64); ry <= Math.floor((y + radius + 32) / 64); ry++) {
    for (let rx = Math.floor((x - radius + 32) / 64); rx <= Math.floor((x + radius + 32) / 64); rx++) result.push(getSettlement(rx, ry, seed))
  }
  return result
}

/** A fixed slate of real, already-generated towns spread across the world --
 *  the pool the economy simulation (rival businesses, job/business
 *  postings, the player's own "found a firm" flow, and now dynamic
 *  experts) draws locations from, so "multiple companies across the
 *  world" means actual named towns the player can walk to, not flavor
 *  text. A 7x7 block of regions centered on the origin town -- 49 towns,
 *  always includes Founders Green itself. Widened from a 5x5/25-town
 *  block in v0.23 as a deliberately modest, scoped-down stand-in for
 *  on-demand "town adding": the settlement generator itself is still a
 *  pure, cached function of (seed, coordinates) with nothing invented at
 *  runtime (see MAX_REGIONS above -- 49 fits well under its 64-region
 *  cache cap), this just widens the slice of that same deterministic
 *  world the economy simulation is allowed to draw from. */
export function listWorldTowns(seed: number): Settlement[] {
  return nearbySettlements(0, 0, seed, 200)
}

function tile(type: Tile['type'], decor: Decor = null, walkable = true, poi: PointOfInterest | null = null): Tile {
  return { type, decor, walkable, poi }
}

export function riverDistance(x: number, y: number, seed: number) {
  // The river lives between towns, meandering continuously through all chunks.
  const bend = Math.sin(y / 19 + seed % 17) * 2 + Math.sin(y / 47) * 1.5
  return Math.abs(mod(x - 32 - bend + 32, 64) - 32)
}

function generateTile(x: number, y: number, seed: number): Tile {
  const town = settlementAt(x, y, seed)
  const lx = x - town.x, ly = y - town.y
  const ax = Math.abs(lx), ay = Math.abs(ly)
  const inTown = ax <= 21 && ay <= 21
  const river = riverDistance(x, y, seed)
  const highway = ax <= 1 || ay <= 1
  const street = inTown && (mod(lx, 10) === 0 || mod(ly, 10) === 0)
  // The square is one continuous paved surface, with the well off the main
  // road. Apply it before roads, otherwise the avenue erases the whole square.
  if (inTown && ax <= 3 && ay <= 3 && (ax < 3 || ay < 3)) {
    if (lx === 2 && ly === -2) return tile('plaza', 'well', false)
    return tile('plaza')
  }
  if (highway || street) return tile(river < 3 ? 'bridge' : 'path')
  if (river < 2.5) return tile('water', null, false)
  if (river < 3.6) return tile('sand')

  for (const site of getSites(town)) {
    const dx = Math.abs(x - site.x), dy = Math.abs(y - site.y)
    if (dx <= 2 && dy <= 2) {
      if (dx === 0 && dy === 0) return tile('plot', site.decor, true, site.poi)
      if (site.decor === 'relic' && dx === 2 && dy === 2) return tile('plot', 'ruin', false)
      return tile('plot')
    }
    // Short clear approaches connect the composed sites to existing roads.
    if (site.x < town.x - 20 && y === site.y && x > site.x && x <= town.x - 20) return tile('path')
    if (site.y > town.y + 20 && x === site.x && y >= town.y + 20 && y < site.y) return tile('path')
  }

  if (inTown) {
    // Buildings own every cell in their footprint; doors remain reachable.
    for (const b of town.buildings) {
      if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return { ...tile('plot', null, false), buildingId: b.id }
      if (x === b.door.x && y === b.door.y) return tile('plaza', null, true, b.poi ?? {
        key: b.id, label: b.label, flavor: b.kind === 'home' ? 'A well-tended doorstep. Someone has made a life here.' : 'The bell above the door rings. Neighbours catch up while the shopkeeper tends the counter.', reward: 0,
      })
      if (x === b.door.x && y > b.door.y && y < Math.ceil((b.door.y - town.y) / 10) * 10 + town.y) return tile('plaza')
      // A little front garden, kept clear of the entrance.
      if (y === b.door.y + 1 && x >= b.x && x < b.x + b.width && x !== b.door.x) return tile('grass', 'flowers')
    }
    if (lx >= 12 && lx <= 18 && ly >= -8 && ly <= -3) {
      if (ly === -7 && (lx === 13 || lx === 17)) return tile('grass', 'bench', false)
      if (ly === -5 || lx === 15) return tile('plaza')
      if ((lx === 12 || lx === 18) && (ly === -8 || ly === -3)) return tile('grass', 'tree2', false)
      return tile('grass', hashCoord(x, y, seed) < 0.28 ? 'flowers' : null)
    }
    if (ax > 19 || ay > 19) return tile('grass', hashCoord(x, y, seed + 8) < 0.22 ? 'flowers' : null)
    if (town.biome === 'farmland' && ly < -12 && lx > -9 && lx < -1 && !town.buildings.some(b => Math.abs(x - b.door.x) < 2)) return tile('field')
    const roll = hashCoord(x, y, seed + 4)
    // Street trees have generous spacing, never obstruct a path or doorway.
    if (mod(lx, 10) === 8 && mod(ly, 5) === 1) return tile('grass', 'tree2', false)
    return tile('grass', roll < 0.055 ? 'flowers' : null)
  }

  // Fields and wooded areas are continuous noise patches, not per-cell terrain rolls.
  const woodland = noise(x, y, seed + 42, 15)
  const wetland = noise(x, y, seed + 91, 11)
  if (wetland > 0.79 && ax > 24 && ay > 6) return tile('water', null, false)
  if (wetland > 0.74 && ax > 24 && ay > 6) return tile('sand')
  const roll = hashCoord(x, y, seed + 15)
  if (ay > 22 && ay < 29 && ax > 6 && ax < 18 && (town.biome === 'farmland' || town.biome === 'meadow')) return tile('field')
  // Discoveries are placed along the road so they can actually be reached.
  if (ay === 3 && ax === 25) return tile('sand', 'signpost', true, {
    key: `trail:${town.id}:${lx < 0 ? 'w' : 'e'}`, label: 'Old Trade Route',
    flavor: `A weathered waymarker points toward ${town.name}. You find a small purse left by a passing traveller.`, reward: 960,
  })
  if (town.biome === 'highlands' && roll < 0.13 && ax > 4 && ay > 4) return tile('grass', 'rock', false)
  if (woodland > 0.3 && roll < woodland * BIOMES[town.biome].trees && ax > 3 && ay > 3) return tile('grass', town.biome === 'autumn' || roll < 0.06 ? 'tree1' : 'tree2', false)
  if (town.biome === 'woodland' && roll > 0.85) return tile('grass', 'mushrooms')
  return tile('grass', roll < 0.055 ? 'flowers' : roll < 0.1 ? 'sprig' : null)
}

export function getTile(x: number, y: number, seed: number): Tile {
  const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE)
  const key = `${seed}:${cx},${cy}`
  let chunk = chunks.get(key)
  if (!chunk) {
    chunk = []
    for (let dy = 0; dy < CHUNK_SIZE; dy++) for (let dx = 0; dx < CHUNK_SIZE; dx++) chunk.push(generateTile(cx * CHUNK_SIZE + dx, cy * CHUNK_SIZE + dy, seed))
    remember(chunks, key, chunk, MAX_CHUNKS)
  }
  return chunk[mod(y, CHUNK_SIZE) * CHUNK_SIZE + mod(x, CHUNK_SIZE)]
}

export function getInteraction(x: number, y: number, seed: number): { point: Point; poi: PointOfInterest } | null {
  for (const p of [{ x, y }, { x, y: y - 1 }, { x: x - 1, y }, { x: x + 1, y }, { x, y: y + 1 }]) {
    const poi = getTile(p.x, p.y, seed).poi
    if (poi) return { point: p, poi }
  }
  return null
}

export function locationName(x: number, y: number, seed: number) {
  const town = settlementAt(x, y, seed)
  if (Math.max(Math.abs(x - town.x), Math.abs(y - town.y)) <= 21) return town.name
  if (riverDistance(x, y, seed) < 5) return 'Riverlands'
  return `${BIOMES[town.biome].name} · The Greenway`
}

export function clearWorldCaches() { chunks.clear(); settlements.clear() }
export function worldCacheSizes() { return { chunks: chunks.size, settlements: settlements.size } }
