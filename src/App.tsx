import { useState, type CSSProperties, type ReactNode } from 'react'
import { useGameStore, formatInr, BUSINESS_STARTUP_COST } from './store/gameStore'
import { MiraWidget } from './components/MiraWidget'
import { PlayerPortrait } from './components/PlayerPortrait'
import { WorldView } from './components/WorldView'
import worldHubBg from './assets/game/world/world-hub-bg.png'
import iconCoin from './assets/game/ui/icon-coin.png'
import iconChest from './assets/game/ui/icon-chest.png'
import iconSignpost from './assets/game/ui/icon-signpost.png'
import iconHouse from './assets/game/ui/icon-house.png'
type Screen = 'landing' | 'login' | 'story' | 'home' | 'work' | 'ventures' | 'opportunities' | 'chronicle'

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
function QuestBanner({ onAskMira }: { onAskMira: () => void }) {
  const quest = useGameStore((s) => s.activeQuest())
  const [expanded, setExpanded] = useState(false)

  if (!quest) {
    return (
      <div className="quest-banner mx-auto max-w-5xl px-4 pt-3">
        <div className="rounded-sm px-4 py-2 text-center text-sm" style={{ backgroundColor: '#1f2a1c', border: '2px solid var(--wood)', color: '#a9d9b4' }}>
          All the objectives Mira had queued up are done -- the town keeps generating its own opportunities. You're on your own steam now.
        </div>
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
  { id: 'chronicle', label: 'Records' },
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
function WorkScreen() {
  const state = useGameStore()
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

      <Panel className="px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Freelance gigs in progress ({state.activeGigs.length})</p>
        {state.activeGigs.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>None running right now -- check the Job Board.</p>}
        <div className="space-y-1.5">
          {state.activeGigs.map((g) => (
            <div key={g.id} className="rounded px-3 py-2 text-sm" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
              {g.title} &middot; {g.daysRemaining} day(s) left &middot; {formatInr(g.payout)} on completion
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// --- Screen 6: Ventures --------------------------------------------------------
function VenturesScreen() {
  const state = useGameStore()
  const [bizName, setBizName] = useState('')
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <img src={iconChest} alt="" className="h-6 w-6" style={{ imageRendering: 'pixelated' }} />
        <h1 className="font-title text-sm" style={{ color: '#f2e8d0' }}>Your Ventures</h1>
      </div>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>Businesses you've founded. No limit on how many -- just on how much attention you have.</p>

      <Panel className="mb-4 px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Founded so far ({state.businesses.length})</p>
        {state.businesses.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>None yet.</p>}
        <div className="space-y-1.5">
          {state.businesses.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded px-3 py-2 text-sm" style={{ backgroundColor: 'var(--parchment-dark)', color: 'var(--ink)' }}>
              <img src={iconHouse} alt="" className="h-5 w-5" style={{ imageRendering: 'pixelated' }} />
              {b.name} &middot; founded day {b.foundedOnDay}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="px-5 py-4">
        <p className="mb-2 font-semibold" style={{ color: 'var(--ink)' }}>Found a new one</p>
        <p className="mb-2 text-xs" style={{ color: 'var(--ink-soft)' }}>Costs {formatInr(BUSINESS_STARTUP_COST)} to start.</p>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-sm px-3 py-2 text-sm outline-none"
            style={inputStyle}
            placeholder="Name your business"
            value={bizName}
            onChange={(e) => setBizName(e.target.value)}
          />
          <GameButton
            disabled={!bizName.trim()}
            onClick={() => {
              state.startBusiness(bizName.trim())
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
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>{o.title}</p>
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
    </div>
  )
}

function ChronicleScreen() {
  const log = useGameStore((s) => s.log)
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-title mb-2 text-sm" style={{ color: '#f2e8d0' }}>Hall of Records</h1>
      <p className="mb-4 text-sm" style={{ color: '#9c9686' }}>Everything that's happened so far, most recent first -- your own doings and the town's.</p>
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
        {screen === 'chronicle' && <ChronicleScreen />}
      </main>
      <MiraWidget docked={screen === 'home'} />
    </div>
  )
}
