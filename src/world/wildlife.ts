import { getTile, hashCoord, type Point, type Settlement } from './generation'
import { facingForStep, type Facing } from './facing'

export type AnimalKind = 'chicken' | 'sheep' | 'rabbit' | 'bird'
export interface Animal { id: string; kind: AnimalKind; route: Point[]; offset: number }
export interface AnimalPosition extends Point { animal: Animal; moving: boolean; facing: Facing; activity: string }
const cache = new Map<string, Animal[]>()
export function getAnimals(town: Settlement, seed: number) {
  const key = `${seed}:${town.id}`, found = cache.get(key)
  if (found) return found
  const animals: Animal[] = []
  for (let i = 0; i < 9; i++) {
    const kind: AnimalKind = i < 3 ? 'bird' : town.biome === 'farmland' || town.biome === 'meadow' ? (i % 2 ? 'chicken' : 'sheep') : 'rabbit'
    const origin = i < 3 ? { x: town.park.x + i - 1, y: town.park.y - 2 } : { x: town.x + (i % 2 ? 9 : -14), y: town.y + 24 }
    let start: Point | undefined
    for (let n = 0; n < 50 && !start; n++) {
      const x = origin.x + Math.floor(hashCoord(i, n, seed) * 9) - 4, y = origin.y + Math.floor(hashCoord(n, i, seed + 8) * 7) - 3
      const t = getTile(x, y, seed)
      if (t.walkable && !t.poi && ['grass', 'field', 'plot', 'plaza'].includes(t.type)) start = { x, y }
    }
    if (!start) continue
    const path = [start]
    for (let n = 0; n < 12; n++) {
      const last = path[path.length - 1], choices = [[0, 1], [1, 0], [0, -1], [-1, 0]]
      const offset = Math.floor(hashCoord(i, n, seed + 67) * 4)
      for (let j = 0; j < 4; j++) {
        const [dx, dy] = choices[(offset + j) % 4], next = { x: last.x + dx, y: last.y + dy }, t = getTile(next.x, next.y, seed)
        if (t.walkable && !t.poi && !['path', 'bridge', 'water'].includes(t.type) && Math.abs(next.x - start.x) <= 4 && Math.abs(next.y - start.y) <= 4) { path.push(next); break }
      }
    }
    // Reverse the walk for a closed circuit with no jumps at its wrap point.
    const route = [...path, ...path.slice(0, -1).reverse()]
    animals.push({ id: `${town.id}:animal:${i}`, kind, route, offset: hashCoord(i, town.x, seed) * 20 })
  }
  cache.set(key, animals); if (cache.size > 36) cache.delete(cache.keys().next().value!)
  return animals
}
export function animalPosition(animal: Animal, minutes: number): AnimalPosition {
  const cycle = Math.max(1, animal.route.length - 1), time = (minutes * 1.2 + animal.offset) % (cycle * 2)
  const index = Math.min(cycle - 1, Math.floor(time / 2)), fraction = Math.min(1, time % 2)
  const a = animal.route[index], b = animal.route[index + 1] ?? a
  return { animal, x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, moving: fraction < 1 && (a.x !== b.x || a.y !== b.y), facing: facingForStep(b.x - a.x, b.y - a.y), activity: animal.kind === 'sheep' ? 'Grazing quietly' : animal.kind === 'rabbit' ? 'Foraging in the grass' : 'Pecking for seeds' }
}
