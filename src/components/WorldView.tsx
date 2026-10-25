import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { locationName, getTile, settlementAt, type Point } from '../world/generation'
import { findPath } from '../world/pathfinding'
import { createRenderer } from '../world/renderer'
import { residentPosition, residentForBuilding, type ResidentPosition, type ResidentOverride } from '../world/residents'
import type { AnimalPosition } from '../world/wildlife'
import { BIOMES, biomeAt } from '../world/regions'
import { worldInteraction } from '../world/interactions'
import { ResidentChat } from './ResidentChat'
import { CollectionJournal } from './CollectionJournal'
import { HomeInterior } from './HomeInterior'
import { ShopInterior } from './ShopInterior'
import { MiraPet } from './MiraPet'
import './world.css'

type WorldScreen = 'work' | 'ventures' | 'opportunities' | 'chronicle' | 'bank'
type Renderer = Awaited<ReturnType<typeof createRenderer>>
const DIRECTIONS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
}
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (!!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))

/** A pinned resident's home door, when they're currently indoors with an
 *  indoor activity described -- ambient (see ambientPinnedState in
 *  residents.ts) or from a live ResidentOverride from talking to them.
 *  Undefined for every other door, including a pinned resident's own door
 *  while they're out. Independent of the visible-people list, since an
 *  indoor resident is invisible on the map by design. */
function residentAtDoor(point: Point, seed: number, simMinutes: number, overrides: Record<string, ResidentOverride>): ResidentPosition | undefined {
  const town = settlementAt(point.x, point.y, seed)
  const building = town.buildings.find(b => b.door.x === point.x && b.door.y === point.y)
  if (!building) return undefined
  const resident = residentForBuilding(town, seed, building.id)
  if (!resident) return undefined
  const position = residentPosition(resident, simMinutes, overrides[resident.id])
  return !position.visible && position.description ? position : undefined
}

