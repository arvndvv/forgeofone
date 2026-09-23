import type { SceneKind } from './residents'

/** A small, code-drawn interior background for HomeInterior.tsx -- no new
 *  art assets, same flat-rectangle style as characterArt.ts/animalArt.ts.
 *  Draws directly in canvas pixel space (not the 1/24-scaled world-tile
 *  space drawCharacter uses) into a `w`x`h` canvas. Furniture picked by
 *  `scene`; 'custom' is a plain room with just a rug, for anything that
 *  doesn't fit the other five. */
export function drawRoom(ctx: CanvasRenderingContext2D, scene: SceneKind, w: number, h: number) {
  const r = (color: string, x: number, y: number, rw: number, rh: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, rw, rh) }
  const floorY = h * 0.72
  r('#2c2018', 0, 0, w, h)
  r('#3c2e22', 0, 0, w, floorY)
  r('#2a1f17', 0, floorY - 3, w, 3)
  r('#5a4632', 0, floorY, w, h - floorY)
  for (let x = 0; x < w; x += 22) r('#4c3a29', x, floorY, 1.5, h - floorY)
  // A window on the back wall -- warm lamplight square, every scene gets one.
  r('#6b5847', w * 0.72, h * 0.1, w * 0.18, floorY * 0.42)
  r('#e7c37a', w * 0.72 + 4, h * 0.1 + 4, w * 0.18 - 8, floorY * 0.42 - 8)
  r('#c79a55', w * 0.72 + w * 0.09 - 1, h * 0.1, 2, floorY * 0.42)

  if (scene === 'sleeping') {
    const bx = w * 0.1, by = floorY - 46, bw = w * 0.32
    r('#5c4330', bx, by + 30, bw, 16) // frame
    r('#3d5a63', bx + 2, by, bw - 4, 32) // blanket
    r('#e8dcc0', bx + 4, by + 2, bw * 0.32, 12) // pillow
  } else if (scene === 'cooking') {
    const cx = w * 0.08, cy = floorY - 40
    r('#4a4038', cx, cy, w * 0.26, 40) // counter
    r('#2c2620', cx, cy, w * 0.26, 6)
    r('#37312c', cx + 10, cy - 14, 22, 14) // pot
    r('#c98b4a', cx + 14, cy - 18, 14, 4)
    r('#6b5236', cx + w * 0.26 - 16, cy - 26, 12, 26) // hanging jar shelf
  } else if (scene === 'reading') {
    const sx = w * 0.06, sy = floorY - 70
    r('#4a382a', sx, sy, w * 0.22, 70) // bookshelf frame
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) r(col % 2 ? '#a9633f' : '#5d7a5f', sx + 4 + col * (w * 0.22 - 8) / 4, sy + 6 + row * 21, (w * 0.22 - 8) / 4 - 2, 16)
    r('#6b5236', w * 0.02, floorY - 14, w * 0.16, 14) // low chair
  } else if (scene === 'resting') {
    r('#8a6a49', w * 0.1, floorY - 10, w * 0.22, 10) // low table
    r('#c68a5a', w * 0.14, floorY - 26, 20, 18) // cushion
    r('#dba876', w * 0.14 + 22, floorY - 22, 16, 14)
  } else if (scene === 'playing') {
    r('#8a5a3a', w * 0.08, floorY - 22, 26, 22) // toy chest
    r('#c98b4a', w * 0.08, floorY - 22, 26, 5)
    ctx.fillStyle = '#d9b25c'; ctx.beginPath(); ctx.arc(w * 0.26, floorY - 8, 8, 0, Math.PI * 2); ctx.fill() // ball
  }
  // A rug in front, every scene.
  r('#7a4b46', w * 0.42, floorY + 8, w * 0.4, 12)
  r('#8f5d55', w * 0.44, floorY + 10, w * 0.36, 8)
}
