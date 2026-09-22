# Forge of One (v0.1)

Free-world life-sim: start as a developer, freelance on the side, take random
opportunities as they show up, and found businesses once you've got the
capital. There's no hard cap on how much you take on at once -- juggle too
much and your efficiency (and outcomes) degrade instead of the game blocking
you outright.

## Stack

Electron (desktop shell) + Vite + React + TypeScript (renderer) + Zustand
(game state) + Tailwind (styling). No backend, no hosting -- runs entirely
local on your machine.

## World view

The world streams deterministic terrain in every direction. Connected town
streets, building lots, doorstep paths, public gardens, fields, woods, rivers,
and bridges replace independent random tiles. Buildings, trees, and water
block movement; buildings are drawn from the included Kenney Tiny Town atlas
with depth sorting so people can walk behind them.

- Walk with **WASD**, **arrow keys**, or the on-screen directional pad.
- Click open ground to follow a walking route. Click a building to walk to its door.
- Press **E** or use the doorstep button to enter a landmark or inspect a place.
- Walk near a neighbour and press **E** to talk; the nearby prompt shows who
  will respond. Clicking a neighbour and choosing **Talk** also works.
- People and animals face north, south, east and west as they move, including
  when reduced motion is enabled.
- Open **Journal** for collected artifacts, supplies and people you've met.
- **Around you** opens local activity and region information over the map.
  The world fits the available window height without page scrolling.
- **Ask Mira** opens your animated companion. Her settings can connect to an
  existing local Ollama model for Mira and neighbour conversations.
- Adjust zoom or place labels above the map. The house button returns to the starting square.
- **Pause** freezes the simulation clock and residents; exploration still works.

Each town has 24 residents and four travelling couriers/traders. Their routes
connect homes, workplaces, shops, the square, and the garden; travellers use
roads and bridges between towns. Daytime routines and nighttime rest derive
from the game clock, including while a region is off screen. Terrain and route
caches are bounded so exploration does not keep the whole world in memory.

This is a lightweight procedural simulation: residents have routines, rather
than individual inventories or economic decision-making. Worlds are stable
for the current character/session; disk save/load is still outside this build.

The world now has five landscape types, visible work/leisure activities,
collectible sites and small animals. See [World, neighbours and Mira](docs/world-and-companions.md)
for the current requirements status, local-model setup, art credits and limits.

Verification:

```sh
npm test
npm run typecheck
npm run build
# On macOS, after building:
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke-world.cjs
```

The desktop smoke check exercises rendering, keyboard collision, click-to-walk,
building interaction, returning to the world, pause, river crossings, and five
window sizes. With `--local-ai`, it also verifies Ollama chat and settings layout.
It writes screenshots to `/private/tmp/forge-world-smoke`.
World code lives in `src/world/`; the view and its controls are in
`src/components/WorldView.tsx`. The atlas's CC0 license is included alongside it.

## Running on Mac

Install dependencies and package the desktop app on macOS so Electron and other
native dependencies match the target platform. From Terminal:

    cd /path/to/forgeofone
    npm install
    npm run dev

This only needs network access on your own machine's normal connection --
nothing special required.

## Building a Mac app (unsigned, free)

    npm run dist:mac

Produces `release/Forge of One-0.1.0.dmg` (and a `.zip`). Also needs to run
natively on your Mac (dmg packaging needs real macOS, not a Linux VM).

It's unsigned, so Gatekeeper will complain the first time you open it --
right-click the app -> Open, or go to System Settings -> Privacy & Security
and allow it. One-time thing per machine, costs nothing.

## What's here (v0.1)

- Sim clock running ~25x real time (tunable in `src/store/gameStore.ts`)
- Developer job, toggleable
- Random freelance gigs, job offers, and business openings that appear over
  time -- accept or decline
- Businesses you can found once you've saved enough
- A soft focus/time constraint: past 3 simultaneous commitments (dev job +
  businesses + active gigs), efficiency drops instead of the game blocking
  you from trying
- Daily living costs, a small daily chance of getting sick

TypeScript, the production build and the desktop smoke test have been verified
on macOS. Packaging a distributable DMG is a separate step.

## Not yet built (see the project's requirements doc for the full list)

Structured skill-coaching gameplay, disk save/load, food tiers and consumption,
sound, individual resident economies, and a defined first milestone beyond
this loop. Local LLM conversation support is available; it does not implement
the planned coaching gameplay by itself.