export function WorldView({ onNavigate }: { onNavigate: (screen: WorldScreen) => void }) {
  const playerX = useGameStore(s => s.playerX), playerY = useGameStore(s => s.playerY)
  const playerFacing = useGameStore(s => s.playerFacing)
  const seed = useGameStore(s => s.worldSeed), running = useGameStore(s => s.running)
  const discoveries = useGameStore(s => s.discoveries), rivals = useGameStore(s => s.rivalBusinesses)
  const inventory = useGameStore(s => s.inventory)
  const canvas = useRef<HTMLCanvasElement>(null), minimap = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<Renderer | null>(null), route = useRef<Point[]>([]), held = useRef<string[]>([])
  const lastStep = useRef(0), settings = useRef({ zoom: 1, labels: true, selected: null as string | null })
  const navigate = useRef(onNavigate); navigate.current = onNavigate
  const [zoom, setZoom] = useState(1), [labels, setLabels] = useState(true), [areaInfo, setAreaInfo] = useState(false)
  const [selected, setSelected] = useState<ResidentPosition | null>(null)
  const [talking, setTalking] = useState<ResidentPosition | null>(null), [journal, setJournal] = useState(false), [animal, setAnimal] = useState<AnimalPosition | null>(null)
  const [home, setHome] = useState<ResidentPosition | null>(null)
  const [shop, setShop] = useState<{ type: 'food' | 'book'; label: string } | null>(null)
  const overlay = useRef(false), selection = useRef<ResidentPosition | null>(null)
  const homeState = useRef<ResidentPosition | null>(null), talkingState = useRef<ResidentPosition | null>(null)
  // Lets the render effect (mounted once, see below) react immediately when
  // an overlay opens or closes, instead of finding out up to 200ms late.
  const overlayWatcher = useRef<(() => void) | null>(null)
  const wasOverlay = overlay.current
  overlay.current = !!talking || journal || areaInfo || !!home || !!shop; selection.current = selected
  // With only the chat open the map is still visible around it, so it keeps
  // being redrawn (at the slow overlay rate, see tickOverlay) -- otherwise a
  // resident who steps outside mid-chat stays invisible until it closes.
  const mapShowing = useRef(false); mapShowing.current = !!talking && !journal && !areaInfo && !home && !shop
  homeState.current = home; talkingState.current = talking
  if (wasOverlay !== overlay.current) overlayWatcher.current?.()
  const livePeople = useRef<ResidentPosition[]>([])
  const [people, setPeople] = useState<ResidentPosition[]>([])
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const simMinutes = useGameStore(s => s.simMinutesTotal)
  const residentOverrides = useGameStore(s => s.residentOverrides)
  const target = worldInteraction({ x: playerX, y: playerY }, people, seed, playerFacing, selected?.resident.id)
  const person = selected ?? (target?.kind === 'resident' ? target.person : null)
  const interaction = target?.kind === 'place' ? target : null
  const discovered = interaction && !!discoveries[`${interaction.point.x},${interaction.point.y}`]
  const insideNow = interaction ? residentAtDoor(interaction.point, seed, simMinutes, residentOverrides) : undefined
  settings.current = { zoom, labels, selected: person?.resident.id ?? null }

  function talkTo(person: ResidentPosition) {
    route.current = []; held.current = []; setAnimal(null); setAreaInfo(false)
    setTalking(overlay.current ? person : (livePeople.current.find(p => p.resident.id === person.resident.id) ?? person))
  }

  function interact() {
    const s = useGameStore.getState()
    const target = worldInteraction({ x: s.playerX, y: s.playerY }, livePeople.current, s.worldSeed, s.playerFacing, selection.current?.resident.id)
    if (target?.kind === 'resident') { talkTo(target.person); return }
    if (target?.kind === 'place') {
      const inside = residentAtDoor(target.point, s.worldSeed, s.simMinutesTotal, s.residentOverrides)
      if (inside) { setTalking(null); setAreaInfo(false); setHome(inside); return }
      if (target.poi.shop) { setTalking(null); setAreaInfo(false); setHome(null); setShop({ type: target.poi.shop, label: target.poi.label }); return }
    }
    if (target?.poi.screen) navigate.current(target.poi.screen as WorldScreen)
    else if (target) s.investigateHere()
    else setMessage('Walk near a neighbour and press E to talk.')
  }

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 4500)
    return () => clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    let disposed = false, frame = 0, overlayTimer = 0
    let anchor = performance.now(), lastMinute = useGameStore.getState().simMinutesTotal
    let wasRunning = useGameStore.getState().running, lastUi = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    createRenderer(canvas.current!, minimap.current!).then(render => {
      if (disposed) return
      renderer.current = render; setReady(true)
      // Whoever's on screen while the world is paused (see below) -- the chat
      // partner and/or the home we're looking inside -- should still show
      // their current action live, not whatever it was the instant the panel
      // opened. This is one resident's position, not the whole world, so a
      // slow plain interval (no rAF, no canvas) is plenty and costs nothing.
      const tickOverlay = () => {
        const state = useGameStore.getState()
        setTalking(old => old ? residentPosition(old.resident, state.simMinutesTotal, state.residentOverrides[old.resident.id]) : old)
        setHome(old => old ? residentPosition(old.resident, state.simMinutesTotal, state.residentOverrides[old.resident.id]) : old)
        if (mapShowing.current) draw(performance.now())
      }
      const draw = (now: number) => {
        try {
          const state = useGameStore.getState()
          if (state.simMinutesTotal !== lastMinute || state.running !== wasRunning) {
            lastMinute = state.simMinutesTotal; wasRunning = state.running; anchor = now
          }
          // Smooth between the existing one-second simulation ticks. Clamp when
          // the tab is suspended so the view cannot outrun the simulation clock.
          const minutes = lastMinute + (state.running ? Math.min(1000, now - anchor) / 1000 * 25 / 60 : 0)
          const visible = render.render({ seed: state.worldSeed, player: { x: state.playerX, y: state.playerY }, playerFacing: state.playerFacing, minutes, now, ...settings.current, route: route.current, reducedMotion, discoveries: state.discoveries, residentOverrides: state.residentOverrides, businesses: state.businesses, rivalBusinesses: state.rivalBusinesses, dynamicExperts: state.dynamicExperts })
          livePeople.current = visible
          if (now - lastUi > 150) {
            lastUi = now; setPeople(visible)
            setSelected(old => old ? visible.find(p => p.resident.id === old.resident.id) ?? null : null)
          }
        } catch (e) {
          // A draw error should never take the whole window down with it --
          // log it and keep the loop (and the app) alive.
          console.error('World render failed:', e)
        }
      }
      const loop = (now: number) => {
        // The world canvas is fully hidden behind HomeInterior/ResidentChat/
        // the journal/area-info panels while one is open. Rather than just
        // skipping the redraw, stop scheduling this loop entirely -- no rAF
        // callback at all -- and hand off to a slow plain interval instead, so
        // there is truly nothing per-frame running for a canvas nobody can
        // see. onOverlayChange() below restarts this loop once it closes.
        if (overlay.current) { frame = 0; if (!overlayTimer) overlayTimer = window.setInterval(tickOverlay, 200); return }
        draw(now)
        frame = requestAnimationFrame(loop)
      }
      // Whenever an overlay opens or closes, flip which of the two (rAF loop
      // vs plain interval) is actually running.
      const onOverlayChange = () => {
        if (overlay.current) {
          if (frame) { cancelAnimationFrame(frame); frame = 0 }
          if (!overlayTimer) overlayTimer = window.setInterval(tickOverlay, 200)
        } else {
          if (overlayTimer) { clearInterval(overlayTimer); overlayTimer = 0 }
          if (!frame) frame = requestAnimationFrame(loop)
        }
      }
      overlayWatcher.current = onOverlayChange
      frame = requestAnimationFrame(loop)
    }).catch(e => { if (!disposed) setError(String(e.message)) })
    return () => {
      disposed = true; overlayWatcher.current = null
      cancelAnimationFrame(frame); if (overlayTimer) clearInterval(overlayTimer)
      renderer.current = null; livePeople.current = []
    }
  }, [seed])

  useEffect(() => {
    const clear = () => { held.current = []; route.current = [] }
    const step = () => {
      const s = useGameStore.getState()
      if (s.assistantOpen || overlay.current || document.hidden) { clear(); return }
      const direction = DIRECTIONS[held.current[held.current.length - 1]]
      if (direction) { route.current = []; setSelected(null); setAnimal(null); s.movePlayer(direction.x, direction.y) }
      else if (route.current.length) {
        const next = route.current.shift()!
        if (Math.abs(next.x - s.playerX) + Math.abs(next.y - s.playerY) !== 1) { route.current = []; return }
        s.movePlayer(next.x - s.playerX, next.y - s.playerY)
        if (useGameStore.getState().playerX !== next.x || useGameStore.getState().playerY !== next.y) route.current = []
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.altKey || event.ctrlKey || event.metaKey || useGameStore.getState().assistantOpen) return
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === 'Escape') { clear(); setSelected(null); setTalking(null); setJournal(false); setAreaInfo(false); setAnimal(null); setHome(null); setShop(null); return }
      if (overlay.current) {
        // Inside a home, with no chat open yet, E still starts talking to
        // whoever's in there -- same shortcut as outdoors, just aimed at
        // the resident HomeInterior is showing rather than a nearby target.
        if (homeState.current && !talkingState.current && key === 'e') { event.preventDefault(); if (!event.repeat) talkTo(homeState.current) }
        return
      }
      if (key === 'e') { event.preventDefault(); if (!event.repeat) interact(); return }
      if (!DIRECTIONS[key]) return
      event.preventDefault()
      if (!held.current.includes(key)) held.current.push(key)
      if (!event.repeat && performance.now() - lastStep.current > 150) { lastStep.current = performance.now(); step() }
    }
    const onKeyUp = (event: KeyboardEvent) => { held.current = held.current.filter(k => k !== (event.key.length === 1 ? event.key.toLowerCase() : event.key)) }
    const id = window.setInterval(() => {
      if (!held.current.length && !route.current.length) return
      if (performance.now() - lastStep.current < 155) return
      lastStep.current = performance.now(); step()
    }, 25)
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear)
    return () => {
      clear(); clearInterval(id)
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear)
    }
  }, [])

  function walkTo(clientX: number, clientY: number) {
    if (overlay.current || useGameStore.getState().assistantOpen) return
    const pick = renderer.current?.pick(clientX, clientY)
    if (!pick) return
    if (pick.resident) { canvas.current?.focus({ preventScroll: true }); setSelected(pick.resident); setAnimal(null); return }
    if (pick.animal) { setAnimal(pick.animal); setSelected(null); return }
    setSelected(null)
    setAnimal(null)
    const s = useGameStore.getState()
    if (!getTile(pick.point.x, pick.point.y, s.worldSeed).walkable) { setMessage('Choose a path or open ground to walk there.'); return }
    const path = findPath({ x: s.playerX, y: s.playerY }, pick.point, s.worldSeed)
    if (!path.length) { setMessage('No walking route from here. Try a nearer point on the road.'); return }
    held.current = []; route.current = path.slice(1); setMessage('')
    canvas.current?.focus({ preventScroll: true })
  }

  const pad = (key: string, symbol: string, label: string) => <button key={key} type="button" aria-label={label}
    onPointerDown={e => { e.preventDefault(); if (overlay.current || useGameStore.getState().assistantOpen) return; e.currentTarget.setPointerCapture(e.pointerId); held.current = [key]; route.current = []; setSelected(null); setAnimal(null); const d = DIRECTIONS[key]; useGameStore.getState().movePlayer(d.x, d.y); lastStep.current = performance.now() }}
    onPointerUp={() => { held.current = [] }} onPointerCancel={() => { held.current = [] }} onLostPointerCapture={() => { held.current = [] }}
    onClick={e => { if (e.detail === 0 && !overlay.current && !useGameStore.getState().assistantOpen) { setSelected(null); setAnimal(null); const d = DIRECTIONS[key]; useGameStore.getState().movePlayer(d.x, d.y) } }}>{symbol}</button>

  return <section className="world-screen" aria-label="Open world">
    <div className="world-heading">
      <div><h1>{locationName(playerX, playerY, seed)} <span className={running ? 'live-tag' : 'live-tag paused'}>{running ? '● Living world' : 'Ⅱ Paused'}</span></h1></div>
      <div className="world-toolbar">
        <button className="mira-world-button" onClick={() => { setTalking(null); setJournal(false); setAreaInfo(false); useGameStore.getState().openAssistant() }}><MiraPet size={32} />Ask Mira</button>
        <button onClick={() => { setJournal(v => !v); setTalking(null); setAreaInfo(false); route.current = []; held.current = [] }}>Journal · {inventory.reduce((n, i) => n + i.quantity, 0)}</button>
        <button aria-expanded={areaInfo} aria-controls="world-area-info" onClick={() => { setAreaInfo(v => !v); setJournal(false); setTalking(null); route.current = []; held.current = [] }}>Around you</button>
        <button onClick={() => setLabels(v => !v)} aria-pressed={labels} title="Show or hide names above shops and landmark buildings">{labels ? 'Hide place names' : 'Show place names'}</button>
        <div className="zoom-control"><button aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom(z => Math.max(0.75, z - 0.25))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" disabled={zoom >= 1.5} onClick={() => setZoom(z => Math.min(1.5, z + 0.25))}>+</button></div>
      </div>
    </div>

    <div className="world-viewport">
      <canvas ref={canvas} className="world-canvas" tabIndex={0} aria-label="World map. Use arrow keys or WASD to walk, click a place to walk there, and E to talk to a nearby neighbour or interact with a place."
        onPointerUp={e => { if (e.button === 0) walkTo(e.clientX, e.clientY) }} />
      {!ready && <div className="world-loading" role="status">{error || 'Opening the gates…'}</div>}
      <div className="world-map-panel"><span>N ↑</span><canvas ref={minimap} aria-label="Map of nearby towns, roads and rivers" /><small>{playerX}, {playerY}</small></div>
      <div className="world-location-chip">✦ {Math.abs(playerX) <= 3 && Math.abs(playerY) <= 3 ? 'Town square' : locationName(playerX, playerY, seed)}<span>{BIOMES[biomeAt(playerX, playerY, seed)].name} · {people.length} neighbours nearby</span></div>
      {message && <div className="world-toast" role="status">{message}</div>}
      <div className="world-dpad"><span />{pad('ArrowUp', '↑', 'Walk north')}<span />{pad('ArrowLeft', '←', 'Walk west')}<button title="Return to town square" aria-label="Return to town square" onClick={() => { route.current = []; held.current = []; setSelected(null); useGameStore.getState().returnToTown() }}>⌂</button>{pad('ArrowRight', '→', 'Walk east')}<span />{pad('ArrowDown', '↓', 'Walk south')}<span /></div>
      {!talking && !journal && !areaInfo && !home && !shop && (person ? <div className="world-interaction" data-interaction="resident" aria-live="polite">{selected && <button className="world-close" aria-label="Close resident details" onClick={() => setSelected(null)}>×</button>}<small>{target?.kind === 'resident' && target.person.resident.id === person.resident.id ? 'NEARBY · PRESS E TO TALK' : 'A NEIGHBOUR'}</small><strong>{person.resident.name} <span>· {person.resident.role}</span></strong><p>{person.activity}</p><button className="world-enter" onClick={() => talkTo(person)}>Talk{target?.kind === 'resident' && target.person.resident.id === person.resident.id && <kbd>E</kbd>}</button></div>
        : animal ? <div className="world-interaction"><button className="world-close" aria-label="Close animal details" onClick={() => setAnimal(null)}>×</button><small>A LITTLE LOCAL</small><strong style={{ textTransform: 'capitalize' }}>{animal.animal.kind}</strong><p>{animal.activity}</p></div>
        : insideNow ? <div className="world-interaction" aria-live="polite"><small>COME ON IN</small><strong>{insideNow.resident.name}’s home</strong><p>{insideNow.activity}</p><button className="world-enter" onClick={() => setHome(insideNow)}>Look inside <kbd>E</kbd></button></div>
        : interaction && <div className="world-interaction" aria-live="polite"><small>{interaction.poi.screen || interaction.poi.shop ? 'COME ON IN' : discovered ? 'DISCOVERED' : 'A PLACE TO EXPLORE'}</small><strong>{interaction.poi.label}</strong>{discovered ? <p>{interaction.poi.item ? `${interaction.poi.item.name} is in your journal.` : interaction.poi.flavor}</p> : <button className="world-enter" onClick={interact}>{interaction.poi.screen || interaction.poi.shop ? 'Enter' : interaction.poi.item ? 'Explore & collect' : 'Look around'} <kbd>E</kbd></button>}</div>)}
      {home && <HomeInterior key={`home:${home.resident.id}`} person={home} crowded={!!talking} onClose={() => { setHome(null); setTalking(null); canvas.current?.focus({ preventScroll: true }) }} onTalk={() => talkTo(home)} />}
      {shop && <ShopInterior key={`shop:${shop.label}`} kind={shop.type} label={shop.label} onClose={() => { setShop(null); canvas.current?.focus({ preventScroll: true }) }} />}
      {talking && <ResidentChat key={`chat:${talking.resident.id}`} person={talking} onClose={() => { setTalking(null); canvas.current?.focus({ preventScroll: true }) }} onEnter={position => { setHome(position); setTalking(position) }} onExit={position => { setHome(null); setTalking(position) }} />}
      {areaInfo && <aside className="world-area-info" id="world-area-info" role="dialog" aria-label="Around you" onKeyDown={e => { if (e.key === 'Escape') { setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) } }}>
        <header><strong>Around you</strong><button autoFocus aria-label="Close area information" onClick={() => { setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) }}>×</button></header>
        <div className="world-notes">
      <div className="world-town-note"><p className="world-eyebrow">{BIOMES[biomeAt(playerX, playerY, seed)].name.toUpperCase()}</p><p>{BIOMES[biomeAt(playerX, playerY, seed)].description} Look for ruins west of town, and a camp and community harvest to the south.</p>{rivals.some(r => !r.closed) && <small>Open around the world: {rivals.filter(r => !r.closed).map(r => `${r.name} (${r.location})`).join(' · ')}</small>}</div>
      <div><p className="world-eyebrow">LIFE AROUND YOU</p><div className="world-activity">{people.slice(0, 8).map(p => <button key={p.resident.id} onClick={() => { setSelected(p); setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) }}><span className="activity-dot" /><span><strong>{p.resident.name}</strong><small>{p.activity}</small></span></button>)}{people.length === 0 && <p className="world-muted">{useGameStore.getState().hour < 6 || useGameStore.getState().hour >= 20 ? 'The neighbourhood is resting. People return in the morning.' : 'A quiet stretch. Follow the road to meet the neighbours.'}</p>}</div></div>
    </div></aside>}
      {journal && <CollectionJournal onClose={() => setJournal(false)} />}
    </div>

    <div className="world-footer"><p><kbd>WASD</kbd> / arrows Walk <span>·</span> Click to travel <span>·</span> <kbd>E</kbd> Talk / interact</p><span>{Object.keys(discoveries).length} places discovered</span></div>

  </section>
}
