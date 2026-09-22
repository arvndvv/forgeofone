import assert from 'node:assert/strict'
import { clearWorldCaches, getTile, getSettlement, getSites, hashCoord, worldCacheSizes, getInteraction } from '../src/world/generation'
import { findPath } from '../src/world/pathfinding'
import { getResidents, residentPosition } from '../src/world/residents'
import { useGameStore } from '../src/store/gameStore'
import { getAnimals, animalPosition } from '../src/world/wildlife'
import { regionBiome, grassColor } from '../src/world/regions'
import { residentReply } from '../src/world/conversations'
import { nearbyResident, worldInteraction } from '../src/world/interactions'
import type { ResidentPosition } from '../src/world/residents'

let checks = 0
const check = (name: string, run: () => void) => { run(); checks++; console.log(`✓ ${name}`) }

check('world is deterministic across cache eviction and sensitive to seed', () => {
  const points = [[-65, 19], [-33, -34], [0, 0], [31, 32], [95, -7], [10000, -10000]]
  const first = points.map(([x, y]) => getTile(x, y, 452199))
  clearWorldCaches()
  assert.deepEqual(points.map(([x, y]) => getTile(x, y, 452199)), first)
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => hashCoord(19, -25, i))).size, 100)
})

check('roads connect towns over rivers and across negative chunk boundaries', () => {
  for (const seed of [0, 1, 9173, 999999]) {
    for (let x = -150; x <= 150; x++) {
      assert.ok(getTile(x, 0, seed).walkable, `east-west road ${x}, seed ${seed}`)
      assert.ok(getTile(0, x, seed).walkable, `north-south road ${x}, seed ${seed}`)
    }
    assert.ok(findPath({ x: 20, y: 0 }, { x: 44, y: 0 }, seed).some(p => getTile(p.x, p.y, seed).type === 'bridge'))
  }
})

check('all buildings have solid non-overlapping footprints and reachable entrances', () => {
  for (const seed of [1, 98765]) for (const [rx, ry] of [[0, 0], [-1, -1], [1, 0]]) {
    const town = getSettlement(rx, ry, seed), occupied = new Set<string>()
    for (const b of town.buildings) {
      for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
        const key = `${x},${y}`
        assert.ok(!occupied.has(key)); occupied.add(key)
        assert.equal(getTile(x, y, seed).walkable, false, `${b.id} footprint`)
      }
      const path = findPath({ x: town.x, y: town.y }, b.door, seed)
      assert.ok(path.length > 0, `entrance ${b.id} is unreachable`)
      assert.equal(getTile(b.door.x, b.door.y, seed).poi?.label, b.label)
      for (let i = 1; i < path.length; i++) {
        assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1)
        assert.ok(getTile(path[i].x, path[i].y, seed).walkable)
      }
    }
  }
})

check('resident itineraries are connected, collision-free and continuous', () => {
  for (const [rx, ry] of [[0, 0], [-1, 1]]) {
    const residents = getResidents(getSettlement(rx, ry, 51), 51)
    assert.equal(new Set(residents.map(r => r.id)).size, 28)
    for (const resident of residents) {
      let previous = resident.home
      for (const stop of resident.stops) {
        assert.ok(stop.path.length > 0)
        assert.deepEqual(stop.path[0], previous)
        assert.deepEqual(stop.path.at(-1), stop.point)
        for (const p of stop.path) assert.ok(getTile(p.x, p.y, 51).walkable)
        previous = stop.point
      }
      assert.deepEqual(previous, resident.home)
      for (let minute = 360; minute < 1210; minute += 0.5) {
        const p = residentPosition(resident, minute), next = residentPosition(resident, minute + 0.005)
        if (p.visible && next.visible) assert.ok(Math.hypot(p.x - next.x, p.y - next.y) < 0.35)
      }
      assert.equal(residentPosition(resident, 60).visible, false)
      assert.deepEqual(residentPosition(resident, 500), residentPosition(resident, 500 + 1440))
    }
  }
})

check('player cannot walk through buildings, water, trees, or jump multiple tiles', () => {
  const s = useGameStore
  s.setState({ playerX: -15, playerY: -3, worldSeed: 1 })
  s.getState().movePlayer(0, -1)
  assert.deepEqual([s.getState().playerX, s.getState().playerY], [-15, -3])
  s.getState().movePlayer(200, 0)
  assert.equal(s.getState().playerX, -15)
  s.getState().movePlayer(1, 1)
  assert.equal(s.getState().playerX, -15)
  s.getState().movePlayer(0, 1)
  assert.equal(s.getState().playerY, -2)
  for (let y = 22; y < 32; y++) for (let x = 20; x < 36; x++) {
    if (getTile(x, y, 1).walkable || !getTile(x - 1, y, 1).walkable) continue
    s.setState({ playerX: x - 1, playerY: y }); s.getState().movePlayer(1, 0)
    assert.equal(s.getState().playerX, x - 1)
  }
  s.getState().returnToTown()
  assert.deepEqual([s.getState().playerX, s.getState().playerY], [0, 0])
})

