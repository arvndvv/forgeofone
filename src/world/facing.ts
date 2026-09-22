export type Facing = 'north' | 'south' | 'east' | 'west'

export const FACING_VECTOR: Record<Facing, { x: number; y: number }> = {
  north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 },
}

/** World coordinates increase southward. Stationary actors keep their heading. */
export function facingForStep(dx: number, dy: number, previous: Facing = 'south'): Facing {
  if (dx === 0 && dy === 0) return previous
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'west' : 'east' : dy < 0 ? 'north' : 'south'
}
