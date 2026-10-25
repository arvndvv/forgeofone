import { hashCoord, getSettlement, getTile, listWorldTowns, findLandmark, type Point, type Settlement } from './generation'
import { findPath } from './pathfinding'
import { facingForStep, type Facing } from './facing'
import type { Applicant, Employee, DynamicExpert, SkillDomain } from '../types/game'
import tamPortrait from '../assets/game/characters/npc-villager4.png'
export type Activity = 'walking' | 'baking' | 'gardening' | 'selling' | 'repairing' | 'painting' | 'delivery' | 'reading' | 'resting' | 'chatting' | 'sleeping' | 'cooking' | 'playing' | 'home'
/** Which drawn room a 'home' stop shows in HomeInterior.tsx -- picks the
 *  furniture (bed, table, bookshelf, ...). 'custom' is a plain room with a
 *  rug, for an activity that doesn't fit the others. */
export type SceneKind = 'reading' | 'cooking' | 'resting' | 'sleeping' | 'playing' | 'custom'
/** One thing a pinned resident does indoors, shown when the player looks
 *  inside their home while they're in this part of their schedule. Also
 *  used as a pool: the ambient/interaction system picks one at random
 *  rather than assigning it a fixed time slot. `action` is what the
 *  character is doing (drives which sprite shows, same as outdoors --
 *  see Resident.sprites); `scene` only picks the room's furniture and has
 *  no effect on the sprite. They're independent: two activities can share
 *  a scene ('reading' and 'resting' both `scene: 'custom'`, say) or share
 *  an action with a different backdrop. */
export interface IndoorActivity { action: Activity; scene: SceneKind; label: string; description: string }
interface Stop { point: Point; activity: string; action: Activity; duration: number; path: Point[]; start: number; travel: number; scene?: SceneKind; description?: string }
/** A player- or LLM-driven change to where a pinned resident is and what
 *  they're doing, overriding the ambient random pick until `until` (a
 *  simMinutesTotal value). Created by "What will you do next?" / "Can I
 *  come in?" in ResidentChat.tsx, stored in gameStore.residentOverrides,
 *  and consumed by pinnedResidentPosition() below. Not persisted to disk
 *  (the game has no save/load), so it's safe to keep purely in memory. */
