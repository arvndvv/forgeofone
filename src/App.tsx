import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  useGameStore, formatInr,
  OFFICE_RENT_STARTUP_COST, OFFICE_MONTHLY_RENT, LAND_BUILD_COST, BUILD_DAYS, MAX_EMPLOYEES_PER_BUSINESS,
  FOOD_CHEAP_COST, FOOD_CHEAP_RELIEF, FOOD_QUALITY_COST, FOOD_QUALITY_RELIEF, CRAVING_HEALTH_PENALTY_START,
  SAVINGS_DAILY_RATE, LOAN_INTEREST, LOAN_TERM_DAYS,
  technicalBonus, peopleBonus, resilienceFactor,
  listSaveSlots,
} from './store/gameStore'
import { listWorldTowns } from './world/generation'
import { FOOD_CATALOG } from './world/shopping'
import type { Challenge } from './types/game'
import { useLocalAI } from './services/localAI'
import { MiraWidget } from './components/MiraWidget'
import { PlayerPortrait } from './components/PlayerPortrait'
import { WorldView } from './components/WorldView'
import worldHubBg from './assets/game/world/world-hub-bg.png'
import iconCoin from './assets/game/ui/icon-coin.png'
import iconChest from './assets/game/ui/icon-chest.png'
import iconSignpost from './assets/game/ui/icon-signpost.png'
import iconHouse from './assets/game/ui/icon-house.png'
type Screen = 'landing' | 'login' | 'story' | 'home' | 'work' | 'ventures' | 'opportunities' | 'chronicle' | 'life' | 'bank' | 'dev'

// --- Reusable "carved wood & parchment" panel/button look. Solid colors only
// (no border-image) so it renders reliably and stays readable everywhere. ---
const panelStyle: CSSProperties = {
  backgroundColor: 'var(--parchment)',
  backgroundImage: 'linear-gradient(180deg, var(--parchment) 0%, var(--parchment-dark) 100%)',
  border: '4px solid var(--wood-dark)',
  boxShadow: 'inset 0 0 0 3px var(--wood-light), 0 6px 0 rgba(0,0,0,0.35)',
  borderRadius: '4px',
  color: 'var(--ink)',
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={panelStyle}>
      {children}
    </div>
  )
}

function GameButton({
  children,
  onClick,
  disabled,
  className = '',
  tone = 'wood',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  tone?: 'wood' | 'quiet'
}) {
  const base: CSSProperties =
    tone === 'wood'
      ? {
          backgroundColor: 'var(--wood-light)',
          backgroundImage: 'linear-gradient(180deg, var(--wood-light) 0%, var(--wood) 100%)',
          border: '3px solid var(--wood-dark)',
          boxShadow: '0 4px 0 rgba(0,0,0,0.4)',
          color: '#f7ecd3',
        }
      : {
          backgroundColor: '#2a2f2c',
          border: '3px solid #12140f',
          boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
          color: '#d8d2c0',
        }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={base}
      className={`font-title text-[11px] tracking-wide transition active:translate-y-[3px] active:shadow-none hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 ${className}`}
    >
      {children}
    </button>
  )
}

const inputStyle: CSSProperties = {
  colorScheme: 'light',
  backgroundColor: '#fbf3de',
  color: 'var(--ink)',
  border: '3px solid var(--wood)',
}

