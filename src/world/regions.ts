export type Biome = 'meadow' | 'farmland' | 'woodland' | 'autumn' | 'highlands'
export const BIOMES: Record<Biome, { name: string; grass: string; detail: string; trees: number; description: string }> = {
  meadow: { name: 'Green meadows', grass: '#86bf69', detail: '#6aa457', trees: 0.3, description: 'Market towns, flower gardens and open grassland.' },
  farmland: { name: 'Harvest country', grass: '#acbb70', detail: '#8fa05a', trees: 0.13, description: 'Kitchen gardens, crop fields and small family farms.' },
  woodland: { name: 'Cedar woods', grass: '#699b68', detail: '#548359', trees: 0.62, description: 'Deep green groves, mushrooms and woodland wildlife.' },
  autumn: { name: 'Amber valley', grass: '#b4aa69', detail: '#938b55', trees: 0.42, description: 'Golden trees, fallen leaves and orchard villages.' },
  highlands: { name: 'Stone country', grass: '#9ba89a', detail: '#7e9081', trees: 0.2, description: 'Rocky clearings, old stonework and quiet hillside towns.' },
}
const TYPES: Biome[] = ['meadow', 'farmland', 'woodland', 'autumn', 'highlands']
export function regionBiome(rx: number, ry: number, seed: number): Biome {
  if (rx === 0 && ry === 0) return 'meadow'
  return TYPES[((rx + ry * 2 + seed % 5) % 5 + 5) % 5]
}
export function biomeAt(x: number, y: number, seed: number) {
  return regionBiome(Math.floor((x + 32) / 64), Math.floor((y + 32) / 64), seed)
}
function mix(a: string, b: string, amount: number) {
  const channel = (s: string, offset: number) => parseInt(s.slice(offset, offset + 2), 16)
  return '#' + [1, 3, 5].map(i => Math.round(channel(a, i) * (1 - amount) + channel(b, i) * amount).toString(16).padStart(2, '0')).join('')
}
export function grassColor(x: number, y: number, seed: number) {
  const rx = Math.floor((x + 32) / 64), ry = Math.floor((y + 32) / 64)
  const lx = x - rx * 64, ly = y - ry * 64
  let color = BIOMES[regionBiome(rx, ry, seed)].grass
  // Blend the outer eight tiles so region palettes never end at a hard seam.
  if (Math.abs(lx) > 24) color = mix(color, BIOMES[regionBiome(rx + Math.sign(lx), ry, seed)].grass, (Math.abs(lx) - 24) / 16)
  if (Math.abs(ly) > 24) color = mix(color, BIOMES[regionBiome(rx, ry + Math.sign(ly), seed)].grass, (Math.abs(ly) - 24) / 16)
  return color
}