export interface ResidentOverride {
  indoors: boolean; action?: Activity; activity?: string; scene?: SceneKind; description?: string; until: number
  /** Which of their places this is at -- 'home' (default) or 'work'. */
  at?: Place
  /** Walking there first: a tile path to follow in real time (Date.now()),
   *  one tile per `msPerTile` -- the same pace as the player, so the two
   *  can walk together. Once it's done they're simply at the destination. */
  journey?: { path: Point[]; startedAt: number; msPerTile: number; to: string }
}
/** A pinned resident's two possible places: their home landmark, or their work landmark. */
export type Place = 'home' | 'work'
export interface Resident {
  id: string; name: string; role: string; town: string; workplace: string; interest: string; sprite: number
  home: Point; stops: Stop[]; duration: number; shift: number; lane: number; backstory?: string
  /** How they talk and behave -- see PinnedResident.personality. */
  personality?: string
  /** Pinned residents: the landmark building they live in (PinnedResident.home),
   *  so conversation can name it and describe it rather than "their house". */
  place?: { id: string; label: string; description?: string }
  /** Pinned residents with a `work` landmark: that building, its door and
   *  the spot by it where they stand (like `post` for home). */
  workPlace?: { id: string; label: string; description?: string; door: Point; post: Point }
  workActivities?: Array<{ action: Activity; label: string; description?: string }>
  workShare?: number
  /** Chat portrait shown top-left of their chat box (see ResidentPortrait.tsx).
   *  Import a transparent-background PNG and pass its path; left unset, the
   *  chat falls back to a code-drawn portrait using `sprite`'s outfit. */
  portrait?: string
  /** Per-state world sprite, keyed by the Activity they're currently doing
   *  ('baking', 'reading', 'sleeping', ...) -- the SAME lookup indoors and
   *  outdoors (HomeInterior.tsx uses this too, keyed by `action`, never by
   *  `scene`), with an optional `default` for anything not listed. When the
   *  current action has no match here, it falls back to the normal
   *  code-drawn character. Import transparent PNGs and give each a target
   *  height of about 1.5 world tiles for a good fit; width scales to match
   *  the image's own aspect ratio. */
  sprites?: Partial<Record<Activity, string>> & { default?: string }
  /** Set only for a pinned resident with a real home building (see
   *  PinnedResident.indoorActivities) -- the id of that building, so
   *  WorldView can find "who lives here" for a door the player is standing
   *  at even while that resident is invisible (indoors) and not in the
   *  visible list. */
  homeBuildingId?: string
  /** Pinned residents only -- which skill-coaching domains (see
   *  types/game.ts SkillDomain) this specific character is "the expert"
   *  for. gameStore's refillAIChallenges() looks this up: when it drafts a
   *  challenge in one of these domains, it names this character in the
   *  scenario instead of an anonymous coworker, using their role/interest/
   *  backstory below -- a real "character definition" the AI-generated
   *  story can build on, not just a random encounter. Optional -- leave
   *  unset for a resident who's just flavor and never anchors a challenge. */
  expertise?: SkillDomain[]
  /** Pinned residents only, below -- mirrors of the matching PinnedResident
   *  fields, copied onto the Resident so residentPosition() can compute a
   *  position from (resident, simMinutes, override) alone, with no need to
   *  look the PinnedResident config back up. See pinnedResidentPosition(). */
  post?: Point
  outdoorActivities?: Array<{ action: Activity; label: string; description?: string }>
  indoorActivities?: IndoorActivity[]
  indoorShare?: number
  bucketMinutes?: number
}
export interface ResidentPosition extends Point { resident: Resident; moving: boolean; facing: Facing; activity: string; action: Activity; visible: boolean; scene?: SceneKind; description?: string; at?: Place }
const NAMES = ['Asha', 'Devon', 'Priya', 'Sam', 'Ravi', 'Elena', 'Tomas', 'Nisha', 'Marcus', 'Kavya', 'Mina', 'Arun', 'Isha', 'Leo', 'Noor', 'Kiran', 'Maya', 'Jules', 'Tara', 'Owen', 'Amir', 'Zoya', 'Remy', 'Anika']
const ROLES = ['Baker', 'Gardener', 'Shopkeeper', 'Carpenter', 'Designer', 'Courier', 'Teacher', 'Bookseller']
const JOBS: Array<{ action: Activity; description: string; interest: string }> = [
  { action: 'baking', description: 'Preparing bread at the outdoor baking table', interest: 'good food and running a small business' },
  { action: 'gardening', description: 'Watering the community garden', interest: 'growing food and looking after the neighbourhood' },
  { action: 'selling', description: 'Arranging produce at the market stall', interest: 'customers, stock and fair prices' },
  { action: 'repairing', description: 'Repairing a chair at the workbench', interest: 'making useful things and quoting a fair price' },
  { action: 'painting', description: 'Sketching a new shop sign', interest: 'design, clear communication and freelance work' },
  { action: 'delivery', description: 'Sorting parcels for the next delivery', interest: 'finding routes and meeting people' },
  { action: 'reading', description: 'Preparing a lesson in the garden', interest: 'teaching and learning new skills' },
  { action: 'reading', description: 'Reading and sorting books for the stall', interest: 'stories and sharing what you know' },
]
/** A fixed, named character with their own backstory, always found at one
 *  building in one town. Add entries to PINNED_RESIDENTS below to place
 *  them -- they sit alongside the 24 procedurally-generated neighbours and
 *  4 travellers in that town without disturbing any of them.
 *
 *  Where they are and what they're doing is no longer a fixed schedule:
 *  it's an ambient random pick (from outdoorActivities / indoorActivities)
 *  that re-rolls every `changeMinutes`-ish, plus an optional player/LLM
 *  override from talking to them (see ResidentChat.tsx, gameStore
 *  residentOverrides). See ambientPinnedState() / pinnedResidentPosition(). */
