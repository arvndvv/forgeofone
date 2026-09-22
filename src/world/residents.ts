import { hashCoord, getSettlement, getTile, type Point, type Settlement } from './generation'
import { findPath } from './pathfinding'
import { facingForStep, type Facing } from './facing'

export type Activity = 'walking' | 'baking' | 'gardening' | 'selling' | 'repairing' | 'painting' | 'delivery' | 'reading' | 'resting' | 'chatting' | 'home'
interface Stop { point: Point; activity: string; action: Activity; duration: number; path: Point[]; start: number; travel: number }
export interface Resident { id: string; name: string; role: string; town: string; workplace: string; interest: string; sprite: number; home: Point; stops: Stop[]; duration: number; shift: number; lane: number }
export interface ResidentPosition extends Point { resident: Resident; moving: boolean; facing: Facing; activity: string; action: Activity; visible: boolean }
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
function openSpot(point: Point, seed: number): Point {
  for (let r = 0; r < 5; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (getTile(point.x + x, point.y + y, seed).walkable) return { x: point.x + x, y: point.y + y }
  return point
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
  cache.set(key, residents)
  if (cache.size > 36) cache.delete(cache.keys().next().value!)
  return residents
}

/** Position is derived from the simulation clock, so revisiting/remounting a
 * region neither respawns residents nor resets their journeys. The final
 * circuit finishes at home before bedtime; pause freezes the same clock. */
export function residentPosition(resident: Resident, simMinutes: number): ResidentPosition {
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
    return { ...base, ...stop.point, x: stop.point.x + resident.lane, activity: stop.activity, action: stop.action, visible: stop.action !== 'home' }
  }
  return base
}