check('player facing follows input, keeps its heading at rest and turns at obstacles', () => {
  const s = useGameStore
  s.setState({ playerX: 0, playerY: 0, playerFacing: 'south', worldSeed: 1 })
  for (const [dx, dy, facing] of [[1, 0, 'east'], [0, -1, 'north'], [-1, 0, 'west'], [0, 1, 'south']] as const) {
    s.getState().movePlayer(dx, dy)
    assert.equal(s.getState().playerFacing, facing)
  }
  s.setState({ playerX: 2, playerY: -1, playerFacing: 'east' })
  s.getState().movePlayer(0, -1)
  assert.equal(s.getState().playerFacing, 'north', 'blocked movement still turns to face the obstacle')
  assert.deepEqual([s.getState().playerX, s.getState().playerY], [2, -1])
  s.getState().movePlayer(0, 0); s.getState().movePlayer(1, 1)
  assert.equal(s.getState().playerFacing, 'north', 'invalid/zero steps cannot change heading')
  s.getState().returnToTown(); assert.equal(s.getState().playerFacing, 'south')
})

check('walking residents and wildlife face their actual direction of travel in all four directions', () => {
  const seenPeople = new Set<string>(), seenAnimals = new Set<string>()
  const verify = (a: { x: number; y: number; facing: string }, b: { x: number; y: number }, seen: Set<string>) => {
    const dx = b.x - a.x, dy = b.y - a.y
    if (Math.hypot(dx, dy) < 0.00001) return
    assert.equal(a.facing, Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'west' : 'east' : dy < 0 ? 'north' : 'south')
    seen.add(a.facing)
  }
  for (const r of getResidents(getSettlement(0, 0, 51), 51)) for (const stop of r.stops) {
    for (let i = 0; i < stop.path.length - 1; i++) {
      const t = r.shift + stop.start + (i + 0.3) * stop.travel / (stop.path.length - 1)
      verify(residentPosition(r, t), residentPosition(r, t + 0.0001), seenPeople)
    }
  }
  for (let rx = -1; rx <= 1; rx++) for (const a of getAnimals(getSettlement(rx, 0, 51), 51)) {
    for (let t = 0; t < 40; t += 0.073) {
      const p = animalPosition(a, t), next = animalPosition(a, t + 0.0001)
      if (p.moving && next.moving) verify(p, next, seenAnimals)
    }
  }
  assert.deepEqual([...seenPeople].sort(), ['east', 'north', 'south', 'west'])
  assert.deepEqual([...seenAnimals].sort(), ['east', 'north', 'south', 'west'])
})

check('E finds nearby neighbours without selection, ignores distant/hidden/blocked people and preserves door access', () => {
  const base = residentPosition(getResidents(getSettlement(0, 0, 1), 1)[0], 480)
  const person = (id: string, x: number, y: number, visible = true): ResidentPosition => ({ ...base, x, y, visible, resident: { ...base.resident, id } })
  const west = person('west', -1, 0), east = person('east', 1, 0), far = person('far', 10, 0)
  assert.equal(nearbyResident({ x: 0, y: 0 }, [west, east], 1, 'east')?.resident.id, 'east')
  assert.equal(nearbyResident({ x: 0, y: 0 }, [west, east], 1, 'west')?.resident.id, 'west')
  assert.equal(nearbyResident({ x: 0, y: 0 }, [far, east], 1, 'east', 'far')?.resident.id, 'east', 'old far-away selection cannot steal E')
  assert.equal(nearbyResident({ x: 0, y: 0 }, [far, person('hidden', 0, 0, false)], 1, 'east'), null)
  assert.equal(nearbyResident({ x: 2, y: -1 }, [person('across-well', 2, -3)], 1, 'north'), null)
  assert.equal(worldInteraction({ x: 0, y: 0 }, [east], 1, 'east')?.kind, 'resident')
  const neighbour = person('door-neighbour', -4, -3), door = { x: -5, y: -3 }
  assert.equal(worldInteraction(door, [neighbour], 1, 'east')?.kind, 'place')
  assert.equal(worldInteraction(door, [neighbour], 1, 'east', neighbour.resident.id)?.kind, 'resident')
})

