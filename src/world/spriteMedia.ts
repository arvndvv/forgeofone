/** Character art can be a still image OR a short looping video, per state.
 *  Anywhere a resident's `sprites` / `portrait` takes a path, an imported
 *  .webm or .mp4 works too -- import it the same way as a PNG:
 *
 *    import tamReading from '../assets/game/residents/tam/reading.webm'
 *    sprites: { reading: tamReading, default: tamPng }
 *
 *  Videos play muted and looped. For a transparent background use WebM
 *  with an alpha channel (VP9); Electron/Chromium draws that correctly on
 *  the map and in rooms. An MP4 has no transparency, so it shows its own
 *  background. Keep clips short and small (a few seconds, a few hundred KB):
 *  each distinct clip on screen is decoded continuously while visible. */
export type SpriteMedia = HTMLImageElement | HTMLVideoElement

export const isVideoSrc = (src: string) => /\.(webm|mp4|m4v|mov|ogv)([?#].*)?$/i.test(src)

export function mediaSize(m: SpriteMedia): { width: number; height: number } {
  return m instanceof HTMLVideoElement ? { width: m.videoWidth || 1, height: m.videoHeight || 1 } : { width: m.naturalWidth || 1, height: m.naturalHeight || 1 }
}

const cache = new Map<string, Promise<SpriteMedia>>()
const ready = new Map<string, SpriteMedia | 'error'>()

/** Loads (once) and caches an image or video by path. Shared by the world
 *  renderer and HomeInterior, so the same clip is decoded only once. */
export function loadMedia(src: string): Promise<SpriteMedia> {
  let entry = cache.get(src)
  if (!entry) {
    entry = new Promise<SpriteMedia>((resolve, reject) => {
      if (isVideoSrc(src)) {
        const video = document.createElement('video')
        video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true; video.preload = 'auto'
        video.onloadeddata = () => { void video.play().catch(() => {}); resolve(video) }
        video.onerror = () => reject(new Error(`Could not load character video ${src}`))
        video.src = src
      } else {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Could not load character art ${src}`))
        img.src = src
      }
    })
    entry.then(m => ready.set(src, m), () => ready.set(src, 'error'))
    cache.set(src, entry)
  }
  return entry
}

/** Synchronous version for per-frame drawing: the media if it's loaded,
 *  otherwise null (and starts the load), so callers fall back to the
 *  code-drawn character until it's ready. */
export function mediaNow(src: string): SpriteMedia | null {
  const m = ready.get(src)
  if (m === 'error') return null
  if (!m) { void loadMedia(src).catch(() => {}); return null }
  if (m instanceof HTMLVideoElement && m.paused) void m.play().catch(() => {})
  return m
}