export interface PinnedResident {
  /** Stable, unique id -- used to build this resident's id and as their
   *  memory/contact key, so keep it the same once you've introduced them. */
  id: string
  name: string
  role: string
  /** Shown to the player and used in conversation, same as any neighbour. */
  interest: string
  /** A short background paragraph, folded into the local model's prompt
   *  (see residentPrompt() in conversations.ts) so this character can
   *  roleplay consistently. Optional -- leave blank for no special lore. */
  backstory: string
  /** How they talk and carry themselves -- tone, habits, quirks, how
   *  easily they say yes. Goes straight into the local model's character
   *  sheet (residentPersona() in conversations.ts) and matters more than
   *  anything else for replies sounding like *them*. A few concrete
   *  sentences beat a list of adjectives. Optional. */
  personality?: string
  /** Which skill-coaching domains this character is the named expert for
   *  -- see the matching field on Resident above for how it's used. */
  expertise?: SkillDomain[]
  /** The `id` of the TOWN_LANDMARKS entry (generation.ts) they live in --
   *  e.g. 'test-house'. That one link decides their town, their building,
   *  where they stand outside (by its door), the room you see inside, and
   *  the name/description conversation uses for the place. Add the
   *  landmark first, then point at it here. An unknown id logs a warning
   *  in dev and the character simply doesn't appear. */
  home: string
  /** Optional: the `id` of a second TOWN_LANDMARKS entry, in the SAME town,
   *  where they work. They spend some of their time there (workShare),
   *  standing by its door doing one of workActivities, and can be asked in
   *  chat to walk there -- or back home -- with the player. */
  work?: string
  /** Things they do at work, same shape as outdoorActivities (shown by the
   *  work building's door). Needed for `work` to have any effect. */
  workActivities?: Array<{ action: Activity; label: string; description?: string }>
  /** Rough fraction of the time (0-1) they're at work when the ambient
   *  routine re-rolls. Default 0.4 when `work` is set. */
  workShare?: number
  /** Outfit index, reused from the existing 8 neighbour looks (0-7). Still
   *  used for the default chat portrait fallback even when `sprites` or
   *  `portrait` below are set, so it's never wasted to leave it accurate. */
  sprite: number
  /** Pool of things they might be doing outdoors, at their post. The
   *  ambient system picks one at random -- list a few for variety, or just
   *  one to keep them doing the same thing. Each one can also be asked for
   *  in chat. `label` is the short text shown in the UI; `description`
   *  (optional, recommended) says what it actually is in a sentence, which
   *  the local model uses to understand and describe the option. */
  outdoorActivities: Array<{ action: Activity; label: string; description?: string }>
  /** Pool of things they might be doing indoors, shown in HomeInterior.tsx.
   *  Also picked at random, same as outdoorActivities. Leave unset (or
   *  empty) to keep this character outdoors all day and skip "go inside"
   *  entirely -- indoorShare is ignored in that case. */
  indoorActivities?: IndoorActivity[]
  /** Rough fraction of the time (0-1) they're indoors rather than at their
   *  outdoor post, when the ambient system re-rolls. Default 0.35. Only a
   *  player asking to come in, or the LLM deciding so, can move them
   *  indoors/outdoors outside of these ambient rolls too. */
  indoorShare?: number
  /** [min, max] real minutes between ambient re-rolls of where they are and
   *  what they're doing -- a random value in this range is picked once per
   *  character (not re-rolled itself) so their rhythm stays consistent
   *  across a playthrough. Default [90, 240]. */
  changeMinutes?: [number, number]
  /** Optional chat portrait -- import a transparent PNG and pass its path.
   *  Left unset, the chat box shows a code-drawn portrait instead (using
   *  `sprite` above), so this is a pure upgrade, never required. */
  portrait?: string
  /** Optional per-state world sprites, keyed by Activity -- both outdoor
   *  ('baking' at the bakery) and indoor ('sleeping', 'cooking', ... from
   *  indoorActivities[].action), plus an optional `default` used for any
   *  state not listed. Import transparent PNGs. Left unset, they render as
   *  the normal code-drawn character. */
  sprites?: Partial<Record<Activity, string>> & { default?: string }
}

/** Every hand-authored character. Each one's `home` is a TOWN_LANDMARKS id
 *  (generation.ts), which places them -- no town key or grid slot here. */
export const PINNED_RESIDENTS: PinnedResident[] = [
  {
    id: 'elder-tam', name: 'Tam', role: 'Retired shopkeeper', interest: 'old trade routes and giving advice',
    // Keep backstories town-neutral or about their own town -- the town's
    // name comes from the world seed, and a different town name here
    // confuses small models about where they live.
    backstory: 'Ran the town’s first general store for thirty years before handing it down.',
    personality: 'Warm, unhurried and a little nostalgic. Calls people "friend", loves telling stories about the old trade routes, and gently teases young folk who rush. Enjoys company and rarely turns a visitor away. Speaks plainly, with the odd shopkeeper saying.',
    expertise: ['negotiation', 'personal-finance'],
    home: 'test-house', sprite: 9,
    // Retired, but still minds the town's old records a few days a week.
    work: 'old-trade-post', workShare: 0.3,
    workActivities: [
      { action: 'reading', label: 'Sorting old trade records', description: 'Tam sits at the long counter of the Old Trade Post, sorting yellowed shipping records into labelled crates.' },
      { action: 'chatting', label: 'Telling visitors about the old routes', description: 'Tam leans on the Trade Post counter, telling anyone who drops in about the caravans that used to pass through.' },
    ],
    // label: short, shown in the UI. description: what it actually is --
    // the local model reads it to understand the option (and to describe
    // it when it happens), so a sentence of concrete detail helps.
    outdoorActivities: [
      { action: 'chatting', label: 'Sitting outside, happy to talk', description: 'Tam sits on the bench by his front door, watching the lane and greeting whoever passes.' },
      { action: 'reading', label: 'Reading the paper on the porch', description: 'Tam reads the local news sheet on the porch, reading bits aloud and grumbling about prices.' },
      { action: 'gardening', label: 'Tending the small flower bed out front', description: 'Tam kneels by the flower bed beside the door, pulling weeds and watering the marigolds.' },
    ],
    indoorActivities: [
      { action: 'resting', scene: 'resting', label: 'Resting by the fire', description: 'Tam is settled into a worn armchair by the fire.' },
      { action: 'reading', scene: 'reading', label: 'Going through old ledgers', description: 'Tam is sorting through yellowed trade-route ledgers.' },
      { action: 'sleeping', scene: 'sleeping', label: 'Asleep', description: 'Tam is fast asleep.' },
    ],
    indoorShare: 0.4, changeMinutes: [90, 240],
    portrait: tamPortrait, sprites: { chatting: tamPortrait, reading: tamPortrait, gardening: tamPortrait, resting: tamPortrait, sleeping: tamPortrait, default: tamPortrait },
  },
]

