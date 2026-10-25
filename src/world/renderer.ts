import atlasUrl from '../assets/game/world/town-atlas.png'
import { mediaNow, mediaSize } from './spriteMedia'
import farmUrl from '../assets/game/world/farm-atlas.png'
import { CHUNK_SIZE, getTile, hashCoord, nearbySettlements, type Building, type Point } from './generation'
import { getResidents, residentPosition, employeeResidents, dynamicExpertResidents, type ResidentPosition, type ResidentOverride } from './residents'
import { BIOMES, biomeAt, grassColor } from './regions'
import { getAnimals, animalPosition, type AnimalPosition } from './wildlife'
import { drawPlayer, drawResident } from './characterArt'
import { drawAnimal } from './animalArt'
import type { Facing } from './facing'
import type { TileType, Business, RivalBusiness, DynamicExpert } from '../types/game'

export const MAP_COLORS: Record<TileType, string> = { grass: '#83b96b', path: '#d3b080', plaza: '#c0bc98', plot: '#88725a', water: '#5a99ac', sand: '#dec691', bridge: '#ab8056', field: '#a7af57' }
export interface RenderState {
  seed: number; player: Point; playerFacing: Facing; minutes: number; now: number; zoom: number;
  route: Point[]; labels: boolean; selected: string | null; reducedMotion: boolean
  discoveries: Record<string, true>
  residentOverrides: Record<string, ResidentOverride>
  /** The player's own founded businesses -- places their onsite hires
   *  physically on the map (employeeResidents()) and, for any business
   *  that's claimed a real building (Business.buildingId, v0.23), swaps
   *  that building's drawn label for the business's own name. Optional so
   *  a caller that never sends businesses still renders fine with none of
   *  this. */
  businesses?: Business[]
  /** Same building-label override as `businesses`, for rivals that have
   *  claimed a building (RivalBusiness.buildingId). */
  rivalBusinesses?: RivalBusiness[]
  /** AI-created domain experts (see gameStore's ensureExpertFor) -- placed
   *  on the map the same way pinned/hired residents are. */
  dynamicExperts?: DynamicExpert[]
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not load world artwork')); img.src = url
})

// Custom per-resident sprites (Resident.sprites / a pinned character's own
// art) are arbitrary, user-supplied images or looping videos (see
// spriteMedia.ts) rather than atlas tiles, loaded lazily on first use. A
// pending or failed load just falls back to the code-drawn character for
// that frame; the art appears once it resolves.
const customSprite = mediaNow

