import type { Facing } from './facing'

interface Outfit {
  skin: string; skinLight: string; hair: string; hairLight: string
  coat: string; coatLight: string; trim: string
  apron?: boolean; cap?: boolean; longHair?: boolean; pack?: boolean
}
const PLAYER: Outfit = { skin: '#dba375', skinLight: '#efba85', hair: '#493435', hairLight: '#715044', coat: '#315a58', coatLight: '#4b9290', trim: '#d9ceb0', pack: true }
const NEIGHBOURS: Outfit[] = [
  { skin: '#c98b63', skinLight: '#e4a77c', hair: '#513b32', hairLight: '#795841', coat: '#8d543e', coatLight: '#bd7955', trim: '#eee1b8', apron: true, cap: true },
  { skin: '#a96d4d', skinLight: '#cd9464', hair: '#39372f', hairLight: '#5d543e', coat: '#4c6240', coatLight: '#83945a', trim: '#d6c68d', pack: true },
  { skin: '#d5a17d', skinLight: '#edbd96', hair: '#553c30', hairLight: '#92664b', coat: '#8d7042', coatLight: '#c9a45e', trim: '#e5d7b0', longHair: true },
  { skin: '#b47854', skinLight: '#d89a69', hair: '#44332b', hairLight: '#705343', coat: '#844e49', coatLight: '#b56e5c', trim: '#d6b988', apron: true },
  { skin: '#dda881', skinLight: '#f0c6a0', hair: '#4c3a46', hairLight: '#795365', coat: '#675377', coatLight: '#94749b', trim: '#e7bc82', longHair: true },
  { skin: '#ba815d', skinLight: '#dba474', hair: '#3e3530', hairLight: '#665344', coat: '#3f6075', coatLight: '#668fa1', trim: '#e7d9ad', cap: true, pack: true },
  { skin: '#aa704f', skinLight: '#cc9268', hair: '#93938a', hairLight: '#ccc7b0', coat: '#506a66', coatLight: '#7d9790', trim: '#ece0b9' },
  { skin: '#d5a17d', skinLight: '#ecc29b', hair: '#6e665e', hairLight: '#ada18a', coat: '#696050', coatLight: '#9d8c69', trim: '#ddd0a4', longHair: true },
]

/** Four views share an outfit, but have separate silhouettes and face details. */
function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Facing, time: number, walking: boolean, o: Outfit) {
  const side = facing === 'east' || facing === 'west', back = facing === 'north'
  const step = walking ? Math.round(Math.sin(time * 0.014) * 2) : 0
  const r = (color: string, xx: number, yy: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(xx, yy, w, h) }
  ctx.save(); ctx.translate(x + 0.5, y + 0.88); ctx.scale(1 / 24, 1 / 24)
  if (facing === 'west') ctx.scale(-1, 1)
  if (side) {
    // Profile: narrow torso, overlapping legs, one eye, nose and rear hair.
    r('#293f43', -4, -9, 8, 7)
    r('#233034', -3 - step, -3, 4, 3); r('#233034', step, -3, 5, 3)
    r('#b9ad87', -3 - step, -1, 4, 1); r('#b9ad87', step, -1, 5, 1)
    r(o.coat, -5, -19, 10, 11); r(o.coatLight, -3, -18, 7, 9); r(o.trim, 3, -17, 1, 7)
    if (o.apron) r(o.trim, 3, -15, 2, 7)
    if (o.pack) { r('#76543b', -7, -17, 4, 10); r('#b69261', -7, -16, 3, 7) }
    r(o.coat, -2 + step, -17, 3, 9); r(o.skin, -2 + step, -9, 3, 3)
    r(o.hair, -6, -27, 10, 11); r(o.hairLight, -5, -26, 3, 7)
    r(o.skin, -1, -23, 6, 7); r(o.skinLight, 1, -23, 4, 5)
    r(o.skinLight, 5, -21, 2, 3); r('#2b3435', 3, -22, 1, 2)
    r(o.hair, -5, -27, 10, 4); r(o.hair, -3, -24, 3, 5); r(o.hairLight, -3, -27, 7, 1)
    if (o.longHair) r(o.hair, -6, -23, 4, 11)
    if (o.cap) { r(o.trim, -6, -28, 10, 4); r(o.trim, 2, -25, 5, 2); r('#bcaf90', -6, -25, 8, 1) }
  } else {
    r('#293f43', -5, -9, 10, 8)
    r('#233034', -5, -3 + step, 4, 3); r('#233034', 1, -3 - step, 4, 3)
    r('#b9ad87', -5, -1 + step, 4, 1); r('#b9ad87', 1, -1 - step, 4, 1)
    r(o.coat, -7, -19, 14, 11); r(o.coatLight, -6, -18, 12, 9)
    r(o.coat, -9, -17 + step, 3, 9); r(o.skin, -9, -9 + step, 3, 3)
    r(o.coat, 6, -17 - step, 3, 9); r(o.skinLight, 6, -9 - step, 3, 3)
    r(o.hair, -6, -27, 12, 11); r(o.hair, -7, -25, 14, 8)
    if (back) {
      // Back of head and coat: no face or front buttons showing through.
      r(o.hairLight, -5, -26, 3, 8); r(o.hairLight, -2, -27, 6, 2); r(o.coat, -5, -10, 10, 1)
      if (o.apron) r(o.trim, -6, -12, 12, 1)
      if (o.pack) { r('#76543b', -5, -17, 10, 10); r('#b69261', -4, -16, 8, 7); r('#e0c48a', -1, -13, 2, 2) }
      if (o.longHair) { r(o.hair, -6, -19, 12, 5); r(o.hairLight, -4, -22, 2, 7) }
    } else {
      r(o.trim, -1, -18, 2, 7)
      if (o.apron) { r(o.trim, -4, -15, 8, 8); r('#b9ab87', -2, -11, 4, 2) }
      r(o.skin, -5, -23, 10, 8); r(o.skinLight, -4, -23, 7, 6)
      r(o.hair, -6, -27, 12, 5); r(o.hairLight, -4, -27, 8, 2); r(o.hair, -6, -24, 3, 5)
      r('#2b3435', -3, -21, 1, 2); r('#2b3435', 3, -21, 1, 2); r('#a26352', 0, -17, 2, 1)
      if (o.longHair) { r(o.hair, -7, -22, 2, 9); r(o.hair, 5, -22, 2, 9) }
      if (o.pack) { r('#b69261', 4, -14, 4, 6); r('#e0c48a', 5, -13, 2, 2) }
    }
    if (o.cap) { r(o.trim, -6, -28, 12, 4); r('#bcaf90', -6, -25, 12, 1); if (!back) r(o.trim, -5, -24, 10, 1) }
  }
  ctx.restore()
}

export function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Facing, time: number, walking: boolean) {
  drawCharacter(ctx, x, y, facing, time, walking, PLAYER)
}
export function drawResident(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Facing, time: number, walking: boolean, variant: number) {
  drawCharacter(ctx, x, y, facing, time, walking, NEIGHBOURS[variant % NEIGHBOURS.length])
}