check('nearby discoveries reward once and landmarks cannot be investigated', () => {
  const s = useGameStore
  s.setState({ playerX: 25, playerY: 2, worldSeed: 1, discoveries: {}, money: 0 })
  assert.ok(getInteraction(25, 2, 1))
  s.getState().investigateHere(); assert.equal(s.getState().money, 960)
  s.getState().investigateHere(); assert.equal(s.getState().money, 960)
  s.setState({ playerX: -5, playerY: -3 })
  const before = Object.keys(s.getState().discoveries).length
  s.getState().investigateHere()
  assert.equal(Object.keys(s.getState().discoveries).length, before)
})

check('world caches remain bounded during long exploration', () => {
  for (let i = 0; i < 180; i++) getTile(i * 64, -i * 64, 67)
  assert.ok(worldCacheSizes().chunks <= 128)
  assert.ok(worldCacheSizes().settlements <= 64)
})

check('exploration exposes different regions and all composed sites are reachable', () => {
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => regionBiome(i, 0, 12))).size, 5)
  for (const seed of [0, 51, 9876]) for (let rx = -2; rx <= 2; rx++) {
    const town = getSettlement(rx, -1, seed)
    for (const site of getSites(town)) {
      assert.ok(getTile(site.x, site.y, seed).poi?.item, `${town.id} site exists`)
      assert.ok(findPath({ x: town.x, y: town.y }, site, seed).length > 0, `${town.id} site reachable`)
    }
  }
  // Colour changes stay gentle across a region boundary, including negatives.
  for (const x of [-33, 31, 95]) {
    const a = grassColor(x, 10, 12), b = grassColor(x + 1, 10, 12)
    for (const offset of [1, 3, 5]) assert.ok(Math.abs(parseInt(a.slice(offset, offset + 2), 16) - parseInt(b.slice(offset, offset + 2), 16)) < 15)
  }
})

check('work activities stay visible and conversations use the actual activity', () => {
  const residents = getResidents(getSettlement(0, 0, 51), 51)
  const actions = new Set<string>()
  for (const r of residents.slice(0, 24)) {
    const stop = r.stops[0], p = residentPosition(r, r.shift + stop.travel + 1)
    actions.add(p.action)
    assert.ok(p.visible && !p.moving)
    assert.equal(p.activity, stop.activity)
    const reply = residentReply(p, 'What are you doing?', false)
    assert.ok(reply.toLowerCase().includes(p.activity.toLowerCase()))
    assert.ok(residentReply(p, 'Tell me about yourself', true).includes(r.name))
  }
  assert.ok(actions.size >= 7)
})

check('wildlife stays on valid ground with continuous closed routes', () => {
  for (let rx = -2; rx <= 2; rx++) for (const a of getAnimals(getSettlement(rx, 0, 51), 51)) {
    assert.deepEqual(a.route[0], a.route.at(-1))
    for (let i = 0; i < a.route.length; i++) {
      const p = a.route[i]; assert.ok(getTile(p.x, p.y, 51).walkable)
      if (i) assert.equal(Math.abs(p.x - a.route[i - 1].x) + Math.abs(p.y - a.route[i - 1].y), 1)
    }
    for (let t = 0; t < 100; t += 0.1) {
      const p = animalPosition(a, t), next = animalPosition(a, t + 0.001)
      assert.ok(Math.hypot(p.x - next.x, p.y - next.y) < 0.01)
    }
  }
})

check('artifacts collect once per site and reset clears inventory and contacts', () => {
  const s = useGameStore, site = getSites(getSettlement(0, 0, 1))[0]
  s.setState({ playerX: site.x, playerY: site.y, worldSeed: 1, inventory: [], discoveries: {} })
  s.getState().investigateHere(); s.getState().investigateHere()
  assert.equal(s.getState().inventory.length, 1); assert.equal(s.getState().inventory[0].quantity, 1)
  const next = getSites(getSettlement(0, 1, 1))[0]
  s.setState({ playerX: next.x, playerY: next.y }); s.getState().investigateHere()
  assert.equal(s.getState().inventory[0].quantity, 2)
  s.getState().meetResident('test', 'Neighbour', 'Baker'); assert.equal(s.getState().contacts.test.meetings, 1)
  s.getState().resetGame()
  assert.deepEqual(s.getState().inventory, []); assert.deepEqual(s.getState().contacts, {})
})

console.log(`${checks} world checks passed.`)