export async function createRenderer(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement) {
  const [atlas, farm] = await Promise.all([atlasUrl, farmUrl].map(loadImage))
  const ctx = canvas.getContext('2d')!, mini = minimap.getContext('2d')!
  const ground = new Map<string, HTMLCanvasElement>()
  let camera = { x: 0, y: 0 }, avatar = { x: 0, y: 0 }, lastTime = 0, initialized = false
  let width = 0, height = 0, scale = 32, lastMini = ''
  let visibleResidents: ResidentPosition[] = []
  let visibleBuildings: Building[] = []
  let visibleAnimals: AnimalPosition[] = []

  function sprite(context: CanvasRenderingContext2D, index: number, x: number, y: number, w = 1, h = 1) {
    context.drawImage(atlas, index % 12 * 16, Math.floor(index / 12) * 16, 16, 16, x, y, w, h)
  }
  function farmSprite(index: number, x: number, y: number, w = 1, h = 1) { ctx.drawImage(farm, index % 12 * 16, Math.floor(index / 12) * 16, 16, 16, x, y, w, h) }

  function groundChunk(cx: number, cy: number, seed: number) {
    const key = `${seed}:${cx},${cy}`
    const found = ground.get(key)
    if (found) return found
    const surface = document.createElement('canvas'); surface.width = surface.height = CHUNK_SIZE * 16
    const c = surface.getContext('2d')!; c.scale(16, 16); c.imageSmoothingEnabled = false
    for (let dy = 0; dy < CHUNK_SIZE; dy++) for (let dx = 0; dx < CHUNK_SIZE; dx++) {
      const x = cx * CHUNK_SIZE + dx, y = cy * CHUNK_SIZE + dy
      const t = getTile(x, y, seed), roll = hashCoord(x, y, seed + 200)
      c.fillStyle = MAP_COLORS[t.type]; c.fillRect(dx, dy, 1, 1)
      if (t.type === 'grass') {
        c.fillStyle = grassColor(x, y, seed); c.fillRect(dx, dy, 1, 1)
        c.fillStyle = BIOMES[biomeAt(x, y, seed)].detail
        if (roll < 0.4) { c.fillRect(dx + 0.25, dy + 0.3, 0.065, 0.12); c.fillRect(dx + 0.31, dy + 0.38, 0.065, 0.06); c.fillRect(dx + 0.7, dy + 0.75, 0.125, 0.06) }
      } else if (t.type === 'path') {
        // Select edge/corner tiles from neighbouring surfaces so roads join.
        const joins = (xx: number, yy: number) => ['path', 'plaza', 'bridge'].includes(getTile(xx, yy, seed).type)
        const n = joins(x, y - 1), s = joins(x, y + 1), w = joins(x - 1, y), e = joins(x + 1, y)
        const col = !w ? 0 : !e ? 2 : 1, row = !n ? 0 : !s ? 2 : 1
        sprite(c, 12 + row * 12 + col, dx, dy)
        // Atlas edges carry their original green. Cover just the outer pixels
        // with the local grass colour where the road meets a different biome.
        c.fillStyle = grassColor(x, y, seed)
        if (!n) c.fillRect(dx, dy, 1, 0.065)
        if (!s) c.fillRect(dx, dy + 0.935, 1, 0.065)
        if (!w) c.fillRect(dx, dy, 0.065, 1)
        if (!e) c.fillRect(dx + 0.935, dy, 0.065, 1)
      } else if (t.type === 'plaza') {
        c.fillStyle = roll > 0.4 ? '#c1bca0' : '#bab69a'; c.fillRect(dx, dy, 1, 1)
        c.fillStyle = '#a8aa8b'; c.fillRect(dx, dy, 1, 1 / 16); c.fillRect(dx, dy, 1 / 16, 1)
        c.fillStyle = '#d0cbb0'; c.fillRect(dx + 2 / 16, dy + 2 / 16, 12 / 16, 1 / 16)
      } else if (t.type === 'bridge') {
        c.fillStyle = '#795d45'; c.fillRect(dx, dy, 1, 1)
        c.fillStyle = '#b88e5c'; for (let j = 0; j < 4; j++) c.fillRect(dx + j / 4, dy + 0.04, 0.2, 0.92)
      } else if (t.type === 'field') {
        c.fillStyle = '#8a8150'; c.fillRect(dx, dy, 1, 1)
        for (let j = 0; j < 3; j++) { c.fillStyle = '#a9b861'; c.fillRect(dx + 0.12, dy + j / 3 + 0.1, 0.76, 0.12); c.fillStyle = '#d2c77b'; c.fillRect(dx + 0.2, dy + j / 3 + 0.06, 0.12, 0.1) }
      } else if (t.type === 'water') {
        c.fillStyle = roll > 0.5 ? '#609eaf' : '#5c98ab'; c.fillRect(dx, dy, 1, 1)
        c.fillStyle = '#85b8bc'; if (roll < 0.4) c.fillRect(dx + 0.2, dy + 0.4, 0.4, 1 / 16)
      } else if (t.type === 'sand') {
        c.fillStyle = '#c4b380'; c.fillRect(dx + 0.2, dy + 0.6, 0.1, 0.06)
      }
    }
    ground.set(key, surface)
    if (ground.size > 64) ground.delete(ground.keys().next().value!)
    return surface
  }

  function building(b: Building, minutes: number) {
    const doorCol = b.door.x - b.x
    ctx.fillStyle = 'rgba(32,44,31,0.2)'; ctx.fillRect(b.x + 0.18, b.y + 0.3, b.width, b.height)
    for (let row = 0; row < b.height; row++) for (let col = 0; col < b.width; col++) {
      let index: number
      if (row < 2) {
        index = (row === 0 ? 48 : 60) + b.roof * 4 + (col === 0 ? 0 : col === b.width - 1 ? 2 : 1)
        if (row === 1 && col === doorCol) index = b.roof ? 67 : 63
      } else {
        const wall = b.roof ? 76 : 72
        index = wall + (col === 0 ? 0 : col === b.width - 1 ? 3 : 1)
        if (row === 2 && (col === 1 || col === b.width - 2)) index = b.roof ? 88 : 84
        if (row === 3 && col === doorCol) index = b.roof ? 89 : 85
      }
      sprite(ctx, index, b.x + col, b.y + row)
    }
    // A shop awning and a hanging sign distinguish public buildings from homes.
    if (b.kind !== 'home') {
      for (let i = 0; i < (b.width - 2) * 2; i++) { ctx.fillStyle = i % 2 ? '#ead5a2' : b.kind === 'civic' ? '#496d74' : '#aa6550'; ctx.fillRect(b.x + 1 + i * 0.5, b.y + 2.83, 0.5, 0.26) }
      sprite(ctx, 83, b.x + b.width - 0.9, b.y + 3.1, 0.7, 0.7)
    }
    if (minutes % 1440 > 1110 || minutes % 1440 < 360) {
      ctx.fillStyle = '#eac67c'; ctx.globalAlpha = 0.7
      for (const col of new Set([1, b.width - 2])) ctx.fillRect(b.x + col + 0.37, b.y + 2.36, 0.25, 0.3)
      ctx.globalAlpha = 1
    }
  }

  function label(text: string, x: number, y: number, accent = false) {
    ctx.font = '0.29px "Pixelify Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width + 0.4
    ctx.fillStyle = accent ? '#263e35ed' : '#29332be0'; ctx.fillRect(x - w / 2, y - 0.22, w, 0.44)
    ctx.fillStyle = accent ? '#e4d59c' : '#f1e8cc'; ctx.fillText(text, x, y + 0.01)
  }

  const rect = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) }
  function activity(p: ResidentPosition, time: number) {
    if (p.moving || p.action === 'home') return
    const x = p.x + 0.65, y = p.y + 0.53, wave = Math.sin(time * 4 + p.resident.sprite)
    if (['baking', 'repairing', 'selling', 'delivery'].includes(p.action)) {
      rect('#674d38', x - 0.12, y + 0.1, 0.8, 0.14); rect('#674d38', x, y + 0.2, 0.08, 0.23); rect('#674d38', x + 0.5, y + 0.2, 0.08, 0.23)
      rect('#b48b57', x - 0.12, y, 0.8, 0.12)
      if (p.action === 'baking') {
        for (let i = 0; i < 3; i++) { rect('#dcaf63', x + i * 0.2, y - 0.15, 0.16, 0.17); rect('#f4d590', x + i * 0.2 + 0.04, y - 0.15, 0.04, 0.08) }
      } else if (p.action === 'repairing') {
        ctx.save(); ctx.translate(x + 0.12, y - 0.12); ctx.rotate(wave * 0.65); rect('#835d3f', 0, -0.3, 0.06, 0.35); rect('#a9b8af', -0.1, -0.35, 0.23, 0.12); ctx.restore()
      } else if (p.action === 'selling') {
        for (let i = 0; i < 3; i++) rect(i % 2 ? '#e6bb62' : '#bf6d49', x + i * 0.21, y - 0.15, 0.16, 0.14)
      } else { rect('#b98956', x, y - 0.3, 0.36, 0.3); rect('#efcd85', x + 0.15, y - 0.3, 0.06, 0.3) }
    } else if (p.action === 'gardening') {
      rect('#5d8996', x, y - 0.16, 0.25, 0.2); rect('#8ab3b7', x + 0.24, y - 0.1, 0.18, 0.07)
      for (let i = 0; i < 3; i++) rect('#b9d8ce', x + 0.35 + i * 0.05, y + ((time * 1.5 + i * 0.15) % 0.4), 0.04, 0.065)
    } else if (p.action === 'painting') {
      rect('#806346', x + 0.1, y - 0.65, 0.08, 0.95); rect('#806346', x + 0.48, y - 0.65, 0.08, 0.95)
      rect('#eddfbb', x, y - 0.62, 0.65, 0.58); rect('#679f8b', x + 0.12, y - 0.4, 0.36, 0.2); rect('#dbb36c', x + 0.36, y - 0.55, 0.1, 0.1)
    } else if (p.action === 'reading') {
      rect('#655943', x - 0.4, y - 0.28, 0.55, 0.34); rect('#e8d9ac', x - 0.37, y - 0.26, 0.48, 0.28); rect('#b2a481', x - 0.14, y - 0.26, 0.025, 0.28)
    } else if (p.action === 'resting') {
      rect('#f1e3bd', x - 0.32, y - 0.2, 0.15, 0.2); rect('#967455', x - 0.29, y - 0.22, 0.09, 0.04)
    } else if (p.action === 'chatting') {
      rect('#ede7cc', x - 0.35, y - 1.12, 0.55, 0.3); rect('#ede7cc', x - 0.26, y - 0.84, 0.08, 0.08)
      for (let i = 0; i < 3; i++) rect('#647967', x - 0.25 + i * 0.13, y - 1 + (i === Math.floor(time * 2) % 3 ? -0.03 : 0), 0.06, 0.06)
    }
  }

  function animal(p: AnimalPosition, time: number) {
    ctx.fillStyle = '#294a3828'; ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y + 0.82, 0.23, 0.07, 0, 0, Math.PI * 2); ctx.fill()
    drawAnimal(ctx, p.x, p.y, p.animal.kind, p.facing, time, p.moving && time !== 0)
  }

  function drawMinimap(seed: number, p: Point) {
    const key = `${seed}:${Math.floor(p.x / 2)},${Math.floor(p.y / 2)}`
    if (key === lastMini) return
    lastMini = key
    minimap.width = minimap.height = 132
    mini.fillStyle = '#213b30'; mini.fillRect(0, 0, 132, 132)
    // Two world tiles per sample: a useful district map, not a duplicate close-up.
    for (let my = 0; my < 66; my++) for (let mx = 0; mx < 66; mx++) {
      const t = getTile(Math.floor(p.x / 2) * 2 + (mx - 33) * 2, Math.floor(p.y / 2) * 2 + (my - 33) * 2, seed)
      mini.fillStyle = t.buildingId ? '#a67455' : t.decor?.startsWith('tree') ? '#4e804f' : t.type === 'grass' ? grassColor(Math.floor(p.x / 2) * 2 + (mx - 33) * 2, Math.floor(p.y / 2) * 2 + (my - 33) * 2, seed) : MAP_COLORS[t.type]
      mini.fillRect(mx * 2, my * 2, 2, 2)
    }
    mini.fillStyle = '#fff3b9'; mini.fillRect(64, 64, 5, 5)
    mini.strokeStyle = '#25352c'; mini.strokeRect(63.5, 63.5, 6, 6)
  }

  return {
    render(state: RenderState) {
      const bounds = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = bounds.width; height = bounds.height; scale = 32 * state.zoom
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr) }
      const dt = Math.min(0.05, (state.now - lastTime) / 1000); lastTime = state.now
      const far = Math.hypot(state.player.x - avatar.x, state.player.y - avatar.y) > 6
      if (!initialized || far || state.reducedMotion) { camera = { ...state.player }; avatar = { ...state.player }; initialized = true }
      const moving = Math.hypot(state.player.x - avatar.x, state.player.y - avatar.y) > 0.025
      const follow = 1 - Math.exp(-18 * dt), pan = 1 - Math.exp(-10 * dt)
      avatar.x += (state.player.x - avatar.x) * follow; avatar.y += (state.player.y - avatar.y) * follow
      camera.x += (avatar.x - camera.x) * pan; camera.y += (avatar.y - camera.y) * pan
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height)
      ctx.imageSmoothingEnabled = false
      ctx.translate(Math.round(width / 2 - (camera.x + 0.5) * scale), Math.round(height / 2 - (camera.y + 0.5) * scale)); ctx.scale(scale, scale)
      const left = Math.floor(camera.x - width / scale / 2) - 2, right = Math.ceil(camera.x + width / scale / 2) + 2
      const top = Math.floor(camera.y - height / scale / 2) - 5, bottom = Math.ceil(camera.y + height / scale / 2) + 4
      for (let cy = Math.floor(top / 16); cy <= Math.floor(bottom / 16); cy++) for (let cx = Math.floor(left / 16); cx <= Math.floor(right / 16); cx++) ctx.drawImage(groundChunk(cx, cy, state.seed), cx * 16, cy * 16, 16, 16)
      for (const point of state.route) { ctx.fillStyle = '#f9edbe88'; ctx.beginPath(); ctx.arc(point.x + 0.5, point.y + 0.5, 0.085, 0, Math.PI * 2); ctx.fill() }

      const drawables: Array<{ depth: number; draw: () => void }> = []
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const t = getTile(x, y, state.seed)
        if (t.type === 'water' && hashCoord(x, y, state.seed) < 0.15) {
          ctx.fillStyle = '#aad1d044'; ctx.fillRect(x + 0.2 + Math.sin(state.minutes * 0.8 + y) * 0.12, y + 0.7, 0.4, 0.045)
        }
        if (!t.decor) continue
        if (t.decor === 'flowers' || t.decor === 'sprig') {
          if (t.decor === 'flowers') for (const [fx, fy] of [[0.2, 0.3], [0.7, 0.7]]) { rect('#629158', x + fx, y + fy, 0.05, 0.19); rect('#f3d886', x + fx - 0.055, y + fy - 0.055, 0.16, 0.1); rect('#fff1ba', x + fx, y + fy - 0.1, 0.055, 0.16) }
          continue
        }
        drawables.push({ depth: y + 0.9, draw: () => {
          if (t.decor === 'tree1' || t.decor === 'tree2') {
            ctx.fillStyle = '#365d4238'; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 0.9, 0.48, 0.15, 0, 0, Math.PI * 2); ctx.fill()
            sprite(ctx, t.decor === 'tree1' ? 3 : 4, x, y - 1); sprite(ctx, t.decor === 'tree1' ? 15 : 16, x, y)
          } else if (t.decor === 'well') {
            ctx.fillStyle = '#777f76'; ctx.fillRect(x + 0.08, y + 0.3, 0.84, 0.6)
            sprite(ctx, 104, x, y - 0.15)
          } else if (t.decor === 'rock') { farmSprite(77, x, y); }
          else if (t.decor === 'mushrooms') { sprite(ctx, 29, x + 0.15, y + 0.3, 0.6, 0.6) }
          else if (t.decor === 'ruin') { sprite(ctx, 100, x, y - 0.4); sprite(ctx, 125, x, y + 0.2, 1, 0.7) }
          else if (t.decor === 'bench') {
            rect('#5f4f3a', x + 0.05, y + 0.65, 0.1, 0.25); rect('#5f4f3a', x + 0.85, y + 0.65, 0.1, 0.25); rect('#b18b54', x, y + 0.35, 1, 0.15); rect('#bd965f', x, y + 0.6, 1, 0.14)
          } else if (t.decor === 'campfire') {
            rect('#705039', x + 0.15, y + 0.7, 0.7, 0.12); rect('#dca95f', x + 0.32, y + 0.42, 0.35, 0.3); rect('#f6dc8f', x + 0.43, y + 0.25 + Math.sin(state.minutes * 8) * 0.05, 0.13, 0.42)
          } else if (t.decor === 'relic' || t.decor === 'crate') {
            const found = state.discoveries[`${x},${y}`]
            rect('#584638', x + 0.13, y + 0.35, 0.74, 0.52); rect(found ? '#645647' : '#b68a52', x + 0.18, y + 0.4, 0.64, 0.4)
            rect('#dbbb78', x + 0.25, y + 0.36, 0.06, 0.47); rect('#dbbb78', x + 0.68, y + 0.36, 0.06, 0.47)
            if (!found) { rect('#f6d47d', x + 0.45, y + 0.55, 0.1, 0.12); label('✦', x + 0.5, y - 0.1 + Math.sin(state.minutes * 3) * 0.05, true) }
          } else sprite(ctx, 83, x, y)
        } })
      }
      const towns = nearbySettlements(camera.x, camera.y, state.seed, Math.max(width, height) / scale / 2 + 8)
      visibleBuildings = towns.flatMap(t => t.buildings).filter(b => b.x + b.width >= left && b.x <= right && b.y + b.height >= top && b.y <= bottom)
      for (const b of visibleBuildings) drawables.push({ depth: b.y + b.height - 0.1, draw: () => building(b, state.minutes) })
      // Travellers can be a full region away from home; stream their owning
      // settlements too so crossing a boundary doesn't make them disappear.
      const residentTowns = nearbySettlements(camera.x, camera.y, state.seed, Math.max(width, height) / scale / 2 + 72)
      // A resident hired onsite (see Employee.workMode) gets a second,
      // synthetic entry standing at their business instead -- suppress
      // their original procedural entry by id so the same named person
      // doesn't appear twice at once.
      const onsiteIds = new Set((state.businesses ?? []).flatMap(b => (b.employees ?? []).filter(e => e.workMode === 'onsite').map(e => e.id)))
      const hired = employeeResidents(state.seed, state.businesses ?? [])
      const experts = dynamicExpertResidents(state.seed, state.dynamicExperts ?? [])
      visibleResidents = [
        ...residentTowns.flatMap(t => getResidents(t, state.seed)).map(r => residentPosition(r, state.minutes, state.residentOverrides[r.id])).filter(p => p.visible && !onsiteIds.has(p.resident.id) && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom),
        ...hired.map(r => residentPosition(r, state.minutes, state.residentOverrides[r.id])).filter(p => p.visible && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom),
        ...experts.map(r => residentPosition(r, state.minutes, state.residentOverrides[r.id])).filter(p => p.visible && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom),
      ]
      visibleAnimals = towns.flatMap(t => getAnimals(t, state.seed)).map(a => animalPosition(a, state.minutes)).filter(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)
      for (const p of visibleAnimals) drawables.push({ depth: p.y + 0.81, draw: () => animal(p, state.reducedMotion ? 0 : state.minutes) })
      for (const p of visibleResidents) drawables.push({ depth: p.y + 0.85, draw: () => {
        ctx.fillStyle = '#24423733'; ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y + 0.86, 0.27, 0.1, 0, 0, Math.PI * 2); ctx.fill()
        // A defined resident can supply their own art per state (see
        // Resident.sprites); otherwise this is the normal code-drawn look.
        const customUrl = p.resident.sprites?.[p.action] ?? p.resident.sprites?.default
        const custom = customUrl ? customSprite(customUrl) : null
        if (custom) {
          const size = mediaSize(custom), h = 1.55, w = h * (size.width / size.height)
          ctx.drawImage(custom, p.x + 0.5 - w / 2, p.y + 0.92 - h, w, h)
        } else {
          drawResident(ctx, p.x, p.y, p.facing, state.minutes * 2400 + p.resident.sprite * 400, p.moving && !state.reducedMotion, p.resident.sprite)
          activity(p, state.reducedMotion ? 0 : state.minutes)
        }
        if (state.selected === p.resident.id) label(p.resident.name, p.x + 0.5, p.y - 0.65, true)
      } })
      drawables.push({ depth: avatar.y + 0.85, draw: () => {
        ctx.fillStyle = '#24423755'; ctx.beginPath(); ctx.ellipse(avatar.x + 0.5, avatar.y + 0.88, 0.28, 0.1, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#f4df9a'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.ellipse(avatar.x + 0.5, avatar.y + 0.87, 0.34, 0.14, 0, 0, Math.PI * 2); ctx.stroke()
        drawPlayer(ctx, avatar.x, avatar.y, state.playerFacing, state.now, moving && !state.reducedMotion)
      } })
      drawables.sort((a, b) => a.depth - b.depth).forEach(d => d.draw())
      // A business or rival that's claimed a real building (buildingId,
      // v0.23) shows its own name on that building instead of the
      // building's generic procedural one.
      const claimedLabels = new Map<string, string>()
      for (const b of state.businesses ?? []) if (b.buildingId) claimedLabels.set(b.buildingId, b.name)
      for (const r of state.rivalBusinesses ?? []) if (r.buildingId && !r.closed) claimedLabels.set(r.buildingId, r.name)
      if (state.labels) for (const b of visibleBuildings) if (b.kind !== 'home') label(claimedLabels.get(b.id) ?? b.label, b.x + b.width / 2, b.y - 0.45, !!b.poi)
      const minute = state.minutes % 1440
      const darkness = minute < 300 || minute > 1260 ? 0.38 : minute > 1080 ? (minute - 1080) / 180 * 0.38 : minute < 420 ? (420 - minute) / 120 * 0.38 : 0
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (darkness) { ctx.fillStyle = `rgba(19,32,64,${darkness})`; ctx.fillRect(0, 0, width, height) }
      drawMinimap(state.seed, state.player)
      return visibleResidents
    },
    pick(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect()
      const x = (clientX - rect.left - width / 2) / scale + camera.x + 0.5
      const y = (clientY - rect.top - height / 2) / scale + camera.y + 0.5
      const resident = visibleResidents.find(p => Math.abs(p.x + 0.5 - x) < 0.4 && Math.abs(p.y + 0.35 - y) < 0.6)
      const animal = visibleAnimals.find(p => Math.abs(p.x + 0.5 - x) < 0.35 && Math.abs(p.y + 0.5 - y) < 0.4)
      const building = visibleBuildings.find(b => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height)
      return { point: building?.door ?? { x: Math.floor(x), y: Math.floor(y) }, resident, animal }
    },
  }
}
