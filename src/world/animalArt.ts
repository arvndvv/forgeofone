import type { Facing } from './facing'
import type { AnimalKind } from './wildlife'

/** Pixel animals with front/back silhouettes, faces, tails and moving feet. */
export function drawAnimal(ctx: CanvasRenderingContext2D, x: number, y: number, kind: AnimalKind, facing: Facing, time: number, walking: boolean) {
  const side = facing === 'east' || facing === 'west', back = facing === 'north'
  const step = walking ? Math.round(Math.sin(time * 9)) : 0
  const hop = walking && (kind === 'rabbit' || kind === 'bird') ? Math.abs(Math.sin(time * 9)) : 0
  const r = (color: string, xx: number, yy: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(xx, yy, w, h) }
  ctx.save(); ctx.translate(x + 0.5, y + 0.84 - hop / 24); ctx.scale(1 / 24, 1 / 24)
  if (facing === 'west') ctx.scale(-1, 1)
  if (kind === 'sheep') {
    r('#696052', -5, -4 + step, 2, 4); r('#696052', 3, -4 - step, 2, 4)
    if (side) {
      r('#b9b6a0', -8, -12, 15, 8); r('#e7e5cf', -7, -14, 13, 9); r('#f6f0db', -5, -15, 8, 4)
      r('#f6f0db', -9, -11, 3, 3); r('#71675b', 3, -13, 6, 8); r('#ded9c0', 2, -14, 7, 3)
      r('#918471', 7, -9, 3, 3); r('#293c38', 7, -12, 1, 2); r('#b2a795', 2, -11, 2, 3)
    } else {
      r('#b9b6a0', -7, -13, 14, 9); r('#e7e5cf', -6, -15, 12, 10); r('#f6f0db', -4, -16, 8, 4)
      if (back) { r('#918471', -7, -15, 3, 2); r('#918471', 4, -15, 3, 2); r('#f6f0db', -2, -7, 4, 4) }
      else {
        r('#918471', -8, -12, 3, 2); r('#918471', 5, -12, 3, 2); r('#71675b', -4, -13, 8, 8); r('#f6f0db', -4, -14, 8, 3)
        r('#293c38', -3, -10, 1, 2); r('#293c38', 2, -10, 1, 2); r('#b2a795', -2, -7, 4, 2)
      }
    }
  } else if (kind === 'chicken') {
    r('#cf9b4e', -3, -3 + step, 2, 3); r('#cf9b4e', 2, -3 - step, 2, 3)
    if (side) {
      r('#bfbda8', -7, -8, 13, 5); r('#f1ecd5', -6, -11, 11, 7); r('#f1ecd5', -8, -13, 3, 5)
      r('#d7d6bf', -4, -9, 5, 4); r('#f8f0d8', 2, -16, 5, 9)
      r('#c45542', 2, -18, 4, 3); r('#c45542', 5, -10, 2, 3); r('#dfac56', 7, -13, 3, 2); r('#2c4039', 5, -14, 1, 2)
    } else {
      r('#bfbda8', -5, -9, 10, 6); r('#f1ecd5', -4, -12, 8, 8)
      r('#d7d6bf', -6, -10, 2, 5); r('#d7d6bf', 4, -10, 2, 5)
      r('#f8f0d8', -3, -16, 6, 7); r('#c45542', -1, -18, 3, 3)
      if (back) { r('#d7d6bf', -2, -8, 4, 4); r('#fff5dc', -1, -10, 2, 5) }
      else { r('#2c4039', -2, -14, 1, 2); r('#2c4039', 2, -14, 1, 2); r('#dfac56', -1, -12, 3, 2); r('#c45542', 0, -10, 2, 3) }
    }
  } else if (kind === 'rabbit') {
    r('#b9b6a3', -5, -3 + step, 4, 3); r('#b9b6a3', 2, -3 - step, 4, 3)
    if (side) {
      r('#b9b6a3', -7, -9, 12, 7); r('#e6dfc6', -6, -11, 11, 8); r('#f4ead1', -8, -7, 3, 3)
      r('#e6dfc6', 1, -13, 7, 8); r('#e6dfc6', 1, -21, 2, 10); r('#e6dfc6', 5, -20, 2, 9)
      r('#c7a59b', 2, -19, 1, 6); r('#c7a59b', 6, -18, 1, 6); r('#344443', 6, -11, 1, 2); r('#c7a59b', 8, -8, 1, 2)
    } else {
      r('#b9b6a3', -6, -11, 12, 8); r('#e6dfc6', -5, -13, 10, 9)
      r('#e6dfc6', -4, -21, 3, 10); r('#e6dfc6', 2, -21, 3, 10)
      if (back) { r('#cfcbb6', -3, -20, 1, 7); r('#cfcbb6', 3, -20, 1, 7); r('#f7eed6', -2, -7, 4, 4) }
      else {
        r('#f0e7ce', -5, -13, 10, 7); r('#c7a59b', -3, -20, 1, 7); r('#c7a59b', 3, -20, 1, 7)
        r('#344443', -3, -11, 1, 2); r('#344443', 3, -11, 1, 2); r('#c7a59b', 0, -8, 2, 1)
      }
    }
  } else {
    r('#b99a60', -2, -2 + step, 1, 2); r('#b99a60', 2, -2 - step, 1, 2)
    if (side) {
      r('#496378', -6, -6, 3, 2); r('#627e91', -4, -8, 8, 6); r('#abc3c2', -3, -7, 4, 3)
      r('#627e91', 2, -12, 5, 7); r('#deb970', 7, -9, 2, 2); r('#293f47', 5, -10, 1, 1)
    } else {
      r('#496378', -4, -7, 8, 5); r('#627e91', -3, -9, 6, 7); r('#627e91', -3, -12, 6, 6)
      if (back) { r('#abc3c2', -2, -10, 4, 2); r('#496378', -1, -4, 2, 3) }
      else { r('#abc3c2', -2, -7, 4, 4); r('#293f47', -2, -10, 1, 1); r('#293f47', 2, -10, 1, 1); r('#deb970', 0, -8, 2, 2) }
    }
  }
  ctx.restore()
}