const warned = new Set<string>()
/** Resolves a pinned resident's optional `work` landmark into Resident fields. */
function workFor(pinned: PinnedResident, town: Settlement, seed: number): Partial<Resident> {
  if (!pinned.work) return {}
  const found = findLandmark(pinned.work)
  if (!found) { warnOnce(`[world] ${pinned.name}: work "${pinned.work}" is not a TOWN_LANDMARKS id.`); return {} }
  if (found.townKey !== town.id) { warnOnce(`[world] ${pinned.name}: work "${pinned.work}" must be in the same town as their home.`); return {} }
  const b = town.buildings.find(x => x.landmarkId === pinned.work)
  if (!b) { warnOnce(`[world] ${pinned.name}: work landmark "${pinned.work}" wasn't built in this town.`); return {} }
  if (!pinned.workActivities?.length) warnOnce(`[world] ${pinned.name}: has work "${pinned.work}" but no workActivities, so they never go there.`)
  return {
    workplace: b.label,
    workPlace: { id: pinned.work, label: b.label, description: b.description, door: b.door, post: openSpot({ x: b.door.x, y: b.door.y + 1 }, seed) },
    workActivities: pinned.workActivities, workShare: pinned.workShare,
  }
}
const warnOnce = (message: string) => { if (import.meta.env?.DEV && !warned.has(message)) { warned.add(message); console.warn(message) } }

/** All pinned residents across every town, flattened -- used by
 *  expertFor() below. Small and static, so no caching needed. */
function allPinnedResidents(): PinnedResident[] {
  return PINNED_RESIDENTS
}

/** The named pinned resident (if any) tagged as the expert for a given
 *  skill-coaching domain -- see PinnedResident.expertise. Used by
 *  gameStore's refillAIChallenges() to name a real character in an
 *  AI-drafted scenario instead of an anonymous coworker, when one exists
 *  for that domain. Deterministic pick (first match, in PINNED_RESIDENTS
 *  declaration order) when more than one resident covers the same domain. */
export function expertFor(domain: SkillDomain): PinnedResident | undefined {
  return allPinnedResidents().find(p => p.expertise?.includes(domain))
}

export interface EmployerInfo {
  /** Town name -- same string gameStore's Opportunity.location expects. */
  location: string
  /** Company name (a real, already-generated non-home building's label)
   *  for 'job', or a real resident's name for 'freelance'. */
  employer: string
  /** The real Building.id this employer is physically based at. */
  employerBuildingId: string
  /** The resident the player would actually deal with there -- a manager
   *  found working at the company, or the client themself for
   *  'freelance'. Undefined only if no resident happened to match. */
  contact?: string
}

/** Picks a real employer for a Job Board posting -- a company for 'job', a
 *  person for 'freelance' -- so "job openings" are never abstract flavor
 *  text: they're always anchored to a building and (usually) a resident
 *  that already exist in the generated world, the same way rival
 *  businesses and pinned residents are. Called by gameStore before it asks
 *  the AI to draft a posting's title (so the model can name a real place
 *  and person instead of staying generic), and by the static pool refill
 *  the same way. Returns undefined only in the rare case a town has no
 *  eligible building/resident to offer -- callers should just skip
 *  spawning that posting rather than falling back to abstract flavor. */
export function pickEmployer(seed: number, kind: 'job' | 'freelance'): EmployerInfo | undefined {
  const towns = listWorldTowns(seed)
  const town = towns[Math.floor(Math.random() * towns.length)]
  if (kind === 'job') {
    // A company's premises is any real, non-home building that isn't one
    // of the player's own app-screen landmarks (Dev Desk, the Job Board
    // itself, the Bank, Hall of Records, Your Ventures) -- those are the
    // player's own tools, not somewhere else that's hiring.
    const companies = town.buildings.filter(b => b.kind !== 'home' && !b.poi?.screen)
    if (!companies.length) return undefined
    const building = companies[Math.floor(Math.random() * companies.length)]
    const manager = getResidents(town, seed).find(r => r.workplace === building.label)
    return { location: town.name, employer: building.label, employerBuildingId: building.id, contact: manager?.name }
  }
  // Freelance: a real resident hiring for a one-off, found at their own home.
  const residents = getResidents(town, seed).filter(r => !r.id.includes(':traveller:'))
  if (!residents.length) return undefined
  const person = residents[Math.floor(Math.random() * residents.length)]
  const homeBuilding = town.buildings.find(b => b.door.x === person.home.x && b.door.y === person.home.y)
  if (!homeBuilding) return undefined
  return { location: town.name, employer: person.name, employerBuildingId: homeBuilding.id, contact: person.name }
}

