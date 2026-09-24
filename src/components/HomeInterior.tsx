import { useEffect, useRef } from 'react'
import { drawRoom } from '../world/roomArt'
import { drawResident } from '../world/characterArt'
import type { ResidentPosition } from '../world/residents'

const W = 680, H = 420

// Same lazy-load-and-cache pattern as renderer.ts's customSprites -- a
// resident's indoor art (Resident.sprites, keyed by Activity, same as
// outdoors) is an arbitrary user-supplied image, loaded once and reused.
// Cached as a Promise (not a raw HTMLImageElement/'loading' flag) so that
// every mount which asks for the same src -- including React StrictMode's
// deliberate double-mount of this effect on every open, which used to leave
// the second mount's own 'cancelled' flag permanently true while the FIRST
// mount's image quietly finished loading in the background -- attaches its
// own .then() to the same load and still gets to draw once it resolves.
const spriteCache = new Map<string, Promise<HTMLImageElement>>()
function loadSprite(src: string): Promise<HTMLImageElement> {
  let entry = spriteCache.get(src)
  if (!entry) {
    entry = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
    spriteCache.set(src, entry)
  }
  return entry
}

/** A "look inside" scene for a pinned resident's home -- a drawn room (see
 *  roomArt.ts) picked by their current indoor activity's `scene` (background
 *  only), with them standing in it. A custom sprite for their current
 *  `action` (resident.sprites[action], falling back to sprites.default) is
 *  drawn if set -- the SAME lookup key the world renderer uses outdoors;
 *  `scene` never affects which sprite shows. Shown from WorldView when the
 *  player looks inside a pinned resident's home. */
export function HomeInterior({ person, onTalk, onClose, crowded }: { person: ResidentPosition; onTalk: () => void; onClose: () => void; crowded?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const scene = person.scene ?? 'custom'
    const draw = (custom: HTMLImageElement | null) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = false
      drawRoom(ctx, scene, W, H)
      if (custom) {
        const h = H * 0.62, w = h * (custom.naturalWidth / custom.naturalHeight)
        ctx.drawImage(custom, W * 0.5 - w / 2, H * 0.72 - h, w, h)
      } else {
        ctx.save(); ctx.translate(W * 0.5, H * 0.72); ctx.scale(H * 0.36, H * 0.36)
        drawResident(ctx, -0.5, -0.88, 'south', 0, false, person.resident.sprite)
        ctx.restore()
      }
    }
    const src = person.resident.sprites?.[person.action] ?? person.resident.sprites?.default
    if (!src) { draw(null); return }
    draw(null)
    loadSprite(src).then(img => { if (!cancelled) draw(img) }).catch(() => {})
    return () => { cancelled = true }
  }, [person.scene, person.action, person.resident.sprite, person.resident.sprites])
  return <aside className={`home-interior${crowded ? ' home-interior--crowded' : ''}`} role="dialog" aria-label={`Inside ${person.resident.name}'s home`} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
    <div className="home-interior-card">
      <header><div><h2>{person.resident.name}’s home</h2><p>{person.activity} <span className="activity-tag">{person.action}</span></p></div><button aria-label="Close" onClick={onClose}>×</button></header>
      <canvas ref={ref} width={W} height={H} aria-hidden="true" className="home-interior-canvas" />
      {person.description && <p className="home-interior-note">{person.description}</p>}
      <div className="home-interior-actions"><button className="world-enter" onClick={onTalk}>Talk <kbd>E</kbd></button></div>
    </div>
  </aside>
}
