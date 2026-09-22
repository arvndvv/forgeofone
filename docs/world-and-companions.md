# World, neighbours and Mira

This update follows the supplied September 22 requirements: an open career and
community life-sim, independent world activity, a soft focus limit, INR economy,
and an assistant who knows the player's actual situation. Existing jobs,
businesses, quests, daily costs and the 25× clock remain the gameplay foundation.

## Implemented

- Five region types: green meadows, harvest country, cedar woods, amber valley,
  and stone country. Ground palettes blend at borders; vegetation, rocks, crops,
  settlement density and discoveries vary by region.
- Neighbours visibly bake, garden, sell produce, repair furniture, sketch signs,
  sort parcels, read, take breaks and chat. Routes and activities use simulation
  time, including for places off screen. Travellers cross between towns.
- Walk near a neighbour and press **E**, without selecting them first. A nearby
  prompt names the person; **E** at a doorstep still enters the building.
  Clicking a neighbour and choosing **Talk** also works. Topic buttons explain the current
  task, introduce the person, give career advice and suggest nearby places.
  Free-text questions use offline replies or the selected local model.
- **Journal** records people met, conversation counts and collected objects.
  Ruins, a camp and a community harvest are composed locations outside each
  town. Discoveries award an item once per site; duplicates from different sites
  stack. Collecting food currently records an item; hunger/consumption is not
  implemented.
- Birds, rabbits, chickens and sheep follow small collision-aware routes,
  stopping to forage, peck or graze. Click one to inspect it.
- The player, all eight neighbour styles and all four animal species have
  distinct north/south/east/west views and walking animation. Facing follows
  movement even with reduced motion, while stationary actors keep their view.
  The player has a satchel and a matching HUD portrait.
- Mira is an original mint creature with leaf ears, tiny paws and a star in her
  belly. She floats, blinks, listens, thinks and reacts to replies. Animations
  respect reduced-motion preferences. Her chat history survives closing and
  reopening the panel during the session.
- **Show/Hide place names** controls shop and landmark labels on the map.
- The map fills the remaining window height without page scrolling. **Around
  you** opens a compact panel containing the region description, nearby
  businesses and resident activities; its contents scroll within the panel.

## Optional local model

Start the desktop app, then choose **Ask Mira → settings (gear) → Check Ollama**.
Select an installed model and choose **Use local model**. The same choice serves
Mira and neighbour conversations. **Use offline replies** is always available.

The existing local `gemma2:2b` installation was verified through a real desktop
conversation. The app does not install models, start services, or call hosted
model APIs. Model selection is saved on this device. If the service fails or a
reply times out, the game shows an explicit notice and an offline reply.

Electron's isolated preload exposes only model listing and chat. The main
process restricts requests to the game window and the loopback Ollama endpoint,
checks installed local chat models, bounds message sizes, and applies timeouts.
Model output is text: it cannot change money, inventory, jobs, or other state.
Mira receives a compact snapshot of the current game; neighbours receive their
identity, occupation, place and activity.

During local Vite development, an already-open Electron shell can be older than
its updated renderer and lack the Ollama IPC handlers. The renderer detects
that failure and connects directly to the same fixed loopback Ollama address.
This fallback is limited to development on localhost; packaged builds use IPC.
Model checks distinguish a desktop-bridge failure from an unavailable Ollama
server, clear stale choices after failure, and show a verified connection status.

References: [Ollama chat API](https://docs.ollama.com/api/chat) and
[model listing](https://docs.ollama.com/api/tags).

## Art

Kenney [Tiny Town](https://kenney.nl/assets/tiny-town) and
[Tiny Farm](https://kenney.nl/assets/tiny-farm) are included locally with their
CC0 licenses. Tiny Farm supplies additional scenery. The player, neighbours,
Mira, activity props and animals use original code-drawn artwork, with no
animation runtime dependency or asset request during play.

## Still on the larger plan

Disk save/load, food tiers and consumption, structured skill-coaching tasks,
sound, individual resident inventories/economics, and conversations that create
actual jobs or transactions remain future gameplay work. Character state,
collections and acquaintances currently last for the open app session; only the
local-model preference persists across restarts.

## Verification

`npm test` exercises generation, collisions, entrances, routes, activities,
conversations, regional borders, reachable sites, wildlife, collectible
idempotency/reset, bounded caches and local-model request handling.

`npm run typecheck` and `npm run build` validate the renderer bundle.

On macOS, after building:

```sh
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke-world.cjs
# Also test a real response from an already running local Ollama installation:
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke-world.cjs --local-ai
# With the existing Vite development server running, test stale-bridge recovery:
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/smoke-world.cjs --dev-stale --connection-only
```

The smoke check uses an isolated temporary browser session and captures local
screenshots in `/private/tmp/forge-world-smoke`.