/** Real candidates for a player-posted opening at their OWN business (see
 *  gameStore's postOpening) -- same rule as pickEmployer: never invented
 *  names, always drawn from residents who already exist in `townName`.
 *  Pinned residents (they have their own fixed lives/backstories) and
 *  travellers (passing through, not settling in for a job) are skipped,
 *  along with anyone already on staff somewhere (`excludeIds`, gathered by
 *  the caller from every business's current employees). Returns fewer than
 *  `count` (down to none) if the town doesn't have enough eligible people
 *  left -- never pads with a made-up name. */
export function pickApplicants(seed: number, townName: string, excludeIds: Set<string>, count: number): Applicant[] {
  const town = listWorldTowns(seed).find(t => t.name === townName)
  if (!town) return []
  const pool = getResidents(town, seed).filter(r => !r.id.includes(':traveller:') && !r.id.includes(':pinned:') && !excludeIds.has(r.id))
  const picked: Applicant[] = []
  const used = new Set<string>()
  while (picked.length < count && used.size < pool.length) {
    const candidate = pool[Math.floor(Math.random() * pool.length)]
    if (used.has(candidate.id)) continue
    used.add(candidate.id)
    picked.push({ id: candidate.id, name: candidate.name, role: candidate.role, interest: candidate.interest, sprite: candidate.sprite })
  }
  return picked
}

/** Picks a real, unclaimed, non-home building in `townName` for a business
 *  or rival to physically claim as its premises -- same "claim something
 *  real rather than invent it" rule as pickEmployer's company building. The
 *  world's own building layout is a pure, cached function of the seed
 *  alone (everything from pathfinding to tile rendering depends on that
 *  staying true), so a genuinely new structure isn't safe to conjure at
 *  runtime -- claiming a real, otherwise-unclaimed one is the equivalent
 *  that is. `excludeBuildingIds` should list every building any other
 *  business/rival has already claimed, so nobody doubles up. Returns
 *  undefined if the town has no eligible slot left. */
export function pickPremisesBuilding(seed: number, townName: string, excludeBuildingIds: Set<string>): string | undefined {
  const town = listWorldTowns(seed).find(t => t.name === townName)
  if (!town) return undefined
  const candidates = town.buildings.filter(b => b.kind !== 'home' && !b.poi?.screen && !excludeBuildingIds.has(b.id))
  if (!candidates.length) return undefined
  return candidates[Math.floor(Math.random() * candidates.length)].id
}

export interface ExpertSpot { location: string; buildingId: string; sprite: number }

/** Picks a real town and a real, unclaimed non-home building for a newly
 *  AI-created domain expert (see gameStore's ensureExpertFor) to be
 *  anchored at -- same rule as pickPremisesBuilding, with its own
 *  exclusion set so an expert never claims a building a business, rival,
 *  or another expert already has. `sprite` is just a fresh outfit index
 *  (0-7) so experts don't all look identical. */
export function pickExpertSpot(seed: number, excludeBuildingIds: Set<string>): ExpertSpot | undefined {
  const towns = listWorldTowns(seed)
  const town = towns[Math.floor(Math.random() * towns.length)]
  const candidates = town.buildings.filter((b) => b.kind !== 'home' && !b.poi?.screen && !excludeBuildingIds.has(b.id))
  if (!candidates.length) return undefined
  const building = candidates[Math.floor(Math.random() * candidates.length)]
  return { location: town.name, buildingId: building.id, sprite: Math.floor(Math.random() * 8) }
}