// --- Screen 1: Landing ------------------------------------------------------
function LandingScreen({ onPlay, playerName, onEnterWorld, onReset }: { onPlay: () => void; playerName: string | null; onEnterWorld: () => void; onReset: () => void }) {
  const [confirmingReset, setConfirmingReset] = useState(false)
  return (
    <div
      className="flex h-screen items-center justify-center px-6"
      style={{
        backgroundImage: `linear-gradient(rgba(6,12,9,0.8), rgba(6,12,9,0.92)), url(${worldHubBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Panel className="max-w-lg px-8 py-10 text-center">
        <p className="mb-4 text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--ink-soft)' }}>
          An open world for your working life
        </p>
        <h1 className="font-title mb-6 text-2xl leading-relaxed" style={{ color: 'var(--wood-dark)' }}>
          Forge of One
        </h1>
        {playerName ? (
          <>
            <p className="mb-8 text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              Welcome back, {playerName}. The world kept moving while you were away.
            </p>
            <GameButton onClick={onEnterWorld} className="w-full px-8 py-3">
              Enter world
            </GameButton>
            {confirmingReset ? (
              <div className="mt-4 rounded-sm px-3 py-3" style={{ backgroundColor: 'rgba(0,0,0,0.15)', border: '2px solid var(--wood)' }}>
                <p className="mb-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  This wipes {playerName}'s money, businesses, quests, and history for good. Start over?
                </p>
                <div className="flex gap-2">
                  <GameButton tone="quiet" onClick={() => setConfirmingReset(false)} className="flex-1 py-2 text-[9px]">
                    Cancel
                  </GameButton>
                  <GameButton onClick={onReset} className="flex-1 py-2 text-[9px]">
                    Yes, start over
                  </GameButton>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingReset(true)}
                className="mt-4 text-xs underline"
                style={{ color: 'var(--ink-soft)' }}
              >
                Start over with a new life
              </button>
            )}
          </>
        ) : (
          <>
            <p className="mb-8 text-base leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              No script to follow. You start with nothing but a working pair of hands and a world
              that keeps moving whether you chase it or not.
            </p>
            <GameButton onClick={onPlay} className="px-8 py-3">
              Play
            </GameButton>
          </>
        )}
      </Panel>
    </div>
  )
}

// --- Screen 2: Login / character creation -----------------------------------
function LoginScreen({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState('')

  return (
    <div className="flex h-screen items-center justify-center px-6" style={{ backgroundColor: '#0d1210' }}>
      <Panel className="w-96 px-8 py-8">
        <h1 className="font-title mb-4 text-base leading-relaxed" style={{ color: 'var(--wood-dark)' }}>
          Who are you?
        </h1>
        <p className="mb-6 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          Enter your name. You'll wake up on day one with nothing saved and a full day ahead of you.
        </p>
        <input
          className="mb-4 w-full rounded-sm px-3 py-2.5 text-base outline-none"
          style={inputStyle}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onEnter(name.trim())
          }}
        />
        <GameButton onClick={() => onEnter(name.trim())} disabled={!name.trim()} className="w-full py-3">
          Enter the world
        </GameButton>
      </Panel>
    </div>
  )
}

// --- Screen 3: Story interstitial -- short beats, not walls of text --------
function storySteps(name: string): string[] {
  return [
    `The bus drops you at the edge of town before sunrise, ${name}.`,
    "No job lined up yet. No business. Just what you know, and the hours in the day.",
    "Down the road there's a desk waiting for whoever shows up for it.",
    "There's a board too, where the town pins up work it needs done.",
    "And empty plots, where something could stand one day -- if you save enough, and don't spread yourself too thin getting there.",
    "You won't be figuring it out alone. Mira can see everything going on in your world, and she's a tap away on any screen.",
    "Nobody's going to tell you which of those to chase first. That part's yours.",
  ]
}

function StoryScreen({ name, onContinue }: { name: string; onContinue: () => void }) {
  const steps = storySteps(name)
  const [i, setI] = useState(0)
  const last = i === steps.length - 1

  return (
    <div className="flex h-screen items-center justify-center px-6" style={{ backgroundColor: '#0d1210' }}>
      <Panel className="w-full max-w-xl px-8 py-9">
        <p className="mb-5 text-[10px] uppercase tracking-[0.25em]" style={{ color: 'var(--ink-soft)' }}>
          Day One &middot; {i + 1} / {steps.length}
        </p>
        <p className="mb-8 text-lg leading-relaxed" style={{ color: 'var(--ink)', minHeight: '4.5rem' }}>
          {steps[i]}
        </p>
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {steps.map((_, dot) => (
            <span
              key={dot}
              className="h-1.5 w-5 rounded-full"
              style={{ backgroundColor: dot <= i ? 'var(--wood)' : 'var(--parchment-dark)' }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {i > 0 && (
            <GameButton tone="quiet" onClick={() => setI((v) => v - 1)} className="px-4 py-3">
              Back
            </GameButton>
          )}
          <GameButton onClick={() => (last ? onContinue() : setI((v) => v + 1))} className="flex-1 py-3">
            {last ? 'Walk into town' : 'Continue'}
          </GameButton>
        </div>
      </Panel>
    </div>
  )
}

// --- Quest / objective banner, shown on every in-world screen ---------------
// v0.26: also carries a queued lesson, when the story or a task has
// actually earned one -- direct feedback on v0.25 was that a standalone
// "Learn now" button read as a grind disconnected from playing, and that
// its "thinnest skill" label didn't even match what fired. Fixed by
// retiring the button/random-roll entirely: a lesson only ever shows up
// here because something real just happened (see LESSON_QUESTS,
// _checkStoryBeats), framed as a line of dialogue, and it's always in the
// domain it says it is -- see _queueLesson in gameStore.ts.
function QuestBanner({ onAskMira }: { onAskMira: () => void }) {
  const quest = useGameStore((s) => s.activeQuest())
  const queuedLesson = useGameStore((s) => s.queuedLesson)
  const acceptQueuedLesson = useGameStore((s) => s.acceptQueuedLesson)
  const dismissQueuedLesson = useGameStore((s) => s.dismissQueuedLesson)
  // v0.24: defaults open, not collapsed -- "standing in town, don't know
  // what to do" was the actual complaint that prompted this round, and a
  // collapsed banner requiring a tap was part of why the existing hint
  // wasn't landing. Still collapsible for anyone who'd rather it stay out
  // of the way once they know what they're doing.
  const [expanded, setExpanded] = useState(true)

  const lessonRow = queuedLesson && (
    <div
      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs"
      style={{ backgroundColor: '#20261b', border: '1px solid var(--wood)', color: '#c9c3ae' }}
    >
      <span>{queuedLesson.intro}</span>
      <span className="flex shrink-0 gap-2">
        <GameButton tone="wood" onClick={() => acceptQueuedLesson()} className="px-3 py-1.5 text-[10px]">
          Take it on
        </GameButton>
        <button
          onClick={() => dismissQueuedLesson()}
          className="text-[10px] underline"
          style={{ color: '#9c9686' }}
        >
          Not now
        </button>
      </span>
    </div>
  )

  if (!quest) {
    return (
      <div className="quest-banner mx-auto max-w-5xl px-4 pt-3">
        <div className="rounded-sm px-4 py-2 text-center text-sm" style={{ backgroundColor: '#1f2a1c', border: '2px solid var(--wood)', color: '#a9d9b4' }}>
          All the objectives Mira had queued up are done -- the town keeps generating its own opportunities. You're on your own steam now.
        </div>
        {lessonRow}
      </div>
    )
  }

  return (
    <div className="quest-banner mx-auto max-w-5xl px-4 pt-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="block w-full rounded-sm px-4 py-2 text-left text-sm transition hover:brightness-110"
        style={{ backgroundColor: '#26301f', border: '2px solid var(--wood-light)', color: '#f2e8d0' }}
      >
        <span className="font-title text-[10px] tracking-wide" style={{ color: '#e8c468' }}>Objective &middot; </span>
        {quest.title}
        <span className="ml-2 text-xs" style={{ color: '#9c9686' }}>{expanded ? '(hide)' : '(tap for hint)'}</span>
        {expanded && (
          <span className="mt-1 block text-sm" style={{ color: '#c9c3ae' }}>
            {quest.description} {quest.hint}{' '}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAskMira()
              }}
              className="underline"
              style={{ color: '#8fd19e' }}
            >
              Ask Mira about it
            </button>
          </span>
        )}
      </button>
      {lessonRow}
    </div>
  )
}

// --- Persistent HUD shown on every in-world screen --------------------------
function Hud({ screen, onNavigate, onExit }: { screen: Screen; onNavigate: (s: Screen) => void; onExit: () => void }) {
  const state = useGameStore()

  return (
    <header
      className="game-hud flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
      style={{ backgroundColor: '#181c16', borderBottom: '4px solid var(--wood-dark)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-title flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm"
          style={{
            backgroundColor: 'var(--wood)',
            border: '3px solid var(--wood-dark)',
            color: '#f7ecd3',
          }}
        >
          <PlayerPortrait />
        </span>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#f2e8d0' }}>
            {state.playerName}
          </p>
          <p className="text-xs" style={{ color: '#9c9686' }}>
            Day {state.day} &middot; {String(state.hour).padStart(2, '0')}:{String(state.minute).padStart(2, '0')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <img src={iconCoin} alt="" className="h-5 w-5" style={{ imageRendering: 'pixelated' }} />
          <span style={{ color: state.money < 0 ? '#f28b82' : '#e8c468' }}>{formatInr(state.money)}</span>
        </div>
        <span style={{ color: state.health < 40 ? '#f28b82' : '#8fd19e' }}>Health {state.health.toFixed(0)}%</span>
        <span style={{ color: state.craving >= CRAVING_HEALTH_PENALTY_START ? '#f28b82' : '#9c9686' }}>Hunger {state.craving.toFixed(0)}%</span>
        <span style={{ color: state.focus < 40 ? '#f28b82' : '#9c9686' }}>Focus {state.focus.toFixed(0)}%</span>
        <span style={{ color: '#9c9686' }}>Efficiency {(state.efficiency() * 100).toFixed(0)}%</span>
      </div>

      <div className="flex items-center gap-2">
        {screen !== 'home' && (
          <GameButton tone="quiet" onClick={() => onNavigate('home')} className="px-3 py-1.5 text-[9px]">
            World map
          </GameButton>
        )}
        <GameButton
          tone="quiet"
          onClick={() => (state.running ? state.stopClock() : state.startClock())}
          className="px-3 py-1.5 text-[9px]"
        >
          {state.running ? 'Pause' : 'Resume'}
        </GameButton>
        <GameButton tone="quiet" onClick={onExit} className="px-3 py-1.5 text-[9px]">
          Exit world
        </GameButton>
      </div>
    </header>
  )
}

// --- Quick tab bar for jumping between areas without hunting hotspots -------
const TAB_DEFS: Array<{ id: Screen; label: string }> = [
  { id: 'home', label: 'World' },
  { id: 'work', label: 'Dev Desk' },
  { id: 'ventures', label: 'Ventures' },
  { id: 'opportunities', label: 'Job Board' },
  { id: 'life', label: 'Life & Home' },
  { id: 'chronicle', label: 'Records' },
  { id: 'dev', label: 'Dev Tools' },
]

function TabBar({ screen, onNavigate }: { screen: Screen; onNavigate: (s: Screen) => void }) {
  return (
    <nav className="game-tabs flex gap-1 overflow-x-auto px-4 py-2" style={{ backgroundColor: '#12150f', borderBottom: '3px solid var(--wood-dark)' }}>
      {TAB_DEFS.map((t) => {
        const active = screen === t.id
        return (
          <button
            key={t.id}
            onClick={() => onNavigate(t.id)}
            className="font-title shrink-0 rounded-sm px-3 py-1.5 text-[10px] tracking-wide transition"
            style={
              active
                ? { backgroundColor: 'var(--wood)', color: '#f7ecd3', border: '2px solid var(--wood-dark)' }
                : { backgroundColor: 'transparent', color: '#8a8474', border: '2px solid transparent' }
            }
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}

// --- Screen 5: Work -----------------------------------------------------------
// v0.24: pulled out of WorkScreen and reused on OpportunitiesScreen too --
// accepting a freelance gig used to make it visually vanish (it just left
// the Job Board's list), with no indication anywhere on that screen of
// where it went. It was always tracked (`activeGigs`) and shown on the Dev
// Desk, but nothing pointed a player there, so it read as a bug instead of
// "go check the Dev Desk." Showing the same panel right on the Job Board
// answers "where did it go" without having to leave the screen.
function ActiveGigsPanel() {
  const activeGigs = useGameStore((s) => s.activeGigs)
  return (
    <Panel className="px-5 py-4">
      <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Freelance gigs in progress ({activeGigs.length})</p>
      {activeGigs.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>None running right now -- accept one from the Job Board.</p>}
      <div className="space-y-1.5">
        {activeGigs.map((g) => (
          <div key={g.id} className="rounded px-3 py-2 text-sm" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
            {g.title}{g.employer ? ` -- for ${g.employer}` : ''} &middot; {g.daysRemaining} day(s) left &middot; {formatInr(g.payout)} on completion
          </div>
        ))}
      </div>
    </Panel>
  )
}

function WorkScreen() {
  const state = useGameStore()
  const completeQuest = useGameStore((s) => s._completeQuest)
  // v0.24: "Get Your Bearings"' hint says "Open the Dev Desk" -- this is
  // that step actually happening, instead of the quest ticking itself off
  // at character creation before the player had done anything.
  useEffect(() => { completeQuest('first-day') }, [completeQuest])
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>Dev Desk</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>Your steady work, and whatever freelance you've taken on top of it.</p>

      <Panel className="mb-4 px-5 py-4">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Day job</p>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{state.devJobActive ? 'Currently working' : 'Not working right now'}</p>
          </div>
          <GameButton onClick={() => state.toggleDevJob()} className="px-4 py-2.5 shrink-0">
            {state.devJobActive ? 'Step away' : 'Take it back on'}
          </GameButton>
        </div>
      </Panel>

      <ActiveGigsPanel />
    </div>
  )
}

// --- Screen 6: Ventures --------------------------------------------------------
function VenturesScreen() {
  const state = useGameStore()
  const seed = useGameStore((s) => s.worldSeed)
  const [bizName, setBizName] = useState('')
  const [premises, setPremises] = useState<'rented' | 'owned'>('rented')
  const towns = listWorldTowns(seed)
  const [location, setLocation] = useState(towns[0]?.name ?? '')
  const cost = premises === 'rented' ? OFFICE_RENT_STARTUP_COST : LAND_BUILD_COST
  const canAfford = state.money >= cost

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <img src={iconChest} alt="" className="h-6 w-6" style={{ imageRendering: 'pixelated' }} />
        <h1 className="font-title text-sm" style={{ color: '#f2e8d0' }}>Your Ventures</h1>
      </div>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>Businesses you've founded, spread across the world. No limit on how many -- just on how much attention you have.</p>

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Founded so far ({state.businesses.length})</p>
        {state.businesses.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>None yet.</p>}
        <div className="space-y-1.5">
          {state.businesses.map((b) => {
            const building = b.premises === 'owned' && (b.buildDaysRemaining ?? 0) > 0
            const employees = b.employees ?? []
            const applicants = b.applicants ?? []
            return (
              <div key={b.id} className="rounded px-3 py-2 text-sm" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
                <div className="flex items-center gap-2">
                  <img src={iconHouse} alt="" className="h-5 w-5" style={{ imageRendering: 'pixelated' }} />
                  <span>
                    {b.name} &middot; {b.location} &middot; founded day {b.foundedOnDay}
                    {b.premises === 'owned'
                      ? building
                        ? <span style={{ color: '#c9a24a' }}> &middot; building, {b.buildDaysRemaining} day{b.buildDaysRemaining === 1 ? '' : 's'} left</span>
                        : <span style={{ color: '#6b7d5a' }}> &middot; owned outright</span>
                      : <span style={{ color: '#9c9686' }}> &middot; renting, {formatInr(OFFICE_MONTHLY_RENT)}/mo</span>}
                  </span>
                </div>

                {employees.length > 0 && (
                  <div className="mt-2 space-y-1 pl-7">
                    {employees.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <span>{e.name} &middot; {e.role} &middot; {formatInr(e.dailyWage)}/day, +{formatInr(e.dailyRevenueBonus)}/day revenue &middot; {e.workMode === 'onsite' ? `onsite at ${b.name}` : 'remote'}</span>
                        <GameButton tone="quiet" onClick={() => state.fireEmployee(b.id, e.id)} className="px-2 py-1 text-[11px]">
                          Let go
                        </GameButton>
                      </div>
                    ))}
                  </div>
                )}

                {applicants.length > 0 && (
                  <div className="mt-2 space-y-1 pl-7">
                    <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Interested</p>
                    {applicants.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        <span>{a.name} &middot; {a.role} &middot; interested in {a.interest}</span>
                        <div className="flex gap-1">
                          <GameButton onClick={() => state.hireApplicant(b.id, a.id, 'onsite')} className="px-2 py-1 text-[11px]">Hire onsite</GameButton>
                          <GameButton onClick={() => state.hireApplicant(b.id, a.id, 'remote')} className="px-2 py-1 text-[11px]">Hire remote</GameButton>
                          <GameButton tone="quiet" onClick={() => state.declineApplicant(b.id, a.id)} className="px-2 py-1 text-[11px]">Pass</GameButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-2 pl-7">
                  <GameButton
                    tone="quiet"
                    disabled={employees.length >= MAX_EMPLOYEES_PER_BUSINESS}
                    onClick={() => state.postOpening(b.id)}
                    className="px-2 py-1 text-[11px]"
                  >
                    {employees.length >= MAX_EMPLOYEES_PER_BUSINESS ? 'Staff full' : applicants.length > 0 ? 'Post again' : 'Post an opening'}
                  </GameButton>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel className="px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Found a new one</p>

        <p className="mb-1.5 text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Premises</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPremises('rented')}
            className="rounded-sm px-3 py-2.5 text-left text-sm"
            style={{
              backgroundColor: premises === 'rented' ? 'var(--wood-light)' : 'var(--parchment-dark)',
              border: `2px solid ${premises === 'rented' ? 'var(--wood-dark)' : 'var(--wood)'}`,
              color: 'var(--ink)',
            }}
          >
            <span className="font-semibold">Rent an office</span>
            <br />
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{formatInr(OFFICE_RENT_STARTUP_COST)} upfront, {formatInr(OFFICE_MONTHLY_RENT)}/mo after &middot; open immediately</span>
          </button>
          <button
            type="button"
            onClick={() => setPremises('owned')}
            className="rounded-sm px-3 py-2.5 text-left text-sm"
            style={{
              backgroundColor: premises === 'owned' ? 'var(--wood-light)' : 'var(--parchment-dark)',
              border: `2px solid ${premises === 'owned' ? 'var(--wood-dark)' : 'var(--wood)'}`,
              color: 'var(--ink)',
            }}
          >
            <span className="font-semibold">Buy land &amp; build</span>
            <br />
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{formatInr(LAND_BUILD_COST)} upfront, no rent &middot; {BUILD_DAYS} days to build</span>
          </button>
        </div>

        <p className="mb-1.5 text-xs uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>Location</p>
        <select
          className="mb-3 w-full rounded-sm px-3 py-2 text-sm outline-none"
          style={inputStyle}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        >
          {towns.map((t) => (
            <option key={t.id} value={t.name}>{t.name}{t.id === '0,0' ? ' (home town)' : ''}</option>
          ))}
        </select>

        <p className="mb-2 text-xs" style={{ color: canAfford ? 'var(--ink-soft)' : '#a5453b' }}>
          {canAfford ? `Costs ${formatInr(cost)}.` : `Costs ${formatInr(cost)} -- you have ${formatInr(state.money)}.`}
        </p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-sm px-3 py-2 text-sm outline-none"
            style={inputStyle}
            placeholder="Name your business"
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
          />
          <GameButton
            disabled={!bizName.trim() || !location || !canAfford}
            onClick={() => {
              state.startBusiness(bizName.trim(), premises, location)
              setBizName('')
            }}
            className="px-4 py-2.5 shrink-0"
          >
            Found
          </GameButton>
        </div>
      </Panel>
    </div>
  )
}

// --- Screen 7: Opportunities ----------------------------------------------------
function OpportunitiesScreen() {
  const state = useGameStore()
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <img src={iconSignpost} alt="" className="h-6 w-6" style={{ imageRendering: 'pixelated' }} />
        <h1 className="font-title text-sm" style={{ color: '#f2e8d0' }}>The Job Board</h1>
      </div>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>What the world's offering right now. New postings show up on their own.</p>

      {state.opportunities.length === 0 && (
        <Panel className="px-5 py-4">
          <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing pinned up right now. Check back tomorrow.</p>
        </Panel>
      )}

      <div className="space-y-3">
        {state.opportunities.map((o) => (
          <Panel key={o.id} className="px-5 py-4">
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>{o.title}{o.aiGenerated && <span className="ml-2 rounded-sm px-1.5 py-0.5 text-[8px] uppercase tracking-wide" style={{ backgroundColor: 'var(--parchment-dark)', color: '#6b7d5a' }}>AI</span>}</p>
            {o.kind === 'job' && o.employer && (
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Hiring: {o.employer}, {o.location}{o.contact ? ` -- reports to ${o.contact}` : ''}</p>
            )}
            {o.kind === 'freelance' && o.employer && (
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Client: {o.employer}, {o.location}</p>
            )}
            {o.kind === 'business' && o.location && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Based in {o.location}</p>}
            {o.payout > 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Payout: {formatInr(o.payout)}</p>}
            <div className="mt-3 flex gap-2">
              <GameButton onClick={() => state.acceptOpportunity(o.id)} className="px-3 py-2">
                Accept
              </GameButton>
              <GameButton tone="quiet" onClick={() => state.declineOpportunity(o.id)} className="px-3 py-2">
                Decline
              </GameButton>
            </div>
          </Panel>
        ))}
      </div>

      {state.activeGigs.length > 0 && (
        <div className="mt-4">
          <ActiveGigsPanel />
        </div>
      )}
    </div>
  )
}

// --- Screen: Life & Home -- hunger/food, the pantry, the library, and focus.
// The bank itself moved to a separate, physical-only BankScreen (below) --
// per the locked design, cash-in-hand and stored personal items stay
// reachable from home/tab, but the bank teller service is walk-in only. ---
function LifeScreen() {
  const state = useGameStore()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>Life &amp; Home</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>The everyday upkeep behind the career and the businesses. Banking is done in person, at The Bank in town.</p>

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Hunger -- {state.craving.toFixed(0)}%</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Climbs a little every day. Past {CRAVING_HEALTH_PENALTY_START}% it starts costing health on its own.</p>
        <div className="flex gap-2">
          <GameButton tone="quiet" onClick={() => state.eat('cheap')} disabled={state.money < FOOD_CHEAP_COST} className="flex-1 px-3 py-2.5 text-left">
            Quick, cheap bite<br /><span className="text-[9px]" style={{ color: '#8a8474' }}>{formatInr(FOOD_CHEAP_COST)} &middot; -{FOOD_CHEAP_RELIEF} hunger</span>
          </GameButton>
          <GameButton onClick={() => state.eat('quality')} disabled={state.money < FOOD_QUALITY_COST} className="flex-1 px-3 py-2.5 text-left">
            Proper meal<br /><span className="text-[9px]" style={{ color: '#f7ecd3' }}>{formatInr(FOOD_QUALITY_COST)} &middot; -{FOOD_QUALITY_RELIEF} hunger, +health</span>
          </GameButton>
        </div>
      </Panel>

      {state.inventory.some(i => i.category === 'food') && (
        <Panel className="mb-4 px-5 py-4">
          <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Pantry</p>
          <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Food bought at a shop and brought home -- eat it any time, no extra cost.</p>
          <div className="flex flex-col gap-2">
            {state.inventory.filter(i => i.category === 'food').map(i => {
              const food = FOOD_CATALOG.find(f => f.id === i.id)
              return (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-sm px-3 py-2" style={{ backgroundColor: 'var(--parchment-dark)' }}>
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>{i.name} <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>&times;{i.quantity}</span></span>
                  <GameButton tone="quiet" onClick={() => state.eatStored(i.id)} className="px-3 py-1.5 text-xs">
                    Eat{food ? ` (-${food.relief} hunger${food.healthBonus ? ', +health' : ''})` : ''}
                  </GameButton>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Library</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Books bought from the bookshop. Reading one jots down a quote or note below its title.</p>
        {state.library.length === 0 && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Nothing on the shelf yet -- visit a Bookshop in town.</p>}
        <div className="flex flex-col gap-2">
          {state.library.map(book => (
            <div key={book.id} className="rounded-sm px-3 py-2" style={{ backgroundColor: 'var(--parchment-dark)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{book.title}</span>
                <GameButton tone="quiet" disabled={state._readingBookId === book.id} onClick={() => state.readBook(book.id)} className="px-3 py-1.5 text-xs">
                  {state._readingBookId === book.id ? 'Reading…' : 'Read'}
                </GameButton>
              </div>
              {book.notes.map((note, i) => (
                <p key={i} className="mt-1 text-xs italic" style={{ color: 'var(--ink-soft)' }}>&ldquo;{note}&rdquo;</p>
              ))}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="px-5 py-4">
        <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Focus -- {state.focus.toFixed(0)}%</p>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>Every active commitment (job, gigs, businesses) drains a bit of this each day. It recovers on its own when you ease off, and low focus scales your earnings down further, on top of juggling too much.</p>
      </Panel>
    </div>
  )
}

// --- Screen: The Bank -- reached only by walking to its building in the
// World and pressing E (see world/generation.ts's CORE_LANDMARKS and
// WorldView.tsx's screen-navigation handling). Unlike every other screen,
// this one is deliberately NOT in the quick tab bar -- taking or checking a
// loan is meant to be a physical errand, not a menu reachable from
// anywhere. Savings interest keeps accruing automatically regardless of
// whether the player ever visits; only the teller service itself is gated. ---
function BankScreen() {
  const state = useGameStore()
  const [loanAmount, setLoanAmount] = useState('')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>The Bank</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>You have {formatInr(state.money)} in hand. A positive balance earns {(SAVINGS_DAILY_RATE * 100).toFixed(2)}% interest a day, automatically, whether you visit or not.</p>

      <Panel className="px-5 py-4">
        <p className="mb-1 font-semibold" style={{ color: 'var(--ink)' }}>Loans</p>
        {state.bankLoan ? (
          <div className="rounded px-3 py-2 text-sm" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
            Outstanding loan: {formatInr(state.bankLoan.principal)} total &middot; {formatInr(state.bankLoan.dailyPayment)}/day for {state.bankLoan.daysRemaining} more day{state.bankLoan.daysRemaining === 1 ? '' : 's'}.
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Borrow against the future: {(LOAN_INTEREST * 100).toFixed(0)}% interest up front, repaid automatically over {LOAN_TERM_DAYS} days.</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-sm px-3 py-2 text-sm outline-none"
                style={inputStyle}
                type="number"
                min={1}
                placeholder="Amount to borrow"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
              />
              <GameButton
                disabled={!Number(loanAmount) || Number(loanAmount) <= 0}
                onClick={() => {
                  state.takeLoan(Math.round(Number(loanAmount)))
                  setLoanAmount('')
                }}
                className="px-4 py-2.5 shrink-0"
              >
                Borrow
              </GameButton>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}

// --- A slim, dismissible nag recommending a connected local model --
// learning content and the job market are meaningfully better with one,
// but the game is fully playable without it (this never blocks anything). ---
function AIConnectBanner() {
  const ai = useLocalAI()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('forge-ai-banner-dismissed') === '1' } catch { return false }
  })
  const ready = ai.mode === 'ollama' && !!ai.model
  if (ready || dismissed) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-2xl items-center gap-3 rounded-sm px-4 py-3 text-sm" style={{ backgroundColor: '#1f2a1c', border: '2px solid var(--wood)', color: '#e8dfc7' }}>
        <span className="flex-1">
          Connect a local AI model (via Mira's settings, the gear icon) for endlessly varied challenges and job postings tailored to how you actually play. Not required -- everything still works without it -- but recommended.
        </span>
        <GameButton tone="quiet" onClick={() => useGameStore.getState().openAssistant()} className="px-3 py-2 shrink-0 text-[9px]">
          Open Mira
        </GameButton>
        <button
          aria-label="Dismiss AI recommendation"
          className="shrink-0 text-lg leading-none"
          style={{ color: '#9c9686' }}
          onClick={() => {
            setDismissed(true)
            try { localStorage.setItem('forge-ai-banner-dismissed', '1') } catch { /* still dismisses for this session */ }
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

// --- A "situation" -- the learning-by-playing challenge modal, shown over
// whatever screen is up whenever the store has one pending. ---
// A situation reads as coming from a real place -- work, your own business,
// or ordinary life -- rather than an unlabeled quiz box.
const SOURCE_LABEL: Record<Challenge['source'], string> = { dev: 'At work', business: 'At your business', life: 'Everyday life' }

function ChallengeModal() {
  const challenge = useGameStore((s) => s.pendingChallenge)
  const resolveChallenge = useGameStore((s) => s.resolveChallenge)
  const requestJudgment = useGameStore((s) => s.requestJudgment)
  const judgment = useGameStore((s) => s.judgment)
  const judgeLoading = useGameStore((s) => s._judgeLoading)
  const preferFreeText = useGameStore((s) => s.preferFreeTextChallenges)
  const freeTextOptionIndex = useGameStore((s) => s.freeTextOptionIndex)
  const freeTextAnswer = useGameStore((s) => s.freeTextAnswer)
  const gradeFreeTextAnswer = useGameStore((s) => s.gradeFreeTextAnswer)
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)
  // Which way this challenge is being answered -- picking from the 3
  // presets, or typing a free-text answer instead. Defaults from the
  // player's global setting (Mira's settings panel) but is changeable for
  // THIS challenge specifically, per the locked design.
  const [mode, setMode] = useState<'options' | 'freeText'>(preferFreeText ? 'freeText' : 'options')
  const [draft, setDraft] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const lastChallengeId = useRef<string | null>(null)
  if (challenge && challenge.id !== lastChallengeId.current) {
    lastChallengeId.current = challenge.id
    // A fresh challenge arrived -- reset per-challenge UI state so it opens
    // clean, on the player's current global default.
    if (mode !== (preferFreeText ? 'freeText' : 'options')) setMode(preferFreeText ? 'freeText' : 'options')
    if (pickedIndex !== null) setPickedIndex(null)
    if (draft) setDraft('')
    if (submitted) setSubmitted(false)
  }

  if (!challenge) return null
  const picked = pickedIndex !== null ? challenge.options[pickedIndex] : null
  const freeTextPicked = freeTextOptionIndex !== null ? challenge.options[freeTextOptionIndex] : null
  const eyebrow = <p className="mb-1 text-[9px] uppercase tracking-[0.2em]" style={{ color: 'var(--ink-soft)' }}>{SOURCE_LABEL[challenge.source]} · {challenge.domain.replace('-', ' ')}{challenge.difficulty === 'big' && ' · big one'}{challenge.aiGenerated && ' · AI-generated'}</p>

  // Result view, once an answer's actually been resolved-in-principle
  // (a preset picked, or a free-text answer graded) -- same shape either
  // way: outcome/lesson (from whichever preset option the answer maps to)
  // plus Mira's reaction, then "Got it" applies the numbers for real.
  if (picked || freeTextPicked) {
    const shown = picked ?? freeTextPicked!
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(6,12,9,0.75)' }} role="dialog" aria-label={challenge.title}>
        <Panel className="w-full max-w-lg px-7 py-6">
          {eyebrow}
          <h2 className="font-title mb-3 text-sm" style={{ color: 'var(--wood-dark)' }}>{challenge.title}</h2>
          {picked && <p className="mb-3 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>{picked.outcome}</p>}
          {freeTextPicked && <p className="mb-3 text-base italic leading-relaxed" style={{ color: 'var(--ink-soft)' }}>You wrote: &ldquo;{freeTextAnswer}&rdquo;</p>}
          <p className="mb-3 rounded-sm px-3 py-2.5 text-base leading-relaxed" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
            <span className="font-semibold">Lesson: </span>{shown.lesson}
          </p>
          {(judgeLoading || judgment) && (
            <p className="mb-5 rounded-sm px-3 py-2.5 text-base leading-relaxed" style={{ backgroundColor: 'var(--parchment-dark)', border: '2px solid var(--wood)', color: 'var(--ink)' }}>
              <span className="font-semibold">Mira: </span>
              {judgment ?? 'Thinking about your choice...'}
            </p>
          )}
          <GameButton
            onClick={() => {
              const index = picked ? pickedIndex! : freeTextOptionIndex!
              resolveChallenge(index, freeTextPicked ? (freeTextAnswer ?? undefined) : undefined)
              setPickedIndex(null)
            }}
            className="w-full py-2.5"
          >
            Got it
          </GameButton>
        </Panel>
      </div>
    )
  }

  // Free text submitted but still grading (no result yet) -- a short wait,
  // same shape as the "Thinking about your choice" state above.
  if (mode === 'freeText' && submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(6,12,9,0.75)' }} role="dialog" aria-label={challenge.title}>
        <Panel className="w-full max-w-lg px-7 py-6">
          {eyebrow}
          <h2 className="font-title mb-3 text-sm" style={{ color: 'var(--wood-dark)' }}>{challenge.title}</h2>
          <p className="mb-3 text-base italic leading-relaxed" style={{ color: 'var(--ink-soft)' }}>You wrote: &ldquo;{draft}&rdquo;</p>
          <p className="text-base leading-relaxed" style={{ color: 'var(--ink)' }}>Weighing your answer...</p>
        </Panel>
      </div>
    )
  }

  // Not yet answered -- scenario plus either the 3 presets, or a free-text
  // box, with a small link to switch which one THIS challenge uses.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(6,12,9,0.75)' }} role="dialog" aria-label={challenge.title}>
      <Panel className="w-full max-w-lg px-7 py-6">
        {eyebrow}
        <h2 className="font-title mb-3 text-sm" style={{ color: 'var(--wood-dark)' }}>{challenge.title}</h2>
        <p className="mb-5 text-base leading-relaxed" style={{ color: 'var(--ink)' }}>{challenge.scenario}</p>
        {mode === 'options' ? (
          <>
            <div className="space-y-2">
              {challenge.options.map((o, i) => (
                <GameButton
                  key={i}
                  tone="quiet"
                  onClick={() => {
                    setPickedIndex(i)
                    requestJudgment(challenge, i)
                  }}
                  className="w-full px-4 py-2.5 text-left"
                >
                  {o.label}
                </GameButton>
              ))}
            </div>
            <button className="mt-3 text-xs underline" style={{ color: 'var(--ink-soft)' }} onClick={() => setMode('freeText')}>Type your own answer instead</button>
          </>
        ) : (
          <>
            <textarea
              className="mb-2 w-full rounded-sm px-3 py-2 text-sm outline-none"
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              maxLength={600}
              placeholder="What would you actually do?"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Your own answer"
            />
            <div className="flex items-center justify-between gap-3">
              <button className="text-xs underline" style={{ color: 'var(--ink-soft)' }} onClick={() => setMode('options')}>Switch to multiple choice</button>
              <GameButton
                disabled={!draft.trim()}
                onClick={() => {
                  setSubmitted(true)
                  gradeFreeTextAnswer(challenge, draft)
                }}
                className="px-4 py-2.5 shrink-0"
              >
                Submit
              </GameButton>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}

function DevToolsScreen() {
  const day = useGameStore((s) => s.day)
  const money = useGameStore((s) => s.money)
  const advanceDays = useGameStore((s) => s.advanceDays)
  const addMoney = useGameStore((s) => s.addMoney)
  const forceChallenge = useGameStore((s) => s.forceChallenge)
  const saveToSlot = useGameStore((s) => s.saveToSlot)
  const loadFromSlot = useGameStore((s) => s.loadFromSlot)
  const deleteSlot = useGameStore((s) => s.deleteSlot)
  const [slotName, setSlotName] = useState('checkpoint')
  const [slots, setSlots] = useState<string[]>(() => listSaveSlots())
  const refreshSlots = () => setSlots(listSaveSlots())

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>Dev Tools</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>
        Day {day} &middot; {formatInr(money)}. Not part of the story -- for testing without replaying a whole run from scratch.
      </p>

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Fast-forward</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Runs the real day-rollover logic instantly, same as playing it out in real time.</p>
        <div className="flex flex-wrap gap-2">
          <GameButton tone="quiet" onClick={() => advanceDays(1)} className="px-3 py-2 text-[9px]">+1 day</GameButton>
          <GameButton tone="quiet" onClick={() => advanceDays(5)} className="px-3 py-2 text-[9px]">+5 days</GameButton>
          <GameButton tone="quiet" onClick={() => advanceDays(15)} className="px-3 py-2 text-[9px]">+15 days</GameButton>
        </div>
      </Panel>

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Cheats</p>
        <div className="flex flex-wrap gap-2">
          <GameButton tone="quiet" onClick={() => forceChallenge()} className="px-3 py-2 text-[9px]">Force a challenge now</GameButton>
          <GameButton tone="quiet" onClick={() => addMoney(50000)} className="px-3 py-2 text-[9px]">+ {formatInr(50000)}</GameButton>
        </div>
      </Panel>

      <Panel className="px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Snapshots</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Save right before a spot you want to retest, then reload it after every fix instead of starting over. Separate from the automatic save -- these stick around until you delete them.</p>
        <div className="mb-3 flex gap-2">
          <input
            value={slotName}
            onChange={(e) => setSlotName(e.target.value)}
            className="flex-1 rounded-sm px-2 py-1.5 text-sm"
            style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)', border: '2px solid var(--wood)' }}
          />
          <GameButton
            onClick={() => {
              saveToSlot(slotName)
              refreshSlots()
            }}
            className="px-3 py-1.5 text-[9px]"
          >
            Save
          </GameButton>
        </div>
        <div className="space-y-1.5">
          {slots.length === 0 && <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>No snapshots yet.</p>}
          {slots.map((slot) => (
            <div key={slot} className="flex items-center gap-2 rounded-sm px-2 py-1.5" style={{ backgroundColor: 'var(--parchment-dark)' }}>
              <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>{slot}</span>
              <GameButton tone="quiet" onClick={() => loadFromSlot(slot)} className="px-2 py-1 text-[9px]">Load</GameButton>
              <GameButton
                tone="quiet"
                onClick={() => {
                  deleteSlot(slot)
                  refreshSlots()
                }}
                className="px-2 py-1 text-[9px]"
              >
                Delete
              </GameButton>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ChronicleScreen() {
  const log = useGameStore((s) => s.log)
  const skills = useGameStore((s) => s.skills)
  const storyLog = useGameStore((s) => s.storyLog)
  const skillEntries = Object.entries(skills)
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>Hall of Records</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>Everything that's happened so far, most recent first -- your own doings and the town's.</p>
      {storyLog.length > 0 && (
        <Panel className="mb-4 px-5 py-4">
          <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Your Story So Far</p>
          <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            A thread running underneath everything else -- it keeps moving whether or not you're chasing it on purpose.
          </p>
          <div className="space-y-3">
            {storyLog.slice().reverse().map((beat) => (
              <div key={beat.id}>
                <p className="text-sm font-semibold" style={{ color: 'var(--wood)' }}>Day {beat.day} &middot; {beat.title}</p>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>{beat.text}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {skillEntries.length > 0 && (
        <Panel className="mb-4 px-5 py-4">
          <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>What you've learned</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {skillEntries.sort((a, b) => b[1] - a[1]).map(([domain, level]) => (
              <span key={domain} className="rounded-sm px-2.5 py-1 text-xs" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
                {domain.replace('-', ' ')} &middot; {level}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            Feeding back into your numbers right now: +{(technicalBonus(skills) * 100).toFixed(0)}% efficiency from technical skill, +{(peopleBonus(skills) * 100).toFixed(0)}% gig/business income from people skills, sickness odds at {(resilienceFactor(skills) * 100).toFixed(0)}% of normal from resilience, and a better loan rate the more personal-finance you've picked up.
          </p>
        </Panel>
      )}
      <Panel className="px-5 py-4">
        <div className="space-y-1.5 text-sm" style={{ color: 'var(--ink)' }}>
          {log.map((entry) => (
            <div key={entry.id}>
              <span style={{ color: entry.kind === 'world' ? '#6b7d5a' : 'var(--wood)' }}>Day {entry.day}:</span>{' '}
              <span style={{ fontStyle: entry.kind === 'world' ? 'italic' : 'normal' }}>{entry.message}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const playerName = useGameStore((s) => s.playerName)
  const createCharacter = useGameStore((s) => s.createCharacter)
  const openAssistant = useGameStore((s) => s.openAssistant)
  const startClock = useGameStore((s) => s.startClock)
  const stopClock = useGameStore((s) => s.stopClock)
  const resetGame = useGameStore((s) => s.resetGame)

  if (screen === 'landing') {
    return (
      <LandingScreen
        playerName={playerName}
        onPlay={() => setScreen('login')}
        onEnterWorld={() => {
          startClock()
          setScreen('home')
        }}
        onReset={() => {
          resetGame()
          setScreen('landing')
        }}
      />
    )
  }

  if (screen === 'login' || !playerName) {
    return (
      <LoginScreen
        onEnter={(name) => {
          createCharacter(name)
          setScreen('story')
        }}
      />
    )
  }

  if (screen === 'story') {
    return <StoryScreen name={playerName} onContinue={() => setScreen('home')} />
  }

  return (
    <div className={`game-shell ${screen === 'home' ? 'game-shell-world' : ''}`} style={{ backgroundColor: '#0d1210' }}>
      <Hud screen={screen} onNavigate={setScreen} onExit={() => { stopClock(); setScreen('landing') }} />
      <TabBar screen={screen} onNavigate={setScreen} />
      <QuestBanner onAskMira={openAssistant} />
      <main className={screen === 'home' ? 'world-main' : 'game-main'}>
        {screen === 'home' && <WorldView onNavigate={setScreen} />}
        {screen === 'work' && <WorkScreen />}
        {screen === 'ventures' && <VenturesScreen />}
        {screen === 'opportunities' && <OpportunitiesScreen />}
        {screen === 'life' && <LifeScreen />}
        {screen === 'bank' && <BankScreen />}
        {screen === 'chronicle' && <ChronicleScreen />}
        {screen === 'dev' && <DevToolsScreen />}
      </main>
      <MiraWidget docked={screen === 'home'} />
      <ChallengeModal />
      <AIConnectBanner />
    </div>
  )
}
