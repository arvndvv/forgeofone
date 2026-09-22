import { getInteraction, getTile, type Point } from './generation'
import { FACING_VECTOR, type Facing } from './facing'
import type { ResidentPosition } from './residents'

export type WorldInteraction = { kind: 'resident'; person: ResidentPosition }
  | ({ kind: 'place' } & NonNullable<ReturnType<typeof getInteraction>>)

const TALK_DISTANCE = 2.25

export function nearbyResident(player: Point, residents: ResidentPosition[], seed: number, facing: Facing, selectedId?: string | null): ResidentPosition | null {
  const forward = FACING_VECTOR[facing]
  const candidates = residents.filter(p => {
    const distance = Math.hypot(p.x - player.x, p.y - player.y)
    if (!p.visible || distance > TALK_DISTANCE) return false
    // Do not talk through a building, tree or river, even within the radius.
    const samples = Math.max(1, Math.ceil(distance * 4))
    for (let i = 1; i <= samples; i++) {
      const x = Math.round(player.x + (p.x - player.x) * i / samples)
      const y = Math.round(player.y + (p.y - player.y) * i / samples)
      if (!getTile(x, y, seed).walkable) return false
    }
    return true
  })
  const selected = candidates.find(p => p.resident.id === selectedId)
  if (selected) return selected
  // Prefer the nearest neighbour, with a small preference for the one ahead
  // when people stand together. The ID breaks ties consistently.
  const score = (p: ResidentPosition) => Math.hypot(p.x - player.x, p.y - player.y)
    - ((p.x - player.x) * forward.x + (p.y - player.y) * forward.y) * 0.2
  candidates.sort((a, b) => score(a) - score(b) || a.resident.id.localeCompare(b.resident.id))
  return candidates[0] ?? null
}

export function worldInteraction(player: Point, residents: ResidentPosition[], seed: number, facing: Facing, selectedId?: string | null): WorldInteraction | null {
  const person = nearbyResident(player, residents, seed, facing, selectedId)
  const place = getInteraction(player.x, player.y, seed)
  if (person && person.resident.id === selectedId) return { kind: 'resident', person }
  // Standing on a doorstep/collectible keeps E useful for that place.
  if (place && place.point.x === player.x && place.point.y === player.y) return { kind: 'place', ...place }
  if (person) return { kind: 'resident', person }
  return place ? { kind: 'place', ...place } : null
}
