import { getTile, type Point } from './generation'

const key = (p: Point) => `${p.x},${p.y}`
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
interface Node extends Point { g: number; f: number; parent?: Node }

class MinHeap {
  values: Node[] = []
  push(node: Node) {
    let i = this.values.length
    this.values.push(node)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.values[p].f <= node.f) break
      this.values[i] = this.values[p]; i = p
    }
    this.values[i] = node
  }
  pop() {
    const first = this.values[0], last = this.values.pop()!
    if (this.values.length) {
      let i = 0
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1
        if (child + 1 < this.values.length && this.values[child + 1].f < this.values[child].f) child++
        if (this.values[child].f >= last.f) break
        this.values[i] = this.values[child]; i = child
      }
      this.values[i] = last
    }
    return first
  }
}

/** Four-way A*: every step respects the same collision map as the player. */
export function findPath(start: Point, end: Point, seed: number, maxNodes = 7000): Point[] {
  if (!getTile(start.x, start.y, seed).walkable || !getTile(end.x, end.y, seed).walkable || distance(start, end) > 180) return []
  const open = new MinHeap(), costs = new Map<string, number>()
  open.push({ ...start, g: 0, f: distance(start, end) })
  costs.set(key(start), 0)
  let visited = 0
  while (open.values.length && visited++ < maxNodes) {
    const node = open.pop()
    if (node.g !== costs.get(key(node))) continue
    if (node.x === end.x && node.y === end.y) {
      const path: Point[] = []
      let current: Node | undefined = node
      while (current) { path.push({ x: current.x, y: current.y }); current = current.parent }
      return path.reverse()
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: node.x + dx, y: node.y + dy }
      const tile = getTile(next.x, next.y, seed)
      if (!tile.walkable) continue
      // Prefer streets and paths; short garden shortcuts remain possible.
      const cost = node.g + (['path', 'plaza', 'bridge'].includes(tile.type) ? 1 : 2.7)
      const id = key(next)
      if (cost >= (costs.get(id) ?? Infinity)) continue
      costs.set(id, cost)
      open.push({ ...next, g: cost, f: cost + distance(next, end), parent: node })
    }
  }
  return []
}
