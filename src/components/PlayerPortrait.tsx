import { useEffect, useRef } from 'react'
import { drawPlayer } from '../world/playerArt'
export function PlayerPortrait() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { const ctx = ref.current!.getContext('2d')!; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 48, 56); ctx.scale(40, 40); drawPlayer(ctx, 0.1, 0.45, 'south', 0, false) }, [])
  return <canvas ref={ref} width={48} height={56} aria-label="Your adventurer" style={{ width: 36, height: 42, imageRendering: 'pixelated' }} />
}