function openSpot(point: Point, seed: number): Point {
  for (let r = 0; r < 5; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (getTile(point.x + x, point.y + y, seed).walkable) return { x: point.x + x, y: point.y + y }
  return point
}
/** Turns a string id into a stable numeric seed for hashCoord(), so pinned
 *  residents get their own independent-looking random stream without any
 *  stored state -- same trick as the rest of the world generation. */
function strseed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Real, on-the-map presence for the player's own hired staff who work
 *  onsite (Employee.workMode === 'onsite') -- built fresh from the live
 *  employees list on every call rather than cached like getResidents()
 *  (hiring/firing changes it immediately, and the list involved is always
 *  tiny), then rendered through the exact same residentPosition()/
 *  pinnedResidentPosition() pipeline as everyone else in world/renderer.ts:
 *  each hire is shaped as an ordinary single-activity Resident, always
 *  standing at one fixed, walkable spot near their business's town park
 *  (placement varies per business+employee via strseed, same trick pinned
 *  residents use), never wandering -- "hired onsite" reliably means "found
 *  here." A 'remote' hire gets no entry at all: per the design, they don't
 *  need to physically show up anywhere. `id` is namespaced
 *  (`employee:<business id>:<employee id>`) so it can't collide with that
 *  same person's own procedural resident id -- world/renderer.ts is
 *  expected to suppress that original id from the visible list while
 *  they're employed onsite, so the same named person isn't drawn twice. */
export function employeeResidents(seed: number, businesses: Array<{ id: string; name: string; location: string; employees?: Employee[] }>): Resident[] {
  const out: Resident[] = []
  for (const biz of businesses) {
    const onsite = (biz.employees ?? []).filter((e) => e.workMode === 'onsite')
    if (!onsite.length) continue
    const town = listWorldTowns(seed).find((t) => t.name === biz.location)
    if (!town) continue
    for (const employee of onsite) {
      const idSeed = strseed(`${biz.id}:${employee.id}`)
      const angle = hashCoord(idSeed, 0, seed + 71) * Math.PI * 2
      const dist = 2 + hashCoord(idSeed, 1, seed + 71) * 3
      const officeSpot = openSpot({ x: Math.round(town.park.x + Math.cos(angle) * dist), y: Math.round(town.park.y + Math.sin(angle) * dist) }, seed)
      out.push({
        id: `employee:${biz.id}:${employee.id}`, name: employee.name, role: employee.role, town: town.name,
        workplace: biz.name, interest: `working at ${biz.name}`, sprite: employee.sprite,
        home: officeSpot, post: officeSpot, lane: 0, shift: 0, duration: 1440, stops: [],
        outdoorActivities: [{ action: 'selling', label: `Working at ${biz.name}` }],
        bucketMinutes: 1440,
      })
    }
  }
  return out
}

/** Real, on-the-map presence for every AI-created domain expert (see
 *  gameStore's ensureExpertFor/DynamicExpert) -- same "build an ordinary
 *  Resident, reuse the existing position/render pipeline" trick as
 *  employeeResidents() above, placed just outside their claimed building's
 *  door (openSpot), same convention the hand-authored PINNED_RESIDENTS
 *  use. Not cached, for the same reason employeeResidents() isn't: the
 *  list changes live (a new expert can appear mid-session) and is always
 *  tiny. */
export function dynamicExpertResidents(seed: number, experts: DynamicExpert[]): Resident[] {
  const out: Resident[] = []
  for (const expert of experts) {
    const town = listWorldTowns(seed).find((t) => t.name === expert.location)
    const building = town?.buildings.find((b) => b.id === expert.buildingId)
    if (!town || !building) continue
    const post = openSpot({ x: building.door.x, y: building.door.y + 1 }, seed)
    out.push({
      id: `expert:${expert.id}`, name: expert.name, role: expert.role, town: town.name,
      workplace: building.label, interest: expert.interest, backstory: expert.backstory, sprite: expert.sprite,
      home: post, post, lane: 0, shift: 0, duration: 1440, stops: [],
      outdoorActivities: [{ action: 'chatting', label: `At ${building.label}` }],
      bucketMinutes: 1440,
    })
  }
  return out
}

const cache = new Map<string, Resident[]>()

export function getResidents(town: Settlement, seed: number): Resident[] {
  const key = `${seed}:${town.id}`
  const existing = cache.get(key)
  if (existing) return existing
  const homes = town.buildings.filter(b => b.kind === 'home')
  const shops = town.buildings.filter(b => b.kind !== 'home')
  const residents: Resident[] = []
  for (let i = 0; i < 24; i++) {
    const h = hashCoord(town.x + i, town.y, seed + 124)
    const home = homes[i % homes.length].door
    const workplace = shops[i % shops.length]
    const shop = shops[(i + 3) % shops.length]
    const job = JOBS[i % JOBS.length]
    const workPoint = openSpot(job.action === 'gardening' || i % 8 === 6 ? { x: town.park.x + i % 3 - 1, y: town.park.y } : { x: workplace.door.x + (i % 2 ? 1 : -1), y: workplace.door.y + 1 }, seed)
    const destinations: Array<{ point: Point; activity: string; action: Activity; duration: number }> = [
      { point: workPoint, activity: job.description, action: job.action, duration: 45 + h * 45 },
      { point: shop.door, activity: `Shopping at ${shop.label}`, action: 'selling', duration: 4 + h * 5 },
      { point: { x: town.park.x + (i % 3) - 1, y: town.park.y - 1 }, activity: 'Taking a break in the garden', action: 'resting', duration: 7 + h * 8 },
      { point: { x: town.x + (i % 3) - 1, y: town.y + 2 }, activity: 'Catching up in the square', action: 'chatting', duration: 5 + h * 4 },
      { point: home, activity: 'At home', action: 'home', duration: 6 + h * 8 },
    ]
    let previous = home, elapsed = 0
    const stops: Stop[] = destinations.map(stop => {
      const path = findPath(previous, stop.point, seed)
      const travel = Math.max(0, path.length - 1) * (0.37 + h * 0.12)
      const result = { ...stop, path, travel, start: elapsed }
      elapsed += travel + stop.duration
      previous = stop.point
      return result
    })
    residents.push({ id: `${town.id}:resident:${i}`, name: NAMES[(i + Math.floor(h * NAMES.length)) % NAMES.length], role: ROLES[i % ROLES.length], town: town.name, workplace: workplace.label, interest: job.interest, sprite: i % 8, home, stops, duration: elapsed, shift: 360 + h * 70, lane: (i % 3 - 1) * 0.16 })
  }
  // Travellers use the same streets and bridges as everyone else. Their
  // journeys populate the countryside without spawning people in random fields.
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][i]
    const destination = getSettlement(town.x / 64 + dx, town.y / 64 + dy, seed)
    const home = homes[i % homes.length].door
    const target = { x: destination.x, y: destination.y }
    const outward = findPath(home, target, seed)
    if (!outward.length) continue
    const travel = (outward.length - 1) * 0.42
    residents.push({
      id: `${town.id}:traveller:${i}`, name: NAMES[(i * 5 + 3) % NAMES.length], role: i % 2 ? 'Travelling trader' : 'Courier', sprite: (i + 2) % 8,
      town: town.name, workplace: `the road to ${destination.name}`, interest: 'new places and the people along the trade routes',
      home, shift: 360 + i * 13, lane: i % 2 ? 0.18 : -0.18, duration: travel * 2 + 14,
      stops: [
        { point: target, activity: `Delivering supplies in ${destination.name}`, action: 'delivery', duration: 8, path: outward, start: 0, travel },
        { point: home, activity: 'At home', action: 'home', duration: 6, path: [...outward].reverse(), start: travel + 8, travel },
      ],
    })
  }
  for (const pinned of PINNED_RESIDENTS) {
    const found = findLandmark(pinned.home)
    if (!found) { warnOnce(`[world] ${pinned.name} (${pinned.id}): home "${pinned.home}" is not a TOWN_LANDMARKS id.`); continue }
    if (found.townKey !== town.id) continue
    const building = town.buildings.find(b => b.landmarkId === pinned.home)
    if (!building) { warnOnce(`[world] ${pinned.name}: landmark "${pinned.home}" wasn't built -- its slot may be skipped in this town's biome (woodland/highlands skip row 0, cols 1-2).`); continue }
    const post = openSpot({ x: building.door.x, y: building.door.y + 1 }, seed)
    const idSeed = strseed(pinned.id)
    const [minC, maxC] = pinned.changeMinutes ?? [90, 240]
    const bucketMinutes = Math.round(minC + hashCoord(idSeed, 0, seed + 41) * (maxC - minC))
    residents.push({
      id: `${town.id}:pinned:${pinned.id}`, name: pinned.name, role: pinned.role, town: town.name,
      workplace: building.label, interest: pinned.interest, backstory: pinned.backstory, personality: pinned.personality, sprite: pinned.sprite,
      expertise: pinned.expertise,
      portrait: pinned.portrait, sprites: pinned.sprites, homeBuildingId: building.id,
      place: { id: pinned.home, label: building.label, description: building.description },
      ...workFor(pinned, town, seed),
      post, outdoorActivities: pinned.outdoorActivities, indoorActivities: pinned.indoorActivities,
      indoorShare: pinned.indoorShare, bucketMinutes,
      home: building.door, lane: 0, shift: 0, duration: 1440, stops: [],
    })
  }

  cache.set(key, residents)
  if (cache.size > 36) cache.delete(cache.keys().next().value!)
  return residents
}

