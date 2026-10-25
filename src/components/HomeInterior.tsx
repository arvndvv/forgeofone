import { useEffect, useRef } from 'react'
import { drawRoom } from '../world/roomArt'
import { drawResident } from '../world/characterArt'
import type { ResidentPosition } from '../world/residents'
import { loadMedia, mediaSize, type SpriteMedia } from '../world/spriteMedia'

const W = 680, H = 420

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
    let frame = 0
    const draw = (custom: SpriteMedia | null) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = false
      drawRoom(ctx, scene, W, H)
      if (custom) {
        const size = mediaSize(custom), h = H * 0.62, w = h * (size.width / size.height)
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
    loadMedia(src).then(media => {
      if (cancelled) return
      // A still image is drawn once; a video keeps redrawing while it shows.
      if (media instanceof HTMLVideoElement) {
        void media.play().catch(() => {})
        const tick = () => { if (cancelled) return; draw(media); frame = requestAnimationFrame(tick) }
        tick()
      } else draw(media)
    }).catch(() => {})
    return () => { cancelled = true; cancelAnimationFrame(frame) }
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
