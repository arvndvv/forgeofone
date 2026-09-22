import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { locationName, getTile, type Point } from '../world/generation'
import { findPath } from '../world/pathfinding'
import { createRenderer } from '../world/renderer'
import type { ResidentPosition } from '../world/residents'
import type { AnimalPosition } from '../world/wildlife'
import { BIOMES, biomeAt } from '../world/regions'
import { worldInteraction } from '../world/interactions'
import { ResidentChat } from './ResidentChat'
import { CollectionJournal } from './CollectionJournal'
import { MiraPet } from './MiraPet'
import './world.css'

type WorldScreen = 'work' | 'ventures' | 'opportunities' | 'chronicle'
type Renderer = Awaited<ReturnType<typeof createRenderer>>
const DIRECTIONS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
}
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (!!target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))

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
  const overlay = useRef(false), selection = useRef<ResidentPosition | null>(null)
  overlay.current = !!talking || journal || areaInfo; selection.current = selected
  const livePeople = useRef<ResidentPosition[]>([])
  const [people, setPeople] = useState<ResidentPosition[]>([])
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const target = worldInteraction({ x: playerX, y: playerY }, people, seed, playerFacing, selected?.resident.id)
  const person = selected ?? (target?.kind === 'resident' ? target.person : null)
  const interaction = target?.kind === 'place' ? target : null
  const discovered = interaction && !!discoveries[`${interaction.point.x},${interaction.point.y}`]
  settings.current = { zoom, labels, selected: person?.resident.id ?? null }

  function talkTo(person: ResidentPosition) {
    route.current = []; held.current = []; setAnimal(null); setAreaInfo(false)
    setTalking(livePeople.current.find(p => p.resident.id === person.resident.id) ?? person)
  }

  function interact() {
    const s = useGameStore.getState()
    const target = worldInteraction({ x: s.playerX, y: s.playerY }, livePeople.current, s.worldSeed, s.playerFacing, selection.current?.resident.id)
    if (target?.kind === 'resident') { talkTo(target.person); return }
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
    let disposed = false, frame = 0
    let anchor = performance.now(), lastMinute = useGameStore.getState().simMinutesTotal
    let wasRunning = useGameStore.getState().running, lastUi = 0
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    createRenderer(canvas.current!, minimap.current!).then(render => {
      if (disposed) return
      renderer.current = render; setReady(true)
      const loop = (now: number) => {
        const state = useGameStore.getState()
        if (state.simMinutesTotal !== lastMinute || state.running !== wasRunning) {
          lastMinute = state.simMinutesTotal; wasRunning = state.running; anchor = now
        }
        // Smooth between the existing one-second simulation ticks. Clamp when
        // the tab is suspended so the view cannot outrun the simulation clock.
        const minutes = lastMinute + (state.running ? Math.min(1000, now - anchor) / 1000 * 25 / 60 : 0)
        const visible = render.render({ seed: state.worldSeed, player: { x: state.playerX, y: state.playerY }, playerFacing: state.playerFacing, minutes, now, ...settings.current, route: route.current, reducedMotion, discoveries: state.discoveries })
        livePeople.current = visible
        if (now - lastUi > 150) {
          lastUi = now; setPeople(visible)
          setSelected(old => old ? visible.find(p => p.resident.id === old.resident.id) ?? null : null)
        }
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    }).catch(e => { if (!disposed) setError(String(e.message)) })
    return () => { disposed = true; cancelAnimationFrame(frame); renderer.current = null; livePeople.current = [] }
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
      if (key === 'Escape') { clear(); setSelected(null); setTalking(null); setJournal(false); setAreaInfo(false); setAnimal(null); return }
      if (overlay.current) return
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
      {!talking && !journal && !areaInfo && (person ? <div className="world-interaction" data-interaction="resident" aria-live="polite">{selected && <button className="world-close" aria-label="Close resident details" onClick={() => setSelected(null)}>×</button>}<small>{target?.kind === 'resident' && target.person.resident.id === person.resident.id ? 'NEARBY · PRESS E TO TALK' : 'A NEIGHBOUR'}</small><strong>{person.resident.name} <span>· {person.resident.role}</span></strong><p>{person.activity}</p><button className="world-enter" onClick={() => talkTo(person)}>Talk{target?.kind === 'resident' && target.person.resident.id === person.resident.id && <kbd>E</kbd>}</button></div>
        : animal ? <div className="world-interaction"><button className="world-close" aria-label="Close animal details" onClick={() => setAnimal(null)}>×</button><small>A LITTLE LOCAL</small><strong style={{ textTransform: 'capitalize' }}>{animal.animal.kind}</strong><p>{animal.activity}</p></div>
        : interaction && <div className="world-interaction" aria-live="polite"><small>{interaction.poi.screen ? 'COME ON IN' : discovered ? 'DISCOVERED' : 'A PLACE TO EXPLORE'}</small><strong>{interaction.poi.label}</strong>{discovered ? <p>{interaction.poi.item ? `${interaction.poi.item.name} is in your journal.` : interaction.poi.flavor}</p> : <button className="world-enter" onClick={interact}>{interaction.poi.screen ? 'Enter' : interaction.poi.item ? 'Explore & collect' : 'Look around'} <kbd>E</kbd></button>}</div>)}
      {talking && <ResidentChat key={talking.resident.id} person={talking} onClose={() => { setTalking(null); canvas.current?.focus({ preventScroll: true }) }} />}
      {areaInfo && <aside className="world-area-info" id="world-area-info" role="dialog" aria-label="Around you" onKeyDown={e => { if (e.key === 'Escape') { setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) } }}>
        <header><strong>Around you</strong><button autoFocus aria-label="Close area information" onClick={() => { setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) }}>×</button></header>
        <div className="world-notes">
      <div className="world-town-note"><p className="world-eyebrow">{BIOMES[biomeAt(playerX, playerY, seed)].name.toUpperCase()}</p><p>{BIOMES[biomeAt(playerX, playerY, seed)].description} Look for ruins west of town, and a camp and community harvest to the south.</p>{rivals.some(r => !r.closed) && <small>Open in the local economy: {rivals.filter(r => !r.closed).map(r => r.name).join(' · ')}</small>}</div>
      <div><p className="world-eyebrow">LIFE AROUND YOU</p><div className="world-activity">{people.slice(0, 8).map(p => <button key={p.resident.id} onClick={() => { setSelected(p); setAreaInfo(false); canvas.current?.focus({ preventScroll: true }) }}><span className="activity-dot" /><span><strong>{p.resident.name}</strong><small>{p.activity}</small></span></button>)}{people.length === 0 && <p className="world-muted">{useGameStore.getState().hour < 6 || useGameStore.getState().hour >= 20 ? 'The neighbourhood is resting. People return in the morning.' : 'A quiet stretch. Follow the road to meet the neighbours.'}</p>}</div></div>
    </div></aside>}
      {journal && <CollectionJournal onClose={() => setJournal(false)} />}
    </div>

    <div className="world-footer"><p><kbd>WASD</kbd> / arrows Walk <span>·</span> Click to travel <span>·</span> <kbd>E</kbd> Talk / interact</p><span>{Object.keys(discoveries).length} places discovered</span></div>

  </section>
}