/** Ambient, stateless random pick of a pinned resident's indoors/outdoors
 *  and which pool entry, for a given moment. Time is sliced into fixed-
 *  length buckets (resident.bucketMinutes, chosen once at construction) so
 *  this is an O(1) direct computation -- no loop, no stored history -- and
 *  the same simMinutes always re-derives the same answer, which is what
 *  keeps revisiting/remounting side-effect-free for everyone except the
 *  explicit override escape hatch below. */
function ambientPinnedState(resident: Resident, simMinutes: number): { indoors: boolean; at: Place; index: number } {
  const bucketMinutes = resident.bucketMinutes ?? 180
  const bucket = Math.floor(Math.max(0, simMinutes) / bucketMinutes)
  const idSeed = strseed(resident.id)
  const hasIndoor = !!resident.indoorActivities?.length
  const indoorShare = hasIndoor ? resident.indoorShare ?? 0.35 : 0
  const workShare = resident.workPlace && resident.workActivities?.length ? resident.workShare ?? 0.4 : 0
  const roll = hashCoord(bucket, idSeed, 11)
  const indoors = roll < indoorShare
  const at: Place = !indoors && roll < indoorShare + workShare ? 'work' : 'home'
  const pool = indoors ? resident.indoorActivities : at === 'work' ? resident.workActivities : resident.outdoorActivities
  const poolLen = Math.max(1, pool?.length ?? 1)
  const index = Math.min(poolLen - 1, Math.floor(hashCoord(bucket, idSeed, 29) * poolLen))
  return { indoors, at, index }
}

/** Position for a pinned resident with outdoorActivities set -- a separate
 *  path from the Stop-based residentPosition() below, since these
 *  characters aren't walking a route: they're ambiently idle at one of two
 *  spots (post / home) and just change what they're doing there. A live
 *  `override` (from talking to them) wins over the ambient pick until it
 *  expires (override.until). */
