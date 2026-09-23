import { useEffect, useRef } from 'react'
import { drawResident } from '../world/characterArt'
import type { Resident } from '../world/residents'

/** The image/portrait shown top-left of a resident's chat box. A custom
 *  `resident.portrait` (a transparent PNG import) is used if set; otherwise
 *  this falls back to a code-drawn portrait using their world outfit, so
 *  every resident always has one -- adding real art is a pure upgrade. */
export function ResidentPortrait({ resident }: { resident: Resident }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (resident.portrait || !ref.current) return
    const ctx = ref.current.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 96, 112); ctx.imageSmoothingEnabled = false
    ctx.scale(80, 80)
    drawResident(ctx, 0.1, 0.45, 'south', 0, false, resident.sprite)
  }, [resident.portrait, resident.sprite])
  if (resident.portrait) return <img src={resident.portrait} alt="" className="resident-portrait-img" />
  return <canvas ref={ref} width={96} height={112} aria-hidden="true" className="resident-portrait-img" />
}