function pinnedResidentPosition(resident: Resident, simMinutes: number, override?: ResidentOverride): ResidentPosition {
  // `action` is always the real thing they're doing (drives the sprite --
  // see Resident.sprites), indoors or out. `scene` only ever affects which
  // room HomeInterior draws (drawRoom) and is undefined outdoors -- it has
  // no bearing on the sprite. `visible` (not `action`) is what says
  // whether they're on the map, so an indoor action is never forced to a
  // sentinel value the way it is for the Stop-based residents below.
  let indoors: boolean, at: Place, action: Activity, activity: string, scene: SceneKind | undefined, description: string | undefined
  if (override && simMinutes < override.until) {
    // On the way somewhere (asked in chat): walk the path in real time.
    const j = override.journey
    if (j && j.path.length > 1) {
      const t = (Date.now() - j.startedAt) / j.msPerTile
      if (t < j.path.length - 1) {
        const i = Math.max(0, Math.floor(t)), f = Math.max(0, t - i), a = j.path[i], b = j.path[i + 1]
        return { resident, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, facing: facingForStep(b.x - a.x, b.y - a.y), moving: true, action: 'walking', activity: `Walking to ${j.to}`, visible: true, at: override.at ?? 'home' }
      }
    }
    indoors = override.indoors
    at = override.at ?? 'home'
    action = override.action ?? (indoors ? 'resting' : 'chatting')
    activity = override.activity ?? (indoors ? 'Indoors' : 'Out and about')
    scene = override.scene
    description = override.description
  } else {
    const state = ambientPinnedState(resident, simMinutes)
    indoors = state.indoors; at = state.at
    if (indoors) {
      const a = resident.indoorActivities?.[state.index]
      action = a?.action ?? 'resting'; activity = a?.label ?? 'At home'; scene = a?.scene; description = a?.description
    } else {
      const a = (at === 'work' ? resident.workActivities : resident.outdoorActivities)?.[state.index]
      action = a?.action ?? 'chatting'; activity = a?.label ?? 'Out and about'; scene = undefined; description = undefined
    }
  }
  const point = indoors ? resident.home : at === 'work' && resident.workPlace ? resident.workPlace.post : (resident.post ?? resident.home)
  return { resident, x: point.x + (indoors ? 0 : resident.lane), y: point.y, facing: 'south', moving: false, action, activity, visible: !indoors, scene, description, at }
}

/** Position is derived from the simulation clock, so revisiting/remounting a
 * region neither respawns residents nor resets their journeys. The final
 * circuit finishes at home before bedtime; pause freezes the same clock.
 * `override` only ever applies to pinned residents (see pinnedResidentPosition) --
 * ignored for everyone else. */
export function residentPosition(resident: Resident, simMinutes: number, override?: ResidentOverride): ResidentPosition {
  if (resident.outdoorActivities?.length) return pinnedResidentPosition(resident, simMinutes, override)
  const minute = ((simMinutes % 1440) + 1440) % 1440
  const elapsed = minute - resident.shift
  const cycles = Math.max(1, Math.floor((1200 - resident.shift) / resident.duration))
  const base: ResidentPosition = { resident, ...resident.home, facing: 'south', moving: false, activity: 'At home', action: 'home', visible: false }
  if (elapsed < 0 || elapsed >= cycles * resident.duration) return base
  const time = elapsed % resident.duration
  for (const stop of resident.stops) {
    if (time >= stop.start + stop.travel + stop.duration) continue
    const t = time - stop.start
    if (t < stop.travel && stop.path.length > 1) {
      const progress = t / stop.travel * (stop.path.length - 1)
      const index = Math.min(stop.path.length - 2, Math.floor(progress))
      const a = stop.path[index], b = stop.path[index + 1], fraction = progress - index
      // Small lanes stay inside a walkable tile and keep walkers from stacking.
      return { ...base, x: a.x + (b.x - a.x) * fraction + (a.x === b.x ? resident.lane : 0), y: a.y + (b.y - a.y) * fraction + (a.y === b.y ? resident.lane : 0), moving: true, facing: facingForStep(b.x - a.x, b.y - a.y), action: 'walking', activity: `On my way · ${stop.activity.toLowerCase()}`, visible: true }
    }
    return { ...base, ...stop.point, x: stop.point.x + resident.lane, activity: stop.activity, action: stop.action, visible: stop.action !== 'home', scene: stop.scene, description: stop.description }
  }
  return base
}

/** Finds whoever (if anyone) has this exact building as their pinned home --
 *  used to show "look inside" when the player is at a door, independent of
 *  whether that resident is currently visible on the map (they won't be,
 *  while indoors). Returns undefined for any building with no pinned resident. */
export function residentForBuilding(town: Settlement, seed: number, buildingId: string): Resident | undefined {
  return getResidents(town, seed).find(r => r.homeBuildingId === buildingId)
}
