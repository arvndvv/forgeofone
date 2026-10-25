import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { conversationReply, generateJSON, aiReady } from '../services/localAI'
import { getTile, getInteraction, listWorldTowns, locationName } from '../world/generation'
import { facingForStep, type Facing } from '../world/facing'
import type { Opportunity, OpportunityKind, ActiveGig, Business, Employee, LogEntry, Quest, RivalBusiness, ChatMessage, CollectedItem, PremisesType, Challenge, ChallengeOption, Loan, SkillDomain, Book, OwnedBook, DynamicExpert, StoryBeat } from '../types/game'
import { expertFor, pickEmployer, pickApplicants, pickPremisesBuilding, pickExpertSpot, type ExpertSpot, type ResidentOverride } from '../world/residents'
import { FOOD_CATALOG, STATIC_BOOKS, BOOK_SHOP_CAP, pickFallbackNote } from '../world/shopping'

// --- Currency ---------------------------------------------------------------
// World runs on INR (rupees), not dollars. Reference costs below are written
// as USD baselines (easy to reason about / tune) and converted through this
// rate -- same idea as pricing data you'd find quoted in $ elsewhere.
// Rate sourced Sept 2026; update USD_TO_INR if you want to resync later.
const USD_TO_INR = 95.6
const usdToInr = (usd: number) => Math.round((usd * USD_TO_INR) / 10) * 10
export const formatInr = (amount: number) => `₹${Math.round(amount).toLocaleString('en-IN')}`

// --- Tunable constants -----------------------------------------------------
const SPEED_MULTIPLIER = 25 // sim clock runs this many times faster than real time (20-30x range)
const TICK_INTERVAL_MS = 1000 // one clock tick per real second
const FOCUS_CAPACITY = 3 // commitments a player can juggle before efficiency starts dropping
const DEV_JOB_DAILY_INCOME = usdToInr(220)
const DAILY_LIVING_COST = usdToInr(140) // food + rent + insurance, combined for v0.1
// Founding a firm means picking one of two premises, each with its own cost
// shape -- rent is cheap to start but bleeds a bit every day forever; land
// is a big one-time spend, takes time to build, then never charges rent
// again. Both still earn the same base revenue once actually open.
export const OFFICE_RENT_STARTUP_COST = usdToInr(800) // deposit + first month, moving into an existing office
export const OFFICE_MONTHLY_RENT = usdToInr(350) // charged daily as a 1/30th share, forever, while the business is rented
export const LAND_BUILD_COST = usdToInr(6000) // buying the land and building on it, one-time
export const BUILD_DAYS = 6 // days of construction before an owned building opens and starts earning
const BUSINESS_DAILY_REVENUE_BASE = usdToInr(180)
// Hiring (v0.18): a real resident, never invented, taken on at one of the
// player's own businesses (see pickApplicants/postOpening). Wage is a flat
// daily cost; the revenue bonus is deliberately set a bit above the wage on
// average so hiring is a genuine, positive-expectancy bet, not free money --
// the same 0.8-1.2 daily variance the business's own base revenue gets still
// applies on top, so a bad day can still make a hire a net loss that day.
const APPLICANTS_PER_POSTING = 3
export const MAX_EMPLOYEES_PER_BUSINESS = 4
const EMPLOYEE_WAGE_MIN = usdToInr(15)
const EMPLOYEE_WAGE_RANGE = usdToInr(25) // wage rolls EMPLOYEE_WAGE_MIN..+RANGE
const EMPLOYEE_REVENUE_MULTIPLIER_MIN = 1.15 // revenue bonus is always >= this times the wage
const EMPLOYEE_REVENUE_MULTIPLIER_RANGE = 0.5
const SICK_CHANCE = 0.05
const SICK_COST = usdToInr(250)
const OPPORTUNITY_SPAWN_CHANCE = 0.4
const MAX_OPEN_OPPORTUNITIES = 3
const OPPORTUNITY_EXPIRY_DAYS = 8 // a posting nobody's acted on this long quietly comes down
const STARTING_MONEY = 0

// World-sim tunables (rival businesses + NPC flavor -- makes the town feel
// alive independent of the player)
const RIVAL_SPAWN_CHANCE = 0.14
const MAX_RIVAL_BUSINESSES = 6
const RIVAL_BASE_CLOSE_CHANCE = 0.02 // grows slowly with age -- young shops rarely fold, old struggling ones eventually do
const NPC_FLAVOR_CHANCE = 0.3

// Food / craving -- an unmet craving is a slow drain on health, not just a
// number. Two tiers: cheap and filling vs. pricier and more effective,
// same trade-off as real fast food vs. a proper meal.
const CRAVING_RISE_PER_DAY = 22
export const CRAVING_HEALTH_PENALTY_START = 70 // above this, hunger itself starts costing health
export const FOOD_CHEAP_COST = usdToInr(3)
export const FOOD_CHEAP_RELIEF = 30
export const FOOD_QUALITY_COST = usdToInr(9)
export const FOOD_QUALITY_RELIEF = 60
const FOOD_QUALITY_HEALTH_BONUS = 3

// Focus -- separate from the money-side "efficiency" multiplier. Every
// active commitment (job, gig, business) spends a little focus each day;
// rest regenerates it. Efficiency is then scaled down further on top of
// the commitment-count formula when focus runs low, so grinding without
// rest costs you even below the FOCUS_CAPACITY threshold.
const FOCUS_DRAIN_PER_COMMITMENT = 7
const FOCUS_DAILY_RECOVERY = 24
const FOCUS_MIN_MULTIPLIER = 0.6 // efficiency floor even at 0 focus -- never fully zeroes out

// Bank -- a place for idle money to earn a little instead of sitting
// still, and a way to pull cash forward (at a cost) to afford land or a
// rough patch, instead of just waiting.
export const SAVINGS_DAILY_RATE = 0.0015 // ~0.15%/day on a positive balance
export const LOAN_INTEREST = 0.1 // simple interest, added once at loan origination
export const LOAN_TERM_DAYS = 20

let miraRequest = 0
let idCounter = 0
const nextId = () => `id-${Date.now()}-${idCounter++}`

/** Picks a real, already-generated town from listWorldTowns() to anchor a
 *  rival business or business-founding opportunity in -- this is what
 *  makes the wider economy feel like it spans the whole world instead of
 *  just the player's home town. Job and freelance postings get their town
 *  from pickEmployer() instead (world/residents.ts), since those also need
 *  a real building/resident in that same town. */
function pickRandomTown(seed: number): string {
  const towns = listWorldTowns(seed)
  return towns[Math.floor(Math.random() * towns.length)].name
}

const OPPORTUNITY_POOL: Array<Omit<Opportunity, 'id'>> = [
  { kind: 'freelance', title: "Freelance: landing page for local shop", payout: usdToInr(600), durationDays: 3 },
  { kind: 'freelance', title: "Freelance: fix a client's API bug", payout: usdToInr(350), durationDays: 1 },
  { kind: 'freelance', title: 'Freelance: build a dashboard MVP', payout: usdToInr(1200), durationDays: 5 },
  { kind: 'job', title: 'Job offer: senior dev role, better base pay', payout: 0, durationDays: 0 },
  { kind: 'job', title: 'Job offer: startup wants a founding engineer, equity-heavy', payout: 0, durationDays: 0 },
  { kind: 'job', title: 'Job offer: steady team-lead role at an established shop', payout: 0, durationDays: 0 },
  { kind: 'business', title: 'Opportunity: co-found a small studio', payout: 0, durationDays: 0 },
]

const RIVAL_NAME_POOL: Array<{ name: string; sector: string }> = [
  { name: 'Meera\'s Bakery', sector: 'bakery' },
  { name: 'QuickFix Repairs', sector: 'repair shop' },
  { name: 'Northside Print Co.', sector: 'print shop' },
  { name: 'Two Dogs Cafe', sector: 'cafe' },
  { name: 'Vantage Consulting', sector: 'consulting' },
  { name: 'Riverbend Grocers', sector: 'grocery' },
  { name: 'Pixel & Thread', sector: 'design studio' },
  { name: 'Old Town Hardware', sector: 'hardware store' },
  { name: 'Lantern Bookshop', sector: 'bookshop' },
  { name: 'Fleet Motors', sector: 'garage' },
]

const NPC_NAME_POOL = ['Asha', 'Devon', 'Priya', 'Sam', 'Ravi', 'Elena', 'Tomas', 'Nisha', 'Marcus', 'Kavya']
const NPC_ACTIVITY_POOL = [
  'hurrying to open up shop before the morning rush',
  'arguing with a delivery driver over a late shipment',
  'posting a "help wanted" sign in a window downtown',
  'sitting outside the cafe, sketching something on a napkin',
  'carrying a stack of flyers for a shop that just opened',
  'fixing a flat tire outside the garage',
  'reading the job board notices with a frown',
  'closing up early, looking tired',
  'chatting with a regular customer on the street corner',
  'counting coins at a market stall',
]

// --- Learning-by-playing: challenges pulled from dev work, running a
// business, and ordinary life. This is the actual mechanism behind
// "you learn while you play" -- each one is a real situation with a few
// genuinely different approaches, not a quiz with one correct answer.
// Domains match the game's skill-coaching list; written at a working
// engineer's level, not a beginner's.
const CHALLENGE_POOL: Challenge[] = [
  {
    id: 'dev-architecture', domain: 'architecture', source: 'dev',
    title: 'One Big Component or Three Small Ones',
    scenario: `A feature you're building keeps growing. It's still one component, but it's now fetching data, managing three kinds of local state, and rendering four visually distinct sections. It works. It's just getting harder to change without breaking something two sections away.`,
    options: [
      { label: 'Ship it as-is -- it passes, and you have other things queued', outcome: `It ships. Two weeks later, a small style tweak to one section causes a state bug in another, and you spend longer fixing it than the split would have taken.`, lesson: `Coupling you can't see is still coupling. A component doing unrelated jobs will eventually make an unrelated change break something -- that's not bad luck, it's the design cost showing up late instead of early.`, deltaMoney: 0, deltaFocus: -4, skillGain: 1 },
      { label: 'Split it now: one container owns data-fetching, three dumb children just render', outcome: `Takes an extra half-day. The next three feature requests each touch exactly one child component and nothing else.`, lesson: `Separating "what data do we have" from "how do we show this slice of it" is the single highest-leverage split in frontend architecture -- it's what makes future changes local instead of global.`, deltaMoney: usdToInr(60), deltaFocus: -2, skillGain: 4 },
      { label: `Add a comment saying "TODO: split this up" and move on`, outcome: `The comment is still there three months later. Nobody ever comes back to a TODO on working code.`, lesson: `A refactor you're not doing right now is a refactor that isn't happening. If the seam is obvious today, cutting it today is cheaper than describing it for someone else -- who is usually also you, later, with less context.`, deltaMoney: 0, deltaFocus: -1, skillGain: 1 },
    ],
  },
  {
    id: 'dev-code-review', domain: 'code-review', source: 'dev',
    title: 'The PR That Works But Feels Off',
    scenario: `A teammate's pull request passes every test and does what the ticket asked. Reading it, though, the approach is more complex than it needs to be -- it just isn't wrong.`,
    options: [
      { label: 'Approve it -- tests pass, not your job to bikeshed style', outcome: `It merges clean. Six weeks later someone extends it, misunderstands the overcomplicated part, and introduces a real bug.`, lesson: `"Works" and "reviewed" aren't the same bar. A review that only checks correctness misses the cost the next person pays reading and extending the code -- and that cost compounds.`, deltaMoney: 0, deltaFocus: -2, skillGain: 1 },
      { label: `Leave a specific comment: "this works, but X would do the same thing with less state -- your call"`, outcome: `They simplify it in five minutes, thank you for catching it, and the PR is genuinely better.`, lesson: `The best review comments are non-blocking and specific: name the concrete alternative, don't just say "this feels complex." It respects their time and still moves the code forward.`, deltaMoney: usdToInr(40), deltaFocus: -3, skillGain: 4 },
      { label: 'Block the PR and ask them to rewrite it your way', outcome: `They push back, it turns into a half-day thread, and the fix that lands is barely different from their original.`, lesson: `Review is not a chance to author the code by proxy. Blocking on preference rather than defect burns trust and time for a marginal gain -- save blocking for actual correctness, security, or maintainability risks.`, deltaMoney: 0, deltaFocus: -5, skillGain: 2 },
    ],
  },
  {
    id: 'dev-debugging', domain: 'debugging', source: 'dev',
    title: 'The Bug That Only Happens in Production',
    scenario: `A user reports data disappearing after they refresh -- but only in production, never in dev, and the logs show nothing obviously wrong.`,
    options: [
      { label: 'Sprinkle console.log everywhere and redeploy to watch it happen live', outcome: `It takes three redeploys and most of a day, but you eventually spot it.`, lesson: `Redeploy-and-watch is the slowest feedback loop available. It works, but it's usually a last resort, not a first move.`, deltaMoney: -usdToInr(30), deltaFocus: -6, skillGain: 2 },
      { label: 'Diff the production config against dev before touching any code', outcome: `Ten minutes in, you find a caching header set only in prod. Fixed same day.`, lesson: `"Works in dev, not in prod" is a strong signal to check environment differences -- config, caching, feature flags -- before you suspect the code itself. The bug is very often not in the logic at all.`, deltaMoney: usdToInr(70), deltaFocus: -2, skillGain: 4 },
      { label: `Mark it "can't reproduce" and close the ticket`, outcome: `It comes back a week later, angrier, from more users.`, lesson: `An intermittent bug that only some users hit is still a bug -- "can't reproduce on my machine" describes your environment, not the defect's existence.`, deltaMoney: -usdToInr(50), deltaHealth: -3, skillGain: 1 },
    ],
  },
  {
    id: 'dev-legacy-code', domain: 'legacy-code', source: 'dev',
    title: 'Nobody Remembers Why This Function Exists',
    scenario: `You need to change a function with no tests, no comments, and a name that no longer matches what it does. Whoever wrote it is long gone.`,
    options: [
      { label: 'Read it carefully, form a theory, and change it directly', outcome: `Your theory is half right. The change works for the common case and quietly breaks an edge case nobody notices for a month.`, lesson: `Untested legacy code punishes confidence. A theory formed just by reading is a hypothesis, not a fact -- and the code's own history of surviving unchanged usually means it's handling cases you haven't thought of yet.`, deltaMoney: 0, deltaFocus: -3, skillGain: 2 },
      { label: 'Write a characterization test that pins down current behavior first, then change it', outcome: `Takes longer upfront. The test immediately catches an edge case your first instinct would have broken.`, lesson: `Before changing behavior you don't fully understand, write a test that just describes what it currently does. That test is your safety net and your documentation, in one move.`, deltaMoney: usdToInr(50), deltaFocus: -4, skillGain: 4 },
      { label: 'Rewrite the whole thing from scratch, cleaner this time', outcome: `The rewrite is prettier. It's also missing three behaviors the old one handled, discovered one at a time in production.`, lesson: `A full rewrite of code you don't understand replaces known unknowns with unknown unknowns. Legacy code that's still running is usually encoding real, hard-won requirements -- treat its behavior as a spec until proven otherwise.`, deltaMoney: -usdToInr(80), deltaHealth: -4, skillGain: 2 },
    ],
  },
  {
    id: 'dev-db-modeling', domain: 'db-modeling', source: 'dev',
    title: 'One Table or Two',
    scenario: `You're adding a "status history" to an existing record. You can add a few nullable columns to the existing table, or model it as its own table with a foreign key.`,
    options: [
      { label: 'Add nullable columns -- fastest to ship today', outcome: `Ships fast. Six months in, you need to track a second status type and the table is now a pile of mostly-null columns nobody trusts.`, lesson: `Nullable columns bolted onto an existing table are cheap now and expensive later -- every "is this null because it doesn't apply, or because it hasn't happened yet" question is a design debt you're deferring, not avoiding.`, deltaMoney: usdToInr(20), deltaFocus: -1, skillGain: 1 },
      { label: 'Model it as its own history table with a foreign key, even though it takes longer today', outcome: `Takes a bit longer to ship. When the second status type shows up later, it's one new row type, not a schema migration.`, lesson: `If a value can happen zero, one, or many times over an entity's life, it usually wants its own table, not columns on the parent -- that's the difference between modeling a fact and modeling a snapshot.`, deltaMoney: usdToInr(45), deltaFocus: -3, skillGain: 4 },
      { label: 'Store it as a JSON blob in one column -- flexible, no migration needed', outcome: `Flexible right up until you need to query or index by anything inside it, at which point every query becomes a full scan.`, lesson: `A JSON blob defers the schema decision, it doesn't remove it -- and it trades a one-time migration cost for a permanent query-performance cost.`, deltaMoney: -usdToInr(30), deltaFocus: -2, skillGain: 2 },
    ],
  },
  {
    id: 'dev-estimation', domain: 'estimation', source: 'dev',
    title: `"How Long Will This Take?"`,
    scenario: `You're asked to estimate a feature you've never built before, by end of day, so it can go on the roadmap.`,
    options: [
      { label: 'Give a single confident number so it looks decisive', outcome: `The number becomes a commitment. The work runs long, and now it looks like you missed a deadline instead of gave an estimate.`, lesson: `A single point estimate for novel work is a promise disguised as a guess. Once it's written down, everyone downstream treats it as a fact.`, deltaMoney: 0, deltaFocus: -3, skillGain: 1 },
      { label: 'Give a range, and name the specific unknown that widens it', outcome: `The range gets accepted as-is, and when the unknown resolves badly, nobody's surprised the timeline shifted.`, lesson: `A range plus the specific thing driving the uncertainty is a far more honest and more useful estimate than a false-precision single number -- it tells people what would change the answer, not just the answer.`, deltaMoney: usdToInr(35), deltaFocus: -2, skillGain: 4 },
      { label: 'Push back and ask for a day to actually spike the unknown part first', outcome: `The roadmap slips by a day, but the real estimate that follows is close to accurate, and nobody has to re-plan around it later.`, lesson: `Sometimes the right estimate for "how long will this take" is "give me a day to find out" -- a small, bounded investigation beats a guess when the uncertainty is large enough to matter.`, deltaMoney: usdToInr(20), deltaFocus: -1, skillGain: 3 },
    ],
  },
  {
    id: 'dev-incident-response', domain: 'incident-response', source: 'dev',
    title: 'Everything Is On Fire',
    scenario: `The app is down for a chunk of users right now. You have a hunch what broke, but you're not certain, and people are asking for updates.`,
    options: [
      { label: 'Go silent and just focus on fixing it as fast as possible', outcome: `You fix it in 20 minutes, but the 20 minutes of silence gets remembered worse than the outage itself.`, lesson: `During an incident, communication and fixing are two separate jobs, both real. Silence reads as "nobody's on it," even when someone very much is.`, deltaMoney: -usdToInr(20), deltaFocus: -4, skillGain: 2 },
      { label: 'Post a short status update now, then go fix it, then update again', outcome: `The fix takes the same 20 minutes. The update beforehand means nobody escalates or panics while you work.`, lesson: `"We're aware, investigating, next update in 15 minutes" costs one sentence and buys you calm, uninterrupted time to actually fix the thing. Say what you know, say when you'll say more, then go work.`, deltaMoney: usdToInr(30), deltaFocus: -3, skillGain: 4 },
      { label: `Apply your hunch's fix immediately without confirming the actual cause`, outcome: `Your hunch was half right -- the fix helps but doesn't fully resolve it, and now you're debugging two overlapping symptoms.`, lesson: `Under pressure, the instinct to act fast can skip the "confirm the cause" step. A guessed fix that's wrong doesn't just fail to help -- it muddies the signal for the next person trying to diagnose it.`, deltaMoney: -usdToInr(40), deltaHealth: -3, skillGain: 2 },
    ],
  },
  {
    id: 'dev-refactoring', domain: 'refactoring', source: 'dev',
    title: 'The Refactor Nobody Asked For',
    scenario: `While fixing an unrelated small bug, you notice the surrounding code could be meaningfully cleaner with about an hour of extra work.`,
    options: [
      { label: 'Do the cleanup in the same pull request as the bug fix', outcome: `The PR balloons. The reviewer can't tell which lines are the actual fix and which are the cleanup, and review takes twice as long.`, lesson: `Mixing an unrelated refactor into a bug-fix PR hides the fix inside noise. Even when both changes are good, bundling them makes each one harder to review and harder to revert independently.`, deltaMoney: 0, deltaFocus: -3, skillGain: 1 },
      { label: 'Fix the bug, ship it, then open a separate PR for the cleanup', outcome: `Two small, easy-to-review PRs land the same day. The bug fix is trivially safe to revert if needed, independent of the cleanup.`, lesson: `Separating "fix" from "improve" into different commits or PRs isn't bureaucracy -- it's what keeps each change small enough to actually reason about, and safe enough to revert on its own.`, deltaMoney: usdToInr(25), deltaFocus: -2, skillGain: 4 },
      { label: 'Note the cleanup idea and never act on it', outcome: `The code stays exactly as messy as it was. Next time someone touches it, they hit the same friction you just noticed.`, lesson: `Noticing an improvement and not tracking it anywhere means the insight is lost the moment you context-switch. If it's not worth doing now, it's worth one line in a backlog somewhere.`, deltaMoney: 0, deltaFocus: 0, skillGain: 1 },
    ],
  },
  {
    id: 'dev-ai-systems', domain: 'ai-systems', source: 'dev',
    title: 'The AI Feature That Works Great in the Demo',
    scenario: `You've wired an LLM call into a feature. It looks impressive in your own testing, but you haven't thought hard about what happens when the model's output is malformed, slow, or just wrong.`,
    options: [
      { label: 'Ship it as-is -- the demo looked great', outcome: `Ships fine for a week. Then the model returns unexpected output shape on an edge-case input and the feature silently breaks for a user.`, lesson: `A demo tests the happy path by construction -- you tried inputs likely to work. Production traffic will find the inputs you didn't think to try.`, deltaMoney: 0, deltaFocus: -3, skillGain: 1 },
      { label: 'Add strict output validation, a timeout, and a graceful fallback before shipping', outcome: `Takes an extra afternoon. When the model does eventually return something malformed, the fallback kicks in and nobody notices.`, lesson: `Treat a model call like any other unreliable external dependency: validate its shape, bound its latency, and always have a fallback path -- because unlike a typed API, its "contract" is a probability, not a guarantee.`, deltaMoney: usdToInr(55), deltaFocus: -4, skillGain: 4 },
      { label: 'Just wrap the call in a generic try/catch and move on', outcome: `The catch prevents a crash, but the user just sees a blank result with no explanation, which reads as broken anyway.`, lesson: `Catching the error isn't the same as handling it well. A caught failure still needs a real fallback or a clear message -- otherwise you've only hidden the crash, not fixed the experience.`, deltaMoney: usdToInr(10), deltaFocus: -1, skillGain: 2 },
    ],
  },
  {
    id: 'dev-security', domain: 'security', source: 'dev',
    title: 'The Endpoint That Trusts the Client a Little Too Much',
    scenario: `Reviewing an API endpoint, you notice it checks permissions in the frontend before making the request, but the backend itself doesn't re-check who's allowed to call it.`,
    options: [
      { label: `Leave it -- the frontend already blocks users who shouldn't see the button`, outcome: `It's fine until someone calls the endpoint directly, bypassing the UI entirely, and gets data they shouldn't.`, lesson: `Frontend checks are a UX convenience, never a security boundary -- anything reachable over the network can be called directly, with or without your UI's permission checks in the way.`, deltaMoney: 0, deltaFocus: -2, skillGain: 1 },
      { label: 'Add the same permission check server-side before doing any work', outcome: `Small change, ships same day. The endpoint is now actually safe, not just UI-safe.`, lesson: `The rule is simple and never optional: every trust decision has to be enforced on the server, because the client is not a place you control.`, deltaMoney: usdToInr(40), deltaFocus: -2, skillGain: 4 },
      { label: `Flag it for later and move on to the current sprint's work`, outcome: `It sits in the backlog. Nothing bad happens this time, but the gap is real for as long as it's open.`, lesson: `A known, unpatched authorization gap doesn't get safer by sitting in a backlog -- if you can't fix it immediately, at minimum it should be loud, not quiet.`, deltaMoney: 0, deltaFocus: -1, skillGain: 2 },
    ],
  },
  {
    id: 'dev-performance', domain: 'performance', source: 'dev',
    title: 'The Page That Feels Slow, Somehow',
    scenario: `A screen "feels sluggish" according to users, but nothing in your manual testing seems obviously slow.`,
    options: [
      { label: `Guess it's the images and start compressing them`, outcome: `The images get smaller. The page still feels exactly as sluggish, because that was never the bottleneck.`, lesson: `Optimizing without measuring is optimizing blind -- you might genuinely improve something, just not the thing that was actually slow.`, deltaMoney: -usdToInr(15), deltaFocus: -3, skillGain: 1 },
      { label: `Profile it first -- check what's actually taking the time before changing anything`, outcome: `The profiler shows a re-render loop firing on every scroll event. One memoization fixes it in twenty minutes.`, lesson: `"Feels slow" is a symptom, not a diagnosis. A profiler turns a vague complaint into a specific, fixable line of code -- always measure before you optimize.`, deltaMoney: usdToInr(50), deltaFocus: -2, skillGain: 4 },
      { label: 'Rewrite the whole component in a "faster" framework pattern, unmeasured', outcome: `The rewrite takes two days and the page feels about the same, because the real cost was never the framework choice.`, lesson: `A big rewrite is an expensive way to fix a problem you haven't actually located yet. Cheap, targeted fixes only exist once you know exactly where the time is going.`, deltaMoney: -usdToInr(60), deltaHealth: -2, skillGain: 2 },
    ],
  },
  {
    id: 'dev-technical-writing', domain: 'technical-writing', source: 'dev',
    title: 'The README Nobody Can Follow',
    scenario: `A new teammate asks how to set up the project locally. The README exists, but it's a wall of unstructured notes from whenever things were added.`,
    options: [
      { label: `Just talk them through it live -- faster than writing anything`, outcome: `It works for them. The next new person asks the exact same questions, live, again.`, lesson: `Verbal knowledge transfer doesn't scale -- every person you talk through it live is a person the documentation still doesn't serve.`, deltaMoney: 0, deltaFocus: -2, skillGain: 1 },
      { label: 'Rewrite the README as numbered setup steps, tested from a clean machine', outcome: `Takes an hour. The next three new hires set up without asking anyone anything.`, lesson: `Good technical writing for a setup guide is boring on purpose: numbered, sequential, and actually re-tested from scratch -- not a narrative, a checklist someone with zero context can follow exactly.`, deltaMoney: usdToInr(35), deltaFocus: -3, skillGain: 4 },
      { label: `Add one line at the top saying "ask in the team chat if stuck"`, outcome: `It technically unblocks people, at the cost of everyone's time in the team chat, repeatedly.`, lesson: `Routing documentation gaps to "just ask someone" moves the cost from "written once" to "answered every time" -- cheaper for you today, more expensive for the team forever.`, deltaMoney: 0, deltaFocus: 0, skillGain: 1 },
    ],
  },
  {
    id: 'biz-negotiation', domain: 'negotiation', source: 'business',
    title: 'A Client Wants a Discount',
    scenario: `A client you're about to sign asks for 20% off your quoted price, citing "budget constraints," before agreeing to anything else.`,
    options: [
      { label: 'Agree immediately to keep the deal moving', outcome: `Deal closes fast, at a noticeably thinner margin -- and the client now expects this to be the real starting price next time too.`, lesson: `The first number you concede sets the anchor for every future negotiation with that client. Fast agreement can look generous, but it's rarely the cheapest way to close.`, deltaMoney: -usdToInr(120), deltaFocus: -1, skillGain: 1 },
      { label: 'Offer a smaller discount in exchange for something else -- a longer contract, or a case study', outcome: `They accept a 10% discount for a 2-month commitment and a testimonial. Effectively a better deal for you than the flat 20% ask.`, lesson: `A negotiation doesn't have to be about price alone -- trading a concession for something else you value (commitment length, referenceability, payment terms) usually beats a straight discount.`, deltaMoney: usdToInr(80), deltaFocus: -3, skillGain: 4 },
      { label: 'Refuse to move at all', outcome: `They walk, citing "budget constraints" as the reason -- and you'll never know if a small, well-traded concession would have kept them.`, lesson: `Refusing to negotiate at all isn't strength, it's just one specific strategy -- and it only works when your position is genuinely that strong. Most of the time it leaves value on the table in both directions.`, deltaMoney: -usdToInr(60), deltaFocus: -2, skillGain: 2 },
    ],
  },
  {
    id: 'biz-requirements', domain: 'requirements', source: 'business',
    title: `The Client Says "Just Make It Like the Other App"`,
    scenario: `A client's entire brief for a new feature is "make it work like [competitor's app]." No further detail offered.`,
    options: [
      { label: 'Build your best guess at what that means and show them', outcome: `You guess wrong on two of the four things that mattered to them. Two rounds of rework follow.`, lesson: `A vague brief taken at face value just moves the ambiguity from the conversation into the build -- and rework is a much more expensive place to resolve it than a follow-up question.`, deltaMoney: -usdToInr(70), deltaFocus: -3, skillGain: 1 },
      { label: `Ask them to walk through exactly what they do in that app and why they like it`, outcome: `Ten minutes of questions reveals they actually only care about one specific flow, not the whole app. You build exactly that.`, lesson: `"Like that other app" is never really the requirement -- there's a specific behavior or feeling behind it. A short, structured round of "what do you do, and why does that matter to you" surfaces the real requirement fast.`, deltaMoney: usdToInr(90), deltaFocus: -2, skillGain: 4 },
      { label: 'Ask them to write a detailed spec themselves before you start', outcome: `They're not equipped to write one, so nothing happens for two weeks, and the relationship cools.`, lesson: `Requirements elicitation is your job, not the client's -- pushing spec-writing back onto a non-technical client usually just stalls the project instead of producing a usable spec.`, deltaMoney: -usdToInr(40), deltaFocus: -1, skillGain: 2 },
    ],
  },
  {
    id: 'biz-public-speaking', domain: 'public-speaking', source: 'business',
    title: `Pitching to a Room That Isn't Technical`,
    scenario: `You're pitching your venture to a small group of potential investors. None of them are engineers.`,
    options: [
      { label: 'Walk them through the architecture to show how solid the engineering is', outcome: `They nod politely and ask almost nothing -- most of the pitch went past them, and the meeting ends without real engagement.`, lesson: `A technical audience and a business audience need different evidence of quality. Architecture depth signals competence to engineers; it reads as noise to people evaluating a market bet.`, deltaMoney: -usdToInr(30), deltaFocus: -3, skillGain: 1 },
      { label: 'Lead with the problem, the market, and one concrete number that shows traction', outcome: `They ask real follow-up questions about growth and timeline -- the pitch lands, whatever the eventual answer.`, lesson: `Pitching non-technical stakeholders means leading with what they can evaluate: problem, market size, traction, unit economics. Save the technical depth for whoever specifically asks for it.`, deltaMoney: usdToInr(60), deltaFocus: -2, skillGain: 4 },
      { label: 'Read the pitch deck slide-by-slide, word for word', outcome: `Nobody in the room is following along by slide six -- reading a deck aloud kills the energy a live pitch is supposed to have.`, lesson: `A pitch deck is meant to support a live pitch, not replace it. Reading it verbatim gives up the one advantage a live pitch has: reacting to the room.`, deltaMoney: -usdToInr(20), deltaFocus: -1, skillGain: 2 },
    ],
  },
  {
    id: 'biz-interviewing', domain: 'interviewing', source: 'business',
    title: 'Hiring Your First Employee',
    scenario: `Your venture is big enough to need real help. A candidate interviews well -- confident, articulate -- but you haven't actually seen them do the work yet.`,
    options: [
      { label: 'Hire based on the interview -- they clearly know how to talk about the work', outcome: `Three weeks in, the actual output doesn't match the interview's confidence. You're now managing a mismatch you could have caught earlier.`, lesson: `Interview performance and job performance are correlated, not identical -- someone can be genuinely excellent at describing work without being equally excellent at doing it.`, deltaMoney: -usdToInr(90), deltaFocus: -3, skillGain: 1 },
      { label: 'Give them a small, real, paid trial task before committing', outcome: `The trial task reveals they're strong in exactly the areas you need, and weaker in one you can work around. You hire with real information.`, lesson: `A small paid trial of real work is one of the highest-signal, lowest-risk things you can do before a hire -- it tests the actual skill, not the ability to talk about the skill.`, deltaMoney: usdToInr(40), deltaFocus: -2, skillGain: 4 },
      { label: `Skip evaluation entirely and hire whoever's available fastest`, outcome: `Fills the seat quickly. Whether it was the right seat for them is now something you'll find out the expensive way.`, lesson: `Speed of hiring and quality of hiring trade off directly -- skipping evaluation to move fast just relocates the cost of a bad fit to later, when it's harder to undo.`, deltaMoney: -usdToInr(50), deltaFocus: -1, skillGain: 2 },
    ],
  },
  {
    id: 'life-personal-finance', domain: 'personal-finance', source: 'life',
    title: 'A Windfall Shows Up',
    scenario: `An unexpectedly good week leaves you with more spare cash than usual sitting in hand.`,
    options: [
      { label: 'Spend it on something nice -- you earned it', outcome: `Feels good for a day. A month later there's nothing to show for it and the same bills are due.`, lesson: `Treating windfall income the same as regular spending money is one of the most common ways extra cash disappears without building anything.`, deltaMoney: -usdToInr(40), deltaHealth: 2, skillGain: 1 },
      { label: 'Put most of it toward savings, keep a little for something small now', outcome: `The balance grows, quietly earning a bit of interest, and you still got to enjoy a small treat.`, lesson: `A windfall is a rare chance to move your baseline forward instead of just your week -- splitting it, mostly saved, a little enjoyed, gets you both the safety net and the payoff.`, deltaMoney: usdToInr(30), deltaFocus: 1, skillGain: 4 },
      { label: 'Put all of it straight into your next venture, no buffer left', outcome: `The venture gets funded a little faster. Any small surprise expense right after now has nowhere to come from.`, lesson: `Investing everything, including your buffer, isn't discipline -- it's removing your own margin for the ordinary bad luck that eventually shows up.`, deltaMoney: 0, deltaHealth: -3, skillGain: 2 },
    ],
  },
  {
    id: 'life-teaching', domain: 'teaching', source: 'life',
    title: 'A Neighbour Asks You to Explain What You Do',
    scenario: `Someone in town, with no technical background at all, genuinely wants to understand what you actually do all day.`,
    options: [
      { label: 'Give the honest, jargon-accurate answer', outcome: `They nod, clearly lost after the second sentence, and the conversation quietly ends.`, lesson: `Accuracy aimed at the wrong audience doesn't land as understanding -- it lands as noise. Being right isn't the same as being clear to the person in front of you.`, deltaMoney: 0, deltaFocus: 0, skillGain: 1 },
      { label: 'Use an analogy from something they already know, then let them ask follow-ups', outcome: `The analogy clicks, they ask a real follow-up question, and the conversation actually goes somewhere.`, lesson: `The core skill of teaching anyone anything is finding the bridge from what they already understand to what's new -- a good analogy does more work than a precise definition.`, deltaMoney: 0, deltaFocus: -1, skillGain: 4 },
      { label: `Say "it's complicated" and change the subject`, outcome: `Conversation moves on smoothly, and nothing was actually shared.`, lesson: `"It's complicated" is true of almost everything and explains nothing -- it's a polite way of declining to teach, which is sometimes fine, but it's worth noticing that's what it is.`, deltaMoney: 0, deltaFocus: 1, skillGain: 1 },
    ],
  },
  {
    id: 'life-public-speaking', domain: 'public-speaking', source: 'life',
    title: 'Asked to Speak at a Small Town Meeting',
    scenario: `A community meeting asks you to say a few words about the businesses opening up around town lately. You have maybe two minutes' notice.`,
    options: [
      { label: 'Freeze up and say something vague and short', outcome: `It's over fast. Nobody remembers what you said, including you.`, lesson: `Under zero preparation time, brevity is fine -- but vague brevity wastes the moment. Even ten seconds of thought toward one concrete point beats improvising nothing.`, deltaMoney: 0, deltaFocus: -2, skillGain: 1 },
      { label: `Pick one concrete, specific thing you've actually noticed, and say just that`, outcome: `One specific, true observation lands better than a longer vague speech would have -- a couple of people follow up afterward.`, lesson: `With no preparation time, the highest-value move is picking one real, specific thing to say instead of trying to cover everything shallowly. Specific and short beats broad and vague.`, deltaMoney: 0, deltaFocus: -1, skillGain: 4 },
      { label: 'Decline to speak', outcome: `Someone else speaks instead. Safe, but a chance to be visible in your own town quietly passes.`, lesson: `Declining is always an option and sometimes the right one -- just notice when it's genuinely the right call versus when it's discomfort making the decision for you.`, deltaMoney: 0, deltaFocus: 1, skillGain: 1 },
    ],
  },
]

// Which domains a background AI-generated challenge is drawn from for a
// given source -- mirrors the hand-written pool's own spread, just without
// being limited to the 12/4/4 that were written by hand.
const DOMAINS_BY_SOURCE: Record<Challenge['source'], SkillDomain[]> = {
  dev: ['architecture', 'code-review', 'debugging', 'legacy-code', 'db-modeling', 'estimation', 'incident-response', 'refactoring', 'ai-systems', 'security', 'performance', 'technical-writing'],
  business: ['negotiation', 'requirements', 'public-speaking', 'interviewing'],
  life: ['personal-finance', 'teaching', 'public-speaking', 'negotiation'],
}
// Human-readable names for the banner/mentor-nudge UI -- SkillDomain ids
// themselves are dash-cased and code-facing.
const DOMAIN_LABEL: Record<SkillDomain, string> = {
  'architecture': 'system architecture',
  'code-review': 'code review',
  'debugging': 'debugging',
  'legacy-code': 'legacy code',
  'db-modeling': 'database modeling',
  'estimation': 'estimation',
  'incident-response': 'incident response',
  'refactoring': 'refactoring',
  'ai-systems': 'AI systems',
  'security': 'security',
  'performance': 'performance',
  'technical-writing': 'technical writing',
  'negotiation': 'negotiation',
  'interviewing': 'interviewing',
  'teaching': 'teaching',
  'requirements': 'requirements gathering',
  'personal-finance': 'personal finance',
  'public-speaking': 'public speaking',
}
const AI_CHALLENGE_POOL_CAP = 10
// v0.20: AI-drafted challenges used to just vanish once used (aiChallengePool
// removes them same as the daily tick always did). This is a second,
// much bigger, never-pruned bank every validated draft also lands in --
// "learnings generated by AI can be stored so it can be used" -- reused
// indefinitely by the daily tick (see _runDailyTick) once the fresh pool
// runs dry, instead of only ever falling back to the small hand-written
// CHALLENGE_POOL.
const CHALLENGE_LIBRARY_CAP = 60
// v0.21: a hard ceiling on how many AI-invented pinned experts a save can
// accumulate -- guards against runaway growth, not a target. In practice
// ensureExpertFor never fires for a domain that already has one (static or
// dynamic), so this can only ever be reached once every domain lacking a
// hand-authored expert (15 of the game's 17) has been given one.
const MAX_DYNAMIC_EXPERTS = 15

// --- Skill feedback into gameplay: real numbers, not just a progress bar.
// Each bundle below is a sum of skill levels across a few related domains,
// fed into a small, capped bonus elsewhere in the store -- efficiency,
// gig/business payouts, sickness odds, loan terms, savings rate. ---
const TECHNICAL_DOMAINS: SkillDomain[] = ['architecture', 'performance', 'refactoring', 'db-modeling', 'code-review', 'legacy-code', 'ai-systems']
const RESILIENCE_DOMAINS: SkillDomain[] = ['debugging', 'incident-response', 'security']
const PEOPLE_DOMAINS: SkillDomain[] = ['negotiation', 'interviewing', 'public-speaking', 'teaching', 'requirements', 'technical-writing']

export function domainSum(skills: Record<string, number>, domains: SkillDomain[]) {
  return domains.reduce((n, d) => n + (skills[d] ?? 0), 0)
}
/** Better engineering practice earns more, on top of the commitment/focus
 *  math -- capped at +15% so it's a real edge, not a way to break the sim. */
export function technicalBonus(skills: Record<string, number>) {
  return Math.min(0.15, domainSum(skills, TECHNICAL_DOMAINS) * 0.004)
}
/** Negotiation, interviewing, teaching etc. pay off in gig and business
 *  income specifically -- capped at +20%. */
export function peopleBonus(skills: Record<string, number>) {
  return Math.min(0.2, domainSum(skills, PEOPLE_DOMAINS) * 0.005)
}
/** Debugging/incident-response/security experience makes the random-sickness
 *  roll less likely to land, down to a floor of 40% of the base chance --
 *  never fully immune, real life still happens. */
export function resilienceFactor(skills: Record<string, number>) {
  return Math.max(0.4, 1 - domainSum(skills, RESILIENCE_DOMAINS) * 0.02)
}
export function financeLevel(skills: Record<string, number>) {
  return skills['personal-finance'] ?? 0
}

/** Turns whatever a local model actually returns for a challenge draft
 *  into a real Challenge, or nothing. The flavor text (title, scenario,
 *  option labels/outcomes/lessons) comes straight from the model; every
 *  numeric consequence is assigned here, safely bounded, so a generated
 *  scenario can never swing money/health/focus further than a
 *  hand-written one could -- the model writes the story, the game still
 *  owns the economy. */
function validateChallenge(raw: unknown, domain: SkillDomain, source: Challenge['source'], difficulty: 'small' | 'big'): Challenge | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 160) return null
  if (typeof r.scenario !== 'string' || !r.scenario.trim() || r.scenario.length > 700) return null
  if (!Array.isArray(r.options) || r.options.length < 2 || r.options.length > 4) return null
  const moneyCap = usdToInr(difficulty === 'big' ? 220 : 90)
  const options: ChallengeOption[] = []
  for (const raw_o of r.options) {
    if (!raw_o || typeof raw_o !== 'object') return null
    const o = raw_o as Record<string, unknown>
    if (typeof o.label !== 'string' || !o.label.trim() || o.label.length > 160) return null
    if (typeof o.outcome !== 'string' || !o.outcome.trim() || o.outcome.length > 450) return null
    if (typeof o.lesson !== 'string' || !o.lesson.trim() || o.lesson.length > 450) return null
    options.push({
      label: o.label.trim().slice(0, 160),
      outcome: o.outcome.trim().slice(0, 450),
      lesson: o.lesson.trim().slice(0, 450),
      deltaMoney: Math.round((Math.random() * 2 - 1) * moneyCap),
      deltaHealth: Math.round((Math.random() * 2 - 1) * (difficulty === 'big' ? 6 : 3)),
      deltaFocus: Math.round((Math.random() * 2 - 1) * (difficulty === 'big' ? 6 : 3)),
      skillGain: (difficulty === 'big' ? 2 : 1) + Math.floor(Math.random() * 3),
    })
  }
  return { id: `ai-${nextId()}`, domain, source, title: r.title.trim().slice(0, 160), scenario: r.scenario.trim().slice(0, 700), options, difficulty, aiGenerated: true }
}

/** Same idea for a Job Board posting the model drafts -- title/flavor from
 *  the model, payout and duration clamped to safe, sane ranges here. */
function validateOpportunity(raw: unknown, kind: OpportunityKind): Omit<Opportunity, 'id' | 'location' | 'postedOnDay' | 'aiGenerated' | 'employer' | 'employerBuildingId' | 'contact'> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 160) return null
  const payoutUsd = typeof r.payoutUsd === 'number' && Number.isFinite(r.payoutUsd) ? r.payoutUsd : 500
  const durationDaysRaw = typeof r.durationDays === 'number' && Number.isFinite(r.durationDays) ? r.durationDays : 3
  const payout = kind === 'freelance' ? usdToInr(Math.max(150, Math.min(2000, payoutUsd))) : 0
  const durationDays = kind === 'freelance' ? Math.max(1, Math.min(7, Math.round(durationDaysRaw))) : 0
  return { kind, title: r.title.trim().slice(0, 160), payout, durationDays }
}

/** Same idea for a book the model drafts for the bookshop -- title/blurb
 *  from the model, price clamped to a safe range here. */
function validateBook(raw: unknown): Book | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120) return null
  if (typeof r.blurb !== 'string' || !r.blurb.trim() || r.blurb.length > 220) return null
  const priceUsd = typeof r.priceUsd === 'number' && Number.isFinite(r.priceUsd) ? r.priceUsd : 8
  const price = usdToInr(Math.max(3, Math.min(25, priceUsd)))
  return { id: `book-ai-${nextId()}`, title: r.title.trim().slice(0, 120), blurb: r.blurb.trim().slice(0, 220), price, aiGenerated: true }
}

/** Same idea for a freshly AI-invented domain expert (see gameStore's
 *  ensureExpertFor) -- name/role/interest/backstory come from the model,
 *  everything that anchors them to the real world (domain, town, building,
 *  sprite, id, the day they showed up) is assigned here from `spot`
 *  (world/residents.ts's pickExpertSpot), never left for the model to
 *  invent. */
function validateDynamicExpert(raw: unknown, domain: SkillDomain, spot: ExpertSpot, day: number): DynamicExpert | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60) return null
  if (typeof r.role !== 'string' || !r.role.trim() || r.role.length > 80) return null
  if (typeof r.interest !== 'string' || !r.interest.trim() || r.interest.length > 120) return null
  if (typeof r.backstory !== 'string' || !r.backstory.trim() || r.backstory.length > 400) return null
  return {
    id: `expert-${nextId()}`,
    name: r.name.trim().slice(0, 60),
    role: r.role.trim().slice(0, 80),
    interest: r.interest.trim().slice(0, 120),
    backstory: r.backstory.trim().slice(0, 400),
    domain,
    location: spot.location,
    buildingId: spot.buildingId,
    sprite: spot.sprite,
    createdOnDay: day,
  }
}

// --- Shared option-ranking, used by both requestJudgment (reacting to a
// picked option) and the free-text answer flow below (mapping an AI-graded
// weak/adequate/strong verdict onto one of the challenge's existing preset
// options, so a free-typed answer still only ever produces numbers the game
// already validated and locked in -- the model classifies quality, it never
// assigns deltas). ---
function optionScore(o: ChallengeOption): number {
  return (o.deltaMoney ?? 0) / 200 + (o.deltaHealth ?? 0) + (o.deltaFocus ?? 0) * 0.5 + o.skillGain * 6
}
function rankOptionsByScore(options: ChallengeOption[]): ChallengeOption[] {
  return [...options].sort((a, b) => optionScore(a) - optionScore(b))
}

// Shared deterministic world, collision map, and interaction points.
export { getTile, hashCoord } from '../world/generation'

// Rewritten this round (v0.24) in the same voice as STORY_ARC below --
// "what do I do next" and "what's the story" were two separate, disconnected
// systems (this quest checklist vs. the flavor-only story beats), which is
// exactly the confusion that prompted this: someone standing in Founders
// Green on day one had a hint banner telling them what to do, but nothing
// that read as one continuous thread. Every hint below keeps its original,
// concrete instruction untouched (still the literal answer to "what do I
// click") and just adds one line in Tam's voice tying it back to her ledger
// -- same character, same thread the story arc already uses. See also
// _completeQuest, which now logs a matching line into `storyLog` itself, so
// Hall of Records shows objectives and story beats interleaved as one feed
// instead of two.
const QUEST_DEFS: Array<Omit<Quest, 'completed'>> = [
  {
    id: 'first-day',
    title: 'Get Your Bearings',
    description: 'Walk into town and see what work is already lined up for you.',
    hint: `Open the Dev Desk -- your steady coding work is already active and paying out each day. Tam, down at the General Store, says everyone's first page in her ledger starts the same way: figuring out where the money's already coming from. Something real will come up the moment you do -- that's the game's way of teaching, not a quiz that shows up out of nowhere.`,
  },
  {
    id: 'first-paycheck',
    title: 'First Paycheck',
    description: 'Make it to day 2 and see your first day of income land.',
    hint: `Just let the clock run -- income is calculated automatically at the start of each new day. Tam says patience is the cheapest thing you'll ever spend in this town.`,
  },
  {
    id: 'try-freelance',
    title: 'Take On Freelance Work',
    description: 'Accept a freelance gig from the Job Board when one appears.',
    hint: `Check the Job Board -- new gigs show up on their own every so often. Accept one. Tam calls freelance work "the town's way of testing whether you can be trusted with someone else's problem, before it trusts you with its own."`,
  },
  {
    id: 'explore-beyond',
    title: 'Step Outside Town',
    description: 'Walk out past the town square and see what the wider world holds.',
    hint: `Right on the World screen, walk with the arrows past the paved town square until you find a marked site, then Investigate it. Not everything in her ledger happened inside town limits, Tam says.`,
  },
  {
    id: 'steady-books',
    title: 'Steady the Books',
    description: `Build up savings of ${formatInr(50000)} or more.`,
    hint: `Keep your dev job running and take freelance work on the side to grow your balance. Tam's watched plenty of names in her ledger get ambitious before they had the cash to back it -- she'd rather you not be one of them.`,
  },
  {
    id: 'first-venture',
    title: 'Found Your First Venture',
    description: `Save up ${formatInr(OFFICE_RENT_STARTUP_COST)} (renting) or ${formatInr(LAND_BUILD_COST)} (buying land) and found your first business.`,
    hint: `Visit Your Ventures once you have enough saved -- pick a town, choose whether to rent an office or buy land and build, then give your business a name. This is the moment Tam actually writes your name down for the first time.`,
  },
  {
    id: 'hire-first-employee',
    title: 'Bring Someone On',
    description: 'Post an opening at one of your businesses and hire a real person from the town it\'s in.',
    hint: `On Your Ventures, post an opening at any business you've founded, then hire one of the real townspeople who show interest. Tam says the ledger changes tone right about here -- it stops being just about you.`,
  },
  {
    id: 'overcommitted',
    title: 'Learn Your Limits',
    description: 'Take on more than you can focus on at once, and feel efficiency drop.',
    hint: `Juggling more than ${FOCUS_CAPACITY} things at once (job + gigs + businesses) spreads your focus thin -- try it and watch the Efficiency number in the header. Tam calls this the lesson everyone in her ledger learns exactly once.`,
  },
  {
    id: 'watch-world',
    title: 'Watch the World Move',
    description: 'Notice a business elsewhere in town open or close on its own.',
    hint: `The town keeps moving whether you watch it or not -- check the Hall of Records for what other people are up to. Tam's ledger was never just about you either, if you hadn't noticed.`,
  },
  {
    id: 'ask-mira',
    title: 'Ask For Guidance',
    description: 'Open Mira, your Forge assistant, and ask her something.',
    hint: `Click the "Ask Mira" button in the corner of any screen. She can see your whole situation and will talk you through it. Even Tam asks Mira things now and then, she'll admit, if you catch her in the right mood.`,
  },
  {
    id: 'first-lesson',
    title: 'Learn Something the Hard Way',
    description: 'Work through a real situation that comes up and see what it teaches you.',
    hint: `Situations get tied to what you're actually doing -- opening the Dev Desk, taking on freelance work, founding a venture, hiring someone, or the story arc itself surfacing one. Watch the objective banner for "Tam has a thought" and take it on when it shows up; that's a real choice with a few genuinely different options. Tam says that's the only kind of lesson that ever actually sticks.`,
  },
]

// v0.26: which quests double as a real trigger for a skill-coaching
// lesson, and which domain/framing that lesson should use -- this is the
// actual fix for "questions occurring randomly won't help the game," per
// direct feedback. A completed quest here queues a challenge (see
// _queueLesson/_completeQuest) instead of anything spawning off a clock.
// Quests with no obvious skill tie-in (first-paycheck, explore-beyond,
// watch-world, ask-mira, and first-lesson itself, which is the *receiving*
// quest -- it completes once any challenge resolves) are left out on
// purpose.
const LESSON_QUESTS: Partial<Record<string, { domain: SkillDomain; context: string }>> = {
  'first-day': { domain: 'debugging', context: 'your first day at the desk' },
  'try-freelance': { domain: 'negotiation', context: 'taking on that freelance work' },
  'first-venture': { domain: 'requirements', context: 'founding your first venture' },
  'hire-first-employee': { domain: 'interviewing', context: 'bringing someone on' },
  'overcommitted': { domain: 'estimation', context: 'finding out how much you can actually carry' },
  'steady-books': { domain: 'personal-finance', context: 'building up those savings' },
}

interface GameState {
  playerName: string | null
  day: number
  hour: number
  minute: number
  simMinutesTotal: number
  money: number
  health: number
  /** Hunger, 0 (full) to 100 (starving). Rises daily; eating brings it
   *  down. Left too high for too long, it starts costing health too. */
  craving: number
  /** Separate from efficiency's commitment-count math -- drains with
   *  active commitments, recovers with rest, and scales efficiency down
   *  further when it's low. */
  focus: number
  /** Skill points earned per domain through resolved challenges (see
   *  Challenge/CHALLENGE_POOL) -- this is the "learning while you play"
   *  progression track. */
  skills: Record<string, number>
  /** A challenge waiting on the player's choice -- at most one at a time. */
  pendingChallenge: Challenge | null
  /** Freshly generated challenges waiting to be surfaced, when a local AI
   *  model is connected -- capped, replenished in the background, and
   *  drawn down first before the hand-written CHALLENGE_POOL. */
  aiChallengePool: Challenge[]
  /** Every validated AI-drafted challenge ever seen, capped but never
   *  pruned when drawn -- unlike aiChallengePool (a consumable queue, one
   *  use each), this is a permanent bank the daily tick reuses once the
   *  fresh pool runs dry, so nothing generated is thrown away. See
   *  CHALLENGE_LIBRARY_CAP. */
  challengeLibrary: Challenge[]
  _aiChallengeLoading: boolean
  _aiOpportunityLoading: boolean
  /** Domain experts the connected local model has invented on the fly (see
   *  ensureExpertFor) -- a real building/town, never a domain already
   *  covered by a hand-authored PINNED_RESIDENTS entry or an existing one
   *  of these. Persisted: once a domain gets one, it keeps them for the
   *  rest of the save. */
  dynamicExperts: DynamicExpert[]
  _expertLoading: boolean
  /** Ask the connected local model (no-op otherwise, always safe to call)
   *  to invent a named expert for `domain` -- fire-and-forget, same
   *  contract as refillAIChallenges. No-op if the domain already has a
   *  static or dynamic expert, or the dynamic-expert cap is reached. */
  ensureExpertFor: (domain: SkillDomain) => void
  /** Fired beats of the background story arc (see STORY_ARC/_checkStoryBeats)
   *  -- a small, ordered narrative thread that advances on its own every
   *  daily tick, regardless of what the player is actively doing. Not a
   *  mode to opt into; it's just always running underneath free play. */
  storyLog: StoryBeat[]
  /** Which STORY_ARC ids have already fired this save, so each one fires
   *  at most once. */
  firedStoryBeats: Record<string, true>
  /** v0.26: a lesson that's been earned by something the player actually
   *  did (a tagged quest completing, or the story arc surfacing one -- see
   *  LESSON_QUESTS/_queueLesson/_checkStoryBeats), waiting for the player
   *  to take it on. Framed as a line of dialogue (`intro`), not a bare
   *  challenge -- shown in the objective banner with a "Take it on"
   *  button. Never set directly alongside pendingChallenge; taking it on
   *  is what promotes it to pendingChallenge and opens the real modal. */
  queuedLesson: { challenge: Challenge; intro: string } | null
  bankLoan: Loan | null
  /** Mira's short, personalized reaction to the option the player just
   *  picked -- generated after the numbers are already locked in, so it's
   *  commentary only and can never itself swing money/health/skill. Null
   *  when no local model is connected, or before it comes back. */
  judgment: string | null
  _judgeLoading: boolean
  /** Global default for how a challenge is answered -- picking from the 3
   *  preset options, or typing a free-text answer instead. Changeable per
   *  challenge in the moment (ChallengeModal's own toggle); this is just
   *  which one a fresh challenge opens with. Set from Mira's settings panel. */
  preferFreeTextChallenges: boolean
  setPreferFreeTextChallenges: (value: boolean) => void
  /** The player's own typed answer to the current pendingChallenge, once
   *  graded -- kept alongside `judgment` (Mira's reaction, reused as-is for
   *  free text) purely for display; resolveChallenge is still what actually
   *  applies numbers, from `freeTextOptionIndex` below. */
  freeTextAnswer: string | null
  /** Which of pendingChallenge's preset options a graded free-text answer
   *  mapped onto -- weak/adequate/strong maps to worst/middle/best by the
   *  same delta-based ranking requestJudgment uses, so a typed answer can
   *  only ever produce numbers an existing option would have. Null before
   *  grading finishes (or if grading hasn't been requested at all). */
  freeTextOptionIndex: number | null
  /** Grade (and, when a local model is connected, a short Mira reaction) a
   *  free-typed answer to the current challenge -- ranks the challenge's
   *  existing options by their locked-in deltas and lands on whichever one
   *  matches the AI's weak/adequate/strong verdict (or the middle option,
   *  unjudged, with no model connected). Never assigns a number itself. */
  gradeFreeTextAnswer: (challenge: Challenge, text: string) => void
  devJobActive: boolean
  businesses: Business[]
  activeGigs: ActiveGig[]
  opportunities: Opportunity[]
  log: LogEntry[]
  running: boolean
  _tickHandle: ReturnType<typeof setInterval> | null

  // world simulation (independent of the player)
  rivalBusinesses: RivalBusiness[]

  // infinite explorable world -- position + per-character seed + what's been found
  playerX: number
  playerY: number
  playerFacing: Facing
  worldSeed: number
  discoveries: Record<string, true>
  inventory: CollectedItem[]
  /** Stock currently on sale at the bookshop -- seeded with the static
   *  fallback titles (world/shopping.ts's STATIC_BOOKS) on a fresh game,
   *  topped back up with AI-drafted titles (refillBookStock) as they get
   *  bought, same "gets generated but then stored or removed" loop as the
   *  Job Board and the AI challenge pool. */
  bookShopStock: Book[]
  _aiBookLoading: boolean
  /** Books the player has bought, kept "at home" -- read from Life & Bank,
   *  never from the shop itself. */
  library: OwnedBook[]
  /** The one book currently being read (an AI quote in flight) -- lets a
   *  stale reply arriving after the player moved on get discarded, same
   *  staleness guard as requestJudgment's `judgment`. */
  _readingBookId: string | null
  contacts: Record<string, { name: string; role: string; meetings: number }>
  meetResident: (id: string, name: string, role: string) => void

  // pinned-resident interaction state -- an explicit escape hatch from the
  // "position is a pure function of the clock" rule, only for a resident a
  // player has just talked to (see ResidentOverride in world/residents.ts).
  // Keyed by resident.id -- small enough it rides along in the autosave too.
  residentOverrides: Record<string, ResidentOverride>
  setResidentOverride: (id: string, override: ResidentOverride) => void

  // onboarding / quest system
  quests: Quest[]
  everOvercommitted: boolean

  // in-game assistant
  assistantOpen: boolean
  miraThinking: boolean
  miraNotice: string
  chat: ChatMessage[]

  createCharacter: (name: string) => void
  resetGame: () => void
  startClock: () => void
  stopClock: () => void
  toggleDevJob: () => void
  startBusiness: (name: string, premises: PremisesType, location: string) => void
  /** Rolls up to APPLICANTS_PER_POSTING real, currently-unemployed
   *  residents from the business's own town and stores them on
   *  Business.applicants, replacing whatever was there before. */
  postOpening: (businessId: string) => void
  hireApplicant: (businessId: string, applicantId: string, workMode: 'onsite' | 'remote') => void
  declineApplicant: (businessId: string, applicantId: string) => void
  fireEmployee: (businessId: string, employeeId: string) => void
  acceptOpportunity: (id: string) => void
  declineOpportunity: (id: string) => void
  eat: (tier: 'cheap' | 'quality') => void
  /** Buy one unit of a world/shopping.ts FOOD_CATALOG item -- only callable
   *  from inside a physical food shop's ShopInterior. Deducts money, stores
   *  the item in `inventory` (same CollectedItem list the world's
   *  collectibles use, category 'food'); eaten later from home. */
  buyFood: (itemId: string) => void
  /** Eat one stored food item from home (Life & Bank's Pantry panel) --
   *  looks its relief/healthBonus up in FOOD_CATALOG by id, decrements (or
   *  removes) it from `inventory`. */
  eatStored: (itemId: string) => void
  /** Buy a book currently in `bookShopStock` -- only callable from inside
   *  the bookshop's ShopInterior. Moves it from the shop's stock into the
   *  player's home `library`. */
  buyBook: (id: string) => void
  /** Read an owned book from home -- appends a short AI-drafted quote/note
   *  when a local model is connected, a hand-written fallback line
   *  otherwise (world/shopping.ts's pickFallbackNote). Flavor text only,
   *  same safety rule as every other AI feature: it can never touch money,
   *  health, focus, or skill. */
  readBook: (id: string) => void
  /** Fire-and-forget, like refillAIChallenges/refillAIOpportunity -- tops
   *  the bookshop's stock back up to BOOK_SHOP_CAP with an AI-drafted title
   *  when a slot's open and a model's connected; a no-op otherwise. */
  refillBookStock: () => void
  takeLoan: (amount: number) => void
  /** Applies a challenge's option (index) for real -- money/health/focus/
   *  skill, in that order, then clears the pending challenge. `freeTextAnswer`
   *  is display-only: when set, the log line records what the player actually
   *  typed instead of the preset option's label (the option's own outcome/
   *  lesson/deltas still apply -- see gradeFreeTextAnswer above). */
  resolveChallenge: (optionIndex: number, freeTextAnswer?: string) => void
  /** Fire-and-forget, like refillAIChallenges -- reacts to the specific
   *  option just picked. Never awaited, never touches game numbers. */
  requestJudgment: (challenge: Challenge, optionIndex: number) => void
  /** Ask the connected local model (no-op, and safe to call freely, when
   *  none is connected) to draft one fresh challenge or Job Board posting
   *  in the background. Fire-and-forget -- never awaited, never blocks
   *  the sim clock or a UI action; results just show up in state once
   *  ready, if they're ever generated at all. */
  refillAIChallenges: () => void
  refillAIOpportunity: () => void
  /** Dev/test tooling -- not part of the story. Skips days instantly by
   *  replaying the same _runDailyTick a real day-rollover would run, so a
   *  fast-forwarded day exercises the exact same logic as playing it out. */
  advanceDays: (days: number) => void
  addMoney: (amount: number) => void
  forceChallenge: () => void
  /** v0.26: turns a queued lesson into the real, live challenge (sets
   *  pendingChallenge, opens the modal) -- the moment the player actually
   *  agrees to take it on, never automatic. No-op if nothing's queued or
   *  a challenge is already up. */
  acceptQueuedLesson: () => void
  /** Clears a queued lesson without taking it on. It just waits for the
   *  next trigger instead -- nothing is lost, nothing forces the issue. */
  dismissQueuedLesson: () => void
  saveToSlot: (slot: string) => void
  loadFromSlot: (slot: string) => void
  deleteSlot: (slot: string) => void
  addLog: (message: string, kind?: 'player' | 'world') => void
  efficiency: () => number
  commitmentCount: () => number
  activeQuest: () => Quest | null
  /** Whichever skill domain, among the ones actually reachable right now
   *  (dev if the day job's active, business if any are running, life
   *  always), has the lowest level -- "what should I focus on learning"
   *  always has an answer, even before any challenge has fired. Powers
   *  the objective banner's learning row and the mentor-nudge chat lines. */
  nextLessonHint: () => { domain: SkillDomain; label: string; level: number } | null
  movePlayer: (dx: number, dy: number) => void
  returnToTown: () => void
  investigateHere: () => void
  openAssistant: () => void
  closeAssistant: () => void
  askMira: (question: string) => Promise<void>
  _checkQuests: () => void
  _completeQuest: (id: string) => void
  /** v0.26: the actual fix for "challenges just happen randomly" -- picks
   *  a challenge in the given domain (AI pool, then the permanent
   *  library, then the static seed pool, same tiers _runDailyTick used
   *  to draw from) and queues it with an in-character `context` line,
   *  instead of anything spawning off a clock. No-op if a lesson's
   *  already queued or a challenge is already pending -- never stacks. */
  _queueLesson: (domain: SkillDomain, context: string) => void
  /** Runs the whole STORY_ARC checklist against live state and fires any
   *  beat whose condition just became true and hasn't fired before --
   *  called unconditionally from every daily tick (see _runDailyTick), so
   *  the storyline keeps moving whether or not the player ever opens the
   *  Chronicle to read it. Deterministic template text, not AI-drafted --
   *  the one story-facing system in the game with no dependency on a
   *  local model being connected. */
  _checkStoryBeats: () => void
  _runDailyTick: (newDay: number) => void
}

/** Every real building any business, rival, or dynamic expert has already
 *  claimed as its premises -- fed to pickPremisesBuilding/pickExpertSpot so
 *  nobody ever doubles up on the same physical spot. */
function claimedBuildingIds(state: GameState): Set<string> {
  const ids = new Set<string>()
  for (const b of state.businesses) if (b.buildingId) ids.add(b.buildingId)
  for (const r of state.rivalBusinesses) if (r.buildingId) ids.add(r.buildingId)
  for (const e of state.dynamicExperts) if (e.buildingId) ids.add(e.buildingId)
  return ids
}

// --- v0.22 (themed in this round): background story arc --------------------
// A small, ordered set of narrative beats layered on top of the free-play
// economy -- "some kind of direction is a must... not a choice, storyline
// can go on even when they play freely." Each beat's condition is checked
// every daily tick (_checkStoryBeats, called unconditionally from
// _runDailyTick) against real, already-tracked state; its text is plain
// string interpolation, deliberately NOT AI-drafted, so the arc always
// advances the same way whether or not a local model is connected -- unlike
// every other AI-enhanced system in the game, this one is never optional.
// Ordered roughly by how quickly a normal playthrough would hit each one,
// though conditions (not order) are what actually decide when a beat fires,
// and every beat fires at most once (see firedStoryBeats).
//
// THEME (picked, per request, over building something else): a grounded
// rise story -- ordinary effort, real setbacks, earned progress -- carrying
// a small running mystery thread underneath it. Tam (the one hand-authored
// pinned resident, PINNED_RESIDENTS above) keeps a ledger of everyone who's
// ever tried to build something in this town; every beat below drops one
// more line about it, and the final beat (day-100-legend) is the payoff --
// no new game mechanic, no new state, just a recurring narrative voice
// riding on the same real milestones every other beat already used.
//
// TO ADD YOUR OWN BEAT: append an object with a unique `id` (this is the
// only thing that must never change once a save has fired it -- it's the
// key `firedStoryBeats` uses to make sure a beat never fires twice),
// a `condition(state)` that reads whatever real fields you want off
// `GameState`, and a `text(state)` returning the line to log. Order in this
// array is cosmetic; only `condition` decides when something fires.
interface StoryArcBeat {
  id: string
  title: string
  condition: (state: GameState) => boolean
  text: (state: GameState) => string
}
const STORY_ARC: StoryArcBeat[] = [
  {
    id: 'settling-in',
    title: 'Settling In',
    condition: (s) => s.day >= 3,
    text: (s) => `A few days into it now, and ${s.playerName ?? 'you'} is finding a rhythm -- ${formatInr(s.money)} banked so far, health at ${s.health.toFixed(0)}%. Down at the General Store, Tam mentions -- half in passing, like it's nothing -- that she's kept a ledger of everyone who's tried to build a life in this town since she was young. "Doesn't hurt to write a name down," she says. "Just in case it means something later."`,
  },
  {
    id: 'first-venture',
    title: 'A Line in the Ledger',
    condition: (s) => s.businesses.length > 0,
    text: (s) => `${s.playerName ?? 'You'} put money down on something real: "${s.businesses[0].name}" in ${s.businesses[0].location}. Word gets to Tam fast in a town this size -- next time you pass the General Store, she's added a line to that ledger of hers without making a thing of it. Whatever else happens now, that name belongs to someone in this world.`,
  },
  {
    id: 'first-hire',
    title: 'Not Alone Anymore',
    condition: (s) => s.businesses.some((b) => (b.employees ?? []).length > 0),
    text: (s) => {
      const biz = s.businesses.find((b) => (b.employees ?? []).length > 0)!
      const person = (biz.employees ?? [])[0]
      return `"${biz.name}" isn't a one-person operation anymore -- ${person.name} is on staff now. Tam, hearing about it, says most of the names in her ledger tried to do it all themselves at first. "The ones who lasted," she adds, not looking up, "mostly didn't stay that way."`
    },
  },
  {
    id: 'rival-noticed',
    title: "Someone Else's Chapter",
    condition: (s) => s.rivalBusinesses.some((r) => !r.closed),
    text: (s) => {
      const rival = s.rivalBusinesses.find((r) => !r.closed)!
      return `Word gets around: "${rival.name}" is open in ${rival.location}, a ${rival.sector} same as anyone else out there hustling. Tam isn't surprised. Her ledger's full of names who showed up within days of each other, she says -- like the town only ever opens up for more than one story at a time.`
    },
  },
  {
    id: 'expert-met',
    title: 'Someone Worth Knowing',
    condition: (s) => s.dynamicExperts.length > 0,
    text: (s) => {
      const expert = s.dynamicExperts[0]
      return `${expert.name} in ${expert.location} has become someone worth knowing -- the person to talk to about ${expert.domain.replace('-', ' ')}. Tam knows the name too, of course. She seems to know most names in this town eventually, one way or another.`
    },
  },
  {
    id: 'skill-rising',
    title: 'Getting Good at Something',
    condition: (s) => Object.values(s.skills).reduce((n, v) => n + v, 0) >= 20,
    text: (s) => {
      const top = Object.entries(s.skills).sort((a, b) => b[1] - a[1])[0]
      return `It's starting to show: ${top ? `${top[0].replace('-', ' ')} most of all` : 'real, hard-won experience'}. None of it came free -- every bit was earned in the middle of something that mattered at the time. Tam says that's the only way any name ever ends up worth remembering in her ledger -- not by planning to be, just by doing the work in front of you, day after day, until it adds up to something.`
    },
  },
  {
    id: 'first-setback',
    title: 'A Rough Patch',
    condition: (s) => s.health <= 40 || s.bankLoan !== null,
    text: (s) => (s.bankLoan
      ? `Cash got tight enough to borrow against the future -- ${formatInr(s.bankLoan.principal)}, paid back a little every day. Tam doesn't blink at that kind of thing. "Half my ledger borrowed at some point," she says. "The other half just hasn't needed to yet."`
      : `Health took a real hit somewhere along the way. Nothing that stops things, but a reminder the grind has a cost even when the bank balance looks fine. Tam mentions, once, that her ledger has more names in it who quit from running themselves ragged than who ever went broke.`),
  },
  {
    id: 'day-14-momentum',
    title: 'Two Weeks In',
    condition: (s) => s.day >= 14,
    text: (s) => `Two weeks in. ${formatInr(s.money)} banked, ${s.businesses.length} business${s.businesses.length === 1 ? '' : 'es'} running, ${Object.keys(s.skills).length} skill${Object.keys(s.skills).length === 1 ? '' : 's'} being built. Tam mentions the ledger goes back further than Founders Green has even had that name -- older than she is, she says, though she won't say by how much, or why she's the one keeping it.`,
  },
  {
    id: 'multiple-ventures',
    title: 'More Than One Thing Going',
    condition: (s) => s.businesses.length >= 2,
    text: (s) => `${s.businesses.length} businesses now, all at once: ${s.businesses.map((b) => `"${b.name}"`).join(', ')}. Juggling this many things has a cost -- focus and efficiency both know it -- but so does never trying. Tam says she's only ever seen a handful of names run more than one line in her ledger at the same time. She doesn't say whether that's a compliment.`,
  },
  {
    id: 'day-30-established',
    title: 'A Month In',
    condition: (s) => s.day >= 30,
    text: (s) => `A month has passed since day one. ${formatInr(s.money)} banked now, health at ${s.health.toFixed(0)}%. Whatever this life is turning into, it's no longer a beginning -- it's just what ${s.playerName ?? 'this person'} does now. Tam's ledger, she mentions, has a page for exactly this point in most people's stories -- the page where it quietly stops being an experiment.`,
  },
  {
    id: 'day-60-veteran',
    title: 'Two Months Running',
    condition: (s) => s.day >= 60,
    text: (s) => `Two months of days like this, one after another. ${s.businesses.length} venture${s.businesses.length === 1 ? '' : 's'} still standing, ${s.rivalBusinesses.filter((r) => !r.closed).length} other${s.rivalBusinesses.filter((r) => !r.closed).length === 1 ? '' : 's'} still out there competing. Tam's stopped commenting on the ledger by now. She just nods when your name comes up in town -- the same way she does for anyone who's made it this far.`,
  },
  {
    id: 'day-100-legend',
    title: 'A Hundred Days',
    condition: (s) => s.day >= 100,
    text: (s) => `A hundred days in this world. ${formatInr(s.money)} banked, ${Object.keys(s.skills).length} skill${Object.keys(s.skills).length === 1 ? '' : 's'} sharpened, ${s.businesses.length} business${s.businesses.length === 1 ? '' : 'es'} carrying ${s.playerName ?? 'this person'}'s name. Ask Tam about the ledger now and she just shrugs, and says the same thing she probably tells everyone eventually: it was never about being the exception. Every name in it got there the same way -- one ordinary day at a time, same as this one. Yours is just the newest.`,
  },
]

function buildMiraReply(state: GameState, questionRaw: string): string {
  const q = questionRaw.toLowerCase()
  const eff = state.efficiency()
  const commitments = state.commitmentCount()
  const quest = state.activeQuest()

  if (/money|afford|save|broke|budget|rich|poor/.test(q)) {
    const gap = OFFICE_RENT_STARTUP_COST - state.money
    if (gap > 0) {
      return `You're sitting on ${formatInr(state.money)} right now. You'd need ${formatInr(gap)} more just to rent an office and found a business (that's ${formatInr(OFFICE_RENT_STARTUP_COST)} upfront, plus ${formatInr(OFFICE_MONTHLY_RENT)}/month after -- buying land instead is ${formatInr(LAND_BUILD_COST)} upfront but no rent, ever). Your dev job alone nets about ${formatInr(DEV_JOB_DAILY_INCOME - DAILY_LIVING_COST)} a day after living costs, so it's a matter of time and staying healthy.`
    }
    return `You've got ${formatInr(state.money)} banked -- that's enough to rent an office and found a business if you haven't already. Just don't spread yourself too thin once you do.`
  }
  if (/efficien|juggl|focus|overcommit|spread|rest|burnout|burn out|exhaust/.test(q)) {
    return `You're currently committed to ${commitments} thing${commitments === 1 ? '' : 's'} (job, gigs, and businesses combined). Anything past ${FOCUS_CAPACITY} at once and your attention gets split -- and on top of that, your focus meter is at ${state.focus.toFixed(0)}%, draining a bit with every active commitment each day and recovering when you ease off. Between the two, your efficiency right now is ${(eff * 100).toFixed(0)}%. Neither is a hard cap, they just mean everything earns less while you're stretched thin or run down.`
  }
  if (/quest|objective|next|what should i do|do next|stuck|help|guidance|direction/.test(q)) {
    if (!quest) return "You've worked through everything I had queued up for you. Keep an eye on the Job Board and the Hall of Records -- the town keeps generating its own opportunities."
    return `Right now I'd point you at "${quest.title}": ${quest.description} ${quest.hint}`
  }
  if (/gig|freelance/.test(q)) {
    if (state.activeGigs.length === 0) return 'No freelance gigs running at the moment. Check the Job Board -- new ones post on their own every so often.'
    return `You've got ${state.activeGigs.length} gig${state.activeGigs.length === 1 ? '' : 's'} running: ${state.activeGigs.map((g) => `"${g.title}" (${g.daysRemaining}d left, ${formatInr(g.payout)} on completion)`).join('; ')}.`
  }
  if (/business|venture|firm|company|start.*shop/.test(q)) {
    if (state.businesses.length === 0) return `You haven't founded anything yet. Renting an office costs ${formatInr(OFFICE_RENT_STARTUP_COST)} upfront plus ${formatInr(OFFICE_MONTHLY_RENT)}/month; buying land and building costs ${formatInr(LAND_BUILD_COST)} upfront with no rent but ${BUILD_DAYS} days of construction first. Either way it earns roughly ${formatInr(BUSINESS_DAILY_REVENUE_BASE)}/day once open, before efficiency is applied.`
    return `You're running ${state.businesses.length} business${state.businesses.length === 1 ? '' : 'es'}: ${state.businesses.map((b) => `"${b.name}" in ${b.location} (${b.premises === 'owned' ? ((b.buildDaysRemaining ?? 0) > 0 ? `still building, ${b.buildDaysRemaining} day${b.buildDaysRemaining === 1 ? '' : 's'} left` : 'owned outright') : `renting, ${formatInr(OFFICE_MONTHLY_RENT)}/mo`})`).join(', ')}. Remember each one you add competes for your focus same as a job or a gig.`
  }
  if (/health|sick|tired/.test(q)) {
    return `Your health is at ${state.health.toFixed(0)}%. There's a small daily chance of getting sick, which costs money and health both, and hunger left too high does the same -- staying under ${FOCUS_CAPACITY} commitments doesn't reduce that risk directly, but keeping your finances stable and eating when you're hungry means a bad day won't sink you.`
  }
  if (/hungry|hunger|craving|food|eat|meal|starv/.test(q)) {
    return `Your hunger is at ${state.craving.toFixed(0)}% (0 is full, 100 is starving) -- it climbs a little every day whether you notice or not. A cheap bite costs ${formatInr(FOOD_CHEAP_COST)} and takes the edge off; a proper meal costs ${formatInr(FOOD_QUALITY_COST)}, clears more of it, and helps your health too. Let it run past ${CRAVING_HEALTH_PENALTY_START}% and it starts costing you health on its own.`
  }
  if (/bank|loan|interest|borrow/.test(q)) {
    if (state.bankLoan) return `You've got an outstanding loan: ${formatInr(state.bankLoan.principal)} total, ${formatInr(state.bankLoan.dailyPayment)}/day for ${state.bankLoan.daysRemaining} more day${state.bankLoan.daysRemaining === 1 ? '' : 's'}.`
    return `A positive balance earns a little interest on its own, every day. You can also borrow against the future if you need cash now -- a loan adds ${(LOAN_INTEREST * 100).toFixed(0)}% interest up front and gets repaid automatically over ${LOAN_TERM_DAYS} days. Only one outstanding at a time.`
  }
  if (/skill|learn|lesson|challenge|situation/.test(q)) {
    const domains = Object.entries(state.skills)
    if (domains.length === 0) return `Nothing learned yet in any specific area. Real situations come up on their own while you work, run a business, or just live -- watch for a popup with a few different choices, and read what it teaches you after you pick. These aren't just for show either: technical skill raises your efficiency, people skills raise gig and business income, and the rest sweeten your loan rate and lower your odds of getting sick.`
    return `You've picked up something in ${domains.length} area${domains.length === 1 ? '' : 's'}: ${domains.map(([d, n]) => `${d} (${n})`).join(', ')}. These actually feed back into your numbers -- your technical skill is currently worth about +${(technicalBonus(state.skills) * 100).toFixed(0)}% efficiency, your people skills about +${(peopleBonus(state.skills) * 100).toFixed(0)}% on gig and business income, and your resilience is cutting your sickness odds to roughly ${(resilienceFactor(state.skills) * 100).toFixed(0)}% of normal.`
  }
  if (/world|rival|competitor|town|other (business|firm|shop)/.test(q)) {
    const rivals = state.rivalBusinesses.filter((r) => !r.closed)
    if (rivals.length === 0) return "The world's quiet right now -- no other businesses currently open that I'm tracking. Check back, they come and go on their own."
    return `Right now ${rivals.length} other business${rivals.length === 1 ? ' is' : 'es are'} open around the world: ${rivals.map((r) => `"${r.name}" in ${r.location} (${r.sector})`).join(', ')}. They open and close on their own, all over the map -- it's not just your economy out there.`
  }
  if (/job\b|dev desk|steady work/.test(q)) {
    return state.devJobActive
      ? `Your dev job is active, bringing in ${formatInr(DEV_JOB_DAILY_INCOME)}/day before efficiency. You can step away from it any time from the Dev Desk if you want to focus elsewhere.`
      : "You've stepped away from your dev job right now. Head to the Dev Desk if you want to pick it back up."
  }
  if (/explore|outside|map|wander|walk around|open world|wider world/.test(q)) {
    const found = Object.keys(state.discoveries).length
    const distFromTown = Math.max(Math.abs(state.playerX), Math.abs(state.playerY))
    if (found === 0) {
      return "The World screen isn't just the town square -- walk past the paved center with the arrows or the D-pad and it keeps generating in every direction. Look for a marked site and Investigate it. It never runs out."
    }
    return `You're ${distFromTown} step${distFromTown === 1 ? '' : 's'} out from the town square right now, and you've found ${found} site${found === 1 ? '' : 's'} out there so far. It keeps generating in every direction -- there's always more if you keep walking.`
  }
  if (/who are you|what are you|mira/.test(q)) {
    return "I'm Mira -- I can see your money, health, commitments, quests, and what's happening elsewhere in town. Ask me about any of it."
  }
  return `Here's where things stand: ${formatInr(state.money)} banked, health at ${state.health.toFixed(0)}%, efficiency ${(eff * 100).toFixed(0)}% across ${commitments} commitment${commitments === 1 ? '' : 's'}. ${quest ? `If you're not sure what's next: "${quest.title}" -- ${quest.hint}` : 'Ask me about money, efficiency, gigs, businesses, health, or the rest of the town.'}`
}

// --- Dev/test snapshots -----------------------------------------------------
// Separate from the main autosave key below -- named checkpoints a player
// (well, just Aravind, testing) can save right before a suspect spot and
// reload after every fix, instead of replaying a whole run from scratch.
const SAVE_SLOT_PREFIX = 'forge-of-one-slot:'

export function listSaveSlots(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(SAVE_SLOT_PREFIX)) out.push(key.slice(SAVE_SLOT_PREFIX.length))
    }
  } catch {
    // localStorage unavailable -- slots just won't show up, nothing crashes
  }
  return out.sort()
}

// Wrapped so a persist failure (quota exceeded, a value JSON can't
// serialize, localStorage unavailable) shows up as a loud console error
// instead of silently just... not saving. If progress ever stops
// surviving a restart again, this is the first thing to check.
const loggedStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch (err) {
      console.error('[forge-of-one] could not read save data:', err)
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
    } catch (err) {
      console.error('[forge-of-one] could not write save data -- progress will NOT survive a restart:', err)
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name)
    } catch (err) {
      console.error('[forge-of-one] could not clear save data:', err)
    }
  },
}))

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
  playerName: null,
  day: 1,
  hour: 8,
  minute: 0,
  simMinutesTotal: 8 * 60,
  money: STARTING_MONEY,
  health: 100,
  craving: 0,
  focus: 100,
  skills: {},
  pendingChallenge: null,
  aiChallengePool: [],
  challengeLibrary: [],
  _aiChallengeLoading: false,
  _aiOpportunityLoading: false,
  dynamicExperts: [],
  _expertLoading: false,
  storyLog: [],
  firedStoryBeats: {},
  queuedLesson: null,
  bankLoan: null,
  judgment: null,
  _judgeLoading: false,
  preferFreeTextChallenges: false,
  freeTextAnswer: null,
  freeTextOptionIndex: null,
  devJobActive: true,
  businesses: [],
  activeGigs: [],
  opportunities: [],
  log: [],
  running: false,
  _tickHandle: null,

  rivalBusinesses: [],

  playerX: 0,
  playerY: 0,
  playerFacing: 'south',
  worldSeed: 1,
  discoveries: {},
  inventory: [],
  bookShopStock: STATIC_BOOKS.slice(),
  _aiBookLoading: false,
  library: [],
  _readingBookId: null,
  contacts: {},
  residentOverrides: {},

  quests: QUEST_DEFS.map((q) => ({ ...q, completed: false })),
  everOvercommitted: false,

  assistantOpen: false,
  miraThinking: false,
  miraNotice: '',
  chat: [
    {
      id: nextId(),
      role: 'mira',
      text: "Hi, I'm Mira. I can see everything going on in your world -- money, health, your quests, even what other businesses in town are up to. Ask me anything, or tap the objective banner up top if you just want to know what's next.",
    },
  ],

  createCharacter: (name) => {
    miraRequest++
    set({ playerName: name, playerX: 0, playerY: 0, playerFacing: 'south', worldSeed: Math.floor(Math.random() * 1_000_000), discoveries: {}, inventory: [], bookShopStock: STATIC_BOOKS.slice(), library: [], contacts: {}, residentOverrides: {}, miraThinking: false, miraNotice: '' })
    get().addLog(`${name} wakes up on day 1 with ${formatInr(STARTING_MONEY)} to their name, ready to start their working life.`)
    // v0.24 fix: this used to complete "Get Your Bearings" right here, the
    // instant a name was typed in -- before the player had done anything at
    // all. With the objective banner now expanded by default (see
    // QuestBanner in App.tsx), that meant the very first thing a new player
    // saw was the SECOND objective ("First Paycheck" -- just wait for day
    // 2), which reads as "nothing to do." Completing it now actually
    // requires opening the Dev Desk (see WorkScreen in App.tsx), matching
    // the quest's own hint literally instead of ticking itself off unseen.
    get().startClock()
    get().refillAIChallenges() // warm the pool up early if AI's already connected
    get().refillAIOpportunity()
  },

  resetGame: () => {
    miraRequest++
    get().stopClock()
    set({
      playerName: null,
      day: 1,
      hour: 8,
      minute: 0,
      simMinutesTotal: 8 * 60,
      money: STARTING_MONEY,
      health: 100,
      craving: 0,
      focus: 100,
      skills: {},
      pendingChallenge: null,
      aiChallengePool: [],
      challengeLibrary: [],
      _aiChallengeLoading: false,
      _aiOpportunityLoading: false,
      dynamicExperts: [],
      _expertLoading: false,
      storyLog: [],
      firedStoryBeats: {},
      queuedLesson: null,
      bankLoan: null,
      judgment: null,
      _judgeLoading: false,
      // preferFreeTextChallenges is a UI preference, not run state -- left
      // out here on purpose so "start over" doesn't reset it.
      freeTextAnswer: null,
      freeTextOptionIndex: null,
      devJobActive: true,
      businesses: [],
      activeGigs: [],
      opportunities: [],
      log: [],
      running: false,
      rivalBusinesses: [],
      playerX: 0,
      playerY: 0,
      playerFacing: 'south',
      worldSeed: 1,
      discoveries: {},
      inventory: [],
      bookShopStock: STATIC_BOOKS.slice(),
      _aiBookLoading: false,
      library: [],
      _readingBookId: null,
      contacts: {},
      residentOverrides: {},
      quests: QUEST_DEFS.map((q) => ({ ...q, completed: false })),
      everOvercommitted: false,
      assistantOpen: false,
      miraThinking: false,
      miraNotice: '',
      chat: [
        {
          id: nextId(),
          role: 'mira',
          text: "Hi, I'm Mira. I can see everything going on in your world -- money, health, your quests, even what other businesses in town are up to. Ask me anything, or tap the objective banner up top if you just want to know what's next.",
        },
      ],
    })
  },

  startClock: () => {
    if (get()._tickHandle) return
    const handle = setInterval(() => {
      const state = get()
      const simMinutesPerTick = SPEED_MULTIPLIER / 60
      const newTotal = state.simMinutesTotal + simMinutesPerTick
      const prevDayIndex = Math.floor(state.simMinutesTotal / 1440)
      const newDayIndex = Math.floor(newTotal / 1440)
      const minuteOfDay = newTotal % 1440
      set({
        simMinutesTotal: newTotal,
        day: newDayIndex + 1,
        hour: Math.floor(minuteOfDay / 60),
        minute: Math.floor(minuteOfDay % 60),
      })
      if (newDayIndex > prevDayIndex) {
        get()._runDailyTick(newDayIndex + 1)
      }
    }, TICK_INTERVAL_MS)
    set({ running: true, _tickHandle: handle })
  },

  stopClock: () => {
    const handle = get()._tickHandle
    if (handle) clearInterval(handle)
    set({ running: false, _tickHandle: null })
  },

  commitmentCount: () => {
    const state = get()
    return (state.devJobActive ? 1 : 0) + state.businesses.length + state.activeGigs.length
  },

  efficiency: () => {
    const state = get()
    const commitments = state.commitmentCount()
    const commitmentFactor = commitments <= FOCUS_CAPACITY ? 1 : FOCUS_CAPACITY / commitments
    // Low focus scales earnings down further, on top of the pure
    // commitment-count math -- never below FOCUS_MIN_MULTIPLIER, so rest
    // matters but can't be the whole story on its own.
    const focusFactor = FOCUS_MIN_MULTIPLIER + (1 - FOCUS_MIN_MULTIPLIER) * (state.focus / 100)
    // Real skill, earned through resolved challenges, is a genuine edge on
    // top of both -- this is the "learning affects the world around you"
    // feedback loop, not just a number on a screen.
    return commitmentFactor * focusFactor * (1 + technicalBonus(state.skills))
  },

  activeQuest: () => {
    return get().quests.find((q) => !q.completed) ?? null
  },

  nextLessonHint: () => {
    const state = get()
    const sources: Challenge['source'][] = ['life']
    if (state.devJobActive) sources.push('dev')
    if (state.businesses.length > 0) sources.push('business')
    const domains = Array.from(new Set(sources.flatMap((src) => DOMAINS_BY_SOURCE[src])))
    if (domains.length === 0) return null
    const ranked = domains.slice().sort((a, b) => (state.skills[a] ?? 0) - (state.skills[b] ?? 0))
    const domain = ranked[0]
    return { domain, label: DOMAIN_LABEL[domain], level: state.skills[domain] ?? 0 }
  },

  movePlayer: (dx, dy) => {
    const state = get()
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) + Math.abs(dy) !== 1) return
    const x = state.playerX + dx, y = state.playerY + dy
    const playerFacing = facingForStep(dx, dy)
    if (!getTile(x, y, state.worldSeed).walkable) { set({ playerFacing }); return }
    set({ playerX: x, playerY: y, playerFacing })
  },

  returnToTown: () => set({ playerX: 0, playerY: 0, playerFacing: 'south' }),

  investigateHere: () => {
    const state = get()
    const interaction = getInteraction(state.playerX, state.playerY, state.worldSeed)
    if (!interaction || interaction.poi.screen) return
    const tile = { poi: interaction.poi }
    const key = `${interaction.point.x},${interaction.point.y}`
    if (state.discoveries[key]) return
    const item = tile.poi.item
    const inventory = item ? state.inventory.some(i => i.id === item.id) ? state.inventory.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i) : [...state.inventory, { ...item, quantity: 1 }] : state.inventory
    set({ discoveries: { ...state.discoveries, [key]: true }, money: state.money + tile.poi.reward, inventory })
    const rewardNote = tile.poi.reward > 0 ? ` You found ${formatInr(tile.poi.reward)}.` : ''
    get().addLog(`${tile.poi.label}: ${tile.poi.flavor}${rewardNote}`, 'world')
    get()._checkQuests()
  },

  toggleDevJob: () => {
    const active = !get().devJobActive
    set({ devJobActive: active })
    get().addLog(active ? 'Took on developer work again.' : 'Stepped away from developer work for now.')
    get()._checkQuests()
  },

  startBusiness: (name, premises, location) => {
    const state = get()
    const cost = premises === 'rented' ? OFFICE_RENT_STARTUP_COST : LAND_BUILD_COST
    if (state.money < cost) {
      get().addLog(`Tried to found "${name}" but didn't have the ${formatInr(cost)} needed to ${premises === 'rented' ? 'rent an office for it' : 'buy the land and build it'}.`)
      return
    }
    // A real, otherwise-unclaimed building in `location` becomes this
    // business's physical premises -- see pickPremisesBuilding's own doc
    // comment for why that's a claim, not an invention. Undefined (rare --
    // the town's genuinely out of eligible slots) just means no map
    // presence, same as every business founded before v0.23.
    const buildingId = pickPremisesBuilding(state.worldSeed, location, claimedBuildingIds(state))
    const business: Business = {
      id: nextId(),
      name,
      dailyRevenueBase: BUSINESS_DAILY_REVENUE_BASE,
      foundedOnDay: state.day,
      premises,
      location,
      employees: [],
      applicants: [],
      ...(buildingId ? { buildingId } : {}),
      ...(premises === 'rented' ? { monthlyRent: OFFICE_MONTHLY_RENT } : { buildDaysRemaining: BUILD_DAYS }),
    }
    set({ money: state.money - cost, businesses: [...state.businesses, business] })
    get().addLog(
      premises === 'rented'
        ? `Founded a new business: "${name}" in ${location} -- rented an office for ${formatInr(cost)}, ${formatInr(OFFICE_MONTHLY_RENT)}/month going forward.`
        : `Founded a new business: "${name}" in ${location} -- bought land and started building for ${formatInr(cost)}. Construction takes ${BUILD_DAYS} days before it opens.`,
    )
    get()._checkQuests()
  },

  postOpening: (businessId) => {
    const state = get()
    const biz = state.businesses.find((b) => b.id === businessId)
    if (!biz) return
    // Nobody already on staff anywhere gets offered a second job at the
    // same time -- one real person, one payroll.
    const employed = new Set(state.businesses.flatMap((b) => (b.employees ?? []).map((e) => e.id)))
    const applicants = pickApplicants(state.worldSeed, biz.location, employed, APPLICANTS_PER_POSTING)
    set({ businesses: state.businesses.map((b) => (b.id === businessId ? { ...b, applicants } : b)) })
    get().addLog(
      applicants.length > 0
        ? `Posted an opening at "${biz.name}" -- ${applicants.length} ${applicants.length === 1 ? 'person' : 'people'} in ${biz.location} showed interest: ${applicants.map((a) => a.name).join(', ')}.`
        : `Posted an opening at "${biz.name}", but nobody in ${biz.location} was free to take it right now.`,
    )
  },

  hireApplicant: (businessId, applicantId, workMode) => {
    const state = get()
    const biz = state.businesses.find((b) => b.id === businessId)
    const applicant = biz?.applicants?.find((a) => a.id === applicantId)
    if (!biz || !applicant) return
    if ((biz.employees ?? []).length >= MAX_EMPLOYEES_PER_BUSINESS) {
      get().addLog(`"${biz.name}" doesn't have room for another hire right now.`)
      return
    }
    const dailyWage = Math.round(EMPLOYEE_WAGE_MIN + Math.random() * EMPLOYEE_WAGE_RANGE)
    const dailyRevenueBonus = Math.round(dailyWage * (EMPLOYEE_REVENUE_MULTIPLIER_MIN + Math.random() * EMPLOYEE_REVENUE_MULTIPLIER_RANGE))
    const employee: Employee = { id: applicant.id, name: applicant.name, role: applicant.role, hiredOnDay: state.day, dailyWage, dailyRevenueBonus, sprite: applicant.sprite, workMode }
    set({
      businesses: state.businesses.map((b) =>
        b.id === businessId
          ? { ...b, employees: [...(b.employees ?? []), employee], applicants: (b.applicants ?? []).filter((a) => a.id !== applicantId) }
          : b,
      ),
    })
    get().addLog(`Hired ${applicant.name} at "${biz.name}" -- ${formatInr(dailyWage)}/day, ${workMode === 'onsite' ? 'working onsite' : 'working remotely'}.`)
    get()._completeQuest('hire-first-employee')
    get()._checkQuests()
  },

  declineApplicant: (businessId, applicantId) => {
    set({
      businesses: get().businesses.map((b) =>
        b.id === businessId ? { ...b, applicants: (b.applicants ?? []).filter((a) => a.id !== applicantId) } : b,
      ),
    })
  },

  fireEmployee: (businessId, employeeId) => {
    const state = get()
    const biz = state.businesses.find((b) => b.id === businessId)
    const employee = biz?.employees?.find((e) => e.id === employeeId)
    if (!biz || !employee) return
    set({ businesses: state.businesses.map((b) => (b.id === businessId ? { ...b, employees: (b.employees ?? []).filter((e) => e.id !== employeeId) } : b)) })
    get().addLog(`Let ${employee.name} go from "${biz.name}".`)
  },

  acceptOpportunity: (id) => {
    const state = get()
    const opp = state.opportunities.find((o) => o.id === id)
    if (!opp) return
    const remaining = state.opportunities.filter((o) => o.id !== id)
    if (opp.kind === 'freelance') {
      const gig: ActiveGig = { ...opp, daysRemaining: opp.durationDays }
      set({ opportunities: remaining, activeGigs: [...state.activeGigs, gig] })
      get().addLog(`Accepted freelance gig: "${opp.title}"${opp.employer ? ` for ${opp.employer}` : ''} (${formatInr(opp.payout)} on completion).`)
      get()._completeQuest('try-freelance')
    } else if (opp.kind === 'job') {
      set({ opportunities: remaining, devJobActive: true })
      get().addLog(`Accepted job offer: "${opp.title}"${opp.employer ? ` at ${opp.employer}` : ''}${opp.contact ? `, reporting to ${opp.contact}` : ''}.`)
    } else {
      set({ opportunities: remaining })
      // A co-founding opportunity posted through the Job Board skips the
      // rent-vs-buy choice -- it's someone else's studio inviting you in,
      // already renting a space, in whatever town it posted from.
      get().startBusiness(opp.title.replace('Opportunity: ', ''), 'rented', opp.location ?? pickRandomTown(state.worldSeed))
    }
    get()._checkQuests()
    get().refillAIOpportunity() // there's room again -- top the board back up if AI is connected
  },

  declineOpportunity: (id) => {
    set({ opportunities: get().opportunities.filter((o) => o.id !== id) })
    get().refillAIOpportunity() // there's room again -- top the board back up if AI is connected
  },

  eat: (tier) => {
    const state = get()
    const cost = tier === 'cheap' ? FOOD_CHEAP_COST : FOOD_QUALITY_COST
    const relief = tier === 'cheap' ? FOOD_CHEAP_RELIEF : FOOD_QUALITY_RELIEF
    if (state.money < cost) {
      get().addLog(`Wanted a ${tier === 'cheap' ? 'quick bite' : 'proper meal'} but couldn't spare the ${formatInr(cost)}.`)
      return
    }
    const health = tier === 'quality' ? Math.min(100, state.health + FOOD_QUALITY_HEALTH_BONUS) : state.health
    set({ money: state.money - cost, craving: Math.max(0, state.craving - relief), health })
    get().addLog(tier === 'cheap' ? `Grabbed a quick, cheap bite for ${formatInr(cost)}.` : `Sat down for a proper meal for ${formatInr(cost)} -- felt noticeably better after.`)
  },

  buyFood: (itemId) => {
    const state = get()
    const food = FOOD_CATALOG.find(f => f.id === itemId)
    if (!food) return
    if (state.money < food.price) {
      get().addLog(`Wanted ${food.name} but couldn't spare the ${formatInr(food.price)}.`)
      return
    }
    const inventory = state.inventory.some(i => i.id === food.id)
      ? state.inventory.map(i => i.id === food.id ? { ...i, quantity: i.quantity + 1 } : i)
      : [...state.inventory, { id: food.id, name: food.name, category: 'food' as const, description: food.description, quantity: 1 }]
    set({ money: state.money - food.price, inventory })
    get().addLog(`Bought ${food.name} for ${formatInr(food.price)} -- stored at home.`)
  },

  eatStored: (itemId) => {
    const state = get()
    const owned = state.inventory.find(i => i.id === itemId && i.category === 'food')
    const food = FOOD_CATALOG.find(f => f.id === itemId)
    if (!owned || !food) return
    const inventory = owned.quantity > 1
      ? state.inventory.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i)
      : state.inventory.filter(i => i.id !== itemId)
    const health = food.healthBonus ? Math.min(100, state.health + food.healthBonus) : state.health
    set({ inventory, craving: Math.max(0, state.craving - food.relief), health })
    get().addLog(`Ate ${food.name} from home stock -- the hunger eased a bit.`)
  },

  takeLoan: (amount) => {
    const state = get()
    if (state.bankLoan) {
      get().addLog('Tried to take a loan but already had one outstanding -- pay that off first.')
      return
    }
    if (amount <= 0) return
    // Personal-finance skill negotiates a better rate, down to a floor of 3%.
    const rate = Math.max(0.03, LOAN_INTEREST - financeLevel(state.skills) * 0.005)
    const principal = Math.round(amount * (1 + rate))
    const loan: Loan = { principal, dailyPayment: Math.round(principal / LOAN_TERM_DAYS), daysRemaining: LOAN_TERM_DAYS }
    set({ money: state.money + amount, bankLoan: loan })
    get().addLog(`Took a loan of ${formatInr(amount)} from the bank -- ${formatInr(principal)} to repay over ${LOAN_TERM_DAYS} days.`)
  },

  resolveChallenge: (optionIndex, freeTextAnswer) => {
    const state = get()
    const challenge = state.pendingChallenge
    if (!challenge) return
    const option = challenge.options[optionIndex]
    if (!option) return
    const money = state.money + (option.deltaMoney ?? 0)
    const health = Math.max(0, Math.min(100, state.health + (option.deltaHealth ?? 0)))
    const focus = Math.max(0, Math.min(100, state.focus + (option.deltaFocus ?? 0)))
    const skills = { ...state.skills, [challenge.domain]: (state.skills[challenge.domain] ?? 0) + option.skillGain }
    set({ money, health, focus, skills, pendingChallenge: null, judgment: null, _judgeLoading: false, freeTextAnswer: null, freeTextOptionIndex: null })
    get().addLog(freeTextAnswer
      ? `${challenge.title} -- answered in their own words: "${freeTextAnswer}". ${option.outcome} Lesson: ${option.lesson}`
      : `${challenge.title} -- chose: "${option.label}". ${option.outcome} Lesson: ${option.lesson}`)
    get()._checkQuests()
    get().refillAIChallenges() // replenish right away, not just on the next daily tick
  },

  setPreferFreeTextChallenges: (value) => set({ preferFreeTextChallenges: value }),

  gradeFreeTextAnswer: (challenge, text) => {
    const trimmed = text.trim().slice(0, 600)
    if (!trimmed || get().pendingChallenge !== challenge) return
    const ranked = rankOptionsByScore(challenge.options)
    const mid = ranked[Math.floor((ranked.length - 1) / 2)]
    set({ freeTextAnswer: trimmed, freeTextOptionIndex: null, judgment: null, _judgeLoading: false })
    if (!aiReady()) {
      // No model to judge quality -- land on the middle-ranked option, a
      // neutral, safe default rather than guessing at quality from keywords.
      set({ freeTextOptionIndex: challenge.options.indexOf(mid) })
      return
    }
    set({ _judgeLoading: true })
    void (async () => {
      try {
        const level = get().skills[challenge.domain] ?? 0
        const system = `You are Mira, a blunt, encouraging in-game mentor coaching a working developer and entrepreneur through a life-sim. Domain: ${challenge.domain}. The player's current skill level in this domain is ${level} (roughly 0-20+, higher is more experienced). Instead of picking one of the preset options, they typed their own answer to the scenario. First classify its quality for this specific situation -- judge the substance of what they wrote, not its length or grammar -- as weak, adequate, or strong. Then react to it in 2-3 short sentences, same as you would to a picked option: reinforce good judgment if it's strong, or explain what the miss costs them if it's weak, tying it to the real domain concept. Do not repeat the scenario back to them. Do not invent new numbers, rules, or consequences; the game applies those itself from your grade. Never mention being an AI, a model, or a game. Reply with exactly one JSON object, nothing else: {"grade": "weak" | "adequate" | "strong", "comment": string}`
        const user = `Scenario: ${challenge.scenario}
The preset approaches were: ${challenge.options.map((o, i) => `${i + 1}. ${o.label}`).join(' | ')}
The player instead wrote their own answer: "${trimmed}"`
        const raw = await generateJSON(system, user, 260)
        const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
        const grade = r && typeof r.grade === 'string' && (r.grade === 'weak' || r.grade === 'adequate' || r.grade === 'strong') ? r.grade : 'adequate'
        const comment = r && typeof r.comment === 'string' && r.comment.trim() ? r.comment.trim().slice(0, 500) : null
        const picked = grade === 'weak' ? ranked[0] : grade === 'strong' ? ranked[ranked.length - 1] : mid
        // Only apply if the player's still looking at this same challenge --
        // they may have already moved on by the time this comes back.
        if (get().pendingChallenge === challenge) set({ freeTextOptionIndex: challenge.options.indexOf(picked), judgment: comment })
      } catch {
        if (get().pendingChallenge === challenge) set({ freeTextOptionIndex: challenge.options.indexOf(mid) })
      } finally {
        if (get().pendingChallenge === challenge) set({ _judgeLoading: false })
      }
    })()
  },

  requestJudgment: (challenge, optionIndex) => {
    set({ judgment: null, _judgeLoading: false })
    if (!aiReady()) return
    set({ _judgeLoading: true })
    void (async () => {
      try {
        const option = challenge.options[optionIndex]
        if (!option) return
        // Rank the picked option against its siblings using the same
        // deltas the game already validated and locked in -- the judge
        // reacts to a verdict the game computed, it never invents one.
        const scores = challenge.options.map(optionScore)
        const pickedScore = optionScore(option)
        const best = Math.max(...scores)
        const worst = Math.min(...scores)
        const rank = pickedScore >= best ? 'the strongest option on offer' : pickedScore <= worst ? 'the weakest option on offer' : 'a middle-of-the-road option'
        const level = get().skills[challenge.domain] ?? 0
        const system = `You are Mira, a blunt, encouraging in-game mentor coaching a working developer and entrepreneur through a life-sim. Domain: ${challenge.domain}. The player's current skill level in this domain is ${level} (roughly 0-20+, higher is more experienced). They just picked ${rank} for the scenario below. React to THEIR specific choice in 2-3 short sentences: reinforce good judgment if they picked well, or explain what the miss costs them if they didn't, tying it to the real domain concept -- not generic encouragement. Do not repeat the scenario back to them. Do not invent new numbers, rules, or consequences; the game already applied those. Never mention being an AI, a model, or a game. Reply with exactly one JSON object, nothing else: {"comment": string}`
        const user = `Scenario: ${challenge.scenario}
Options were: ${challenge.options.map((o, i) => `${i + 1}. ${o.label}`).join(' | ')}
They picked: "${option.label}"
Outcome: ${option.outcome}`
        const raw = await generateJSON(system, user, 220)
        const comment = raw && typeof raw === 'object' && typeof (raw as { comment?: unknown }).comment === 'string' ? (raw as { comment: string }).comment.trim().slice(0, 500) : null
        // Only apply if the player's still looking at this same challenge --
        // they may have already moved on by the time this comes back.
        if (comment && get().pendingChallenge === challenge) set({ judgment: comment })
      } finally {
        set({ _judgeLoading: false })
      }
    })()
  },

  refillAIChallenges: () => {
    const state = get()
    if (state._aiChallengeLoading || !aiReady() || state.aiChallengePool.length >= AI_CHALLENGE_POOL_CAP) return
    set({ _aiChallengeLoading: true })
    void (async () => {
      try {
        // Weight toward whatever's actually active right now, same spread
        // as the daily-tick spawn roll below, so background generation
        // tracks what the player is doing rather than firing blind.
        const sourcePool: Challenge['source'][] = ['life']
        if (state.devJobActive) sourcePool.push('dev', 'dev')
        if (state.businesses.length > 0) sourcePool.push('business', 'business')
        const source = sourcePool[Math.floor(Math.random() * sourcePool.length)]
        const domains = DOMAINS_BY_SOURCE[source]
        // Bias toward whichever of those domains has seen the least play --
        // "based on previous gameplay and completion state," not uniform.
        const ranked = domains.slice().sort((a, b) => (state.skills[a] ?? 0) - (state.skills[b] ?? 0))
        const candidates = ranked.slice(0, Math.min(3, ranked.length))
        const domain = candidates[Math.floor(Math.random() * candidates.length)]
        const level = state.skills[domain] ?? 0
        const difficulty: 'small' | 'big' = level >= 6 ? 'big' : 'small'
        // If a pinned character is tagged as this domain's expert (see
        // PinnedResident.expertise in residents.ts), name them in the
        // scenario instead of an anonymous coworker -- "story based,
        // given by scenario and people we work with," not a blind quiz.
        // A hand-authored expert (PINNED_RESIDENTS) always wins if one
        // exists; otherwise fall back to an AI-invented one already
        // created for this domain (see ensureExpertFor). If neither exists
        // yet, fire off a request to invent one -- fire-and-forget, same
        // as this whole function; the scenario just runs anonymous this
        // time and names them from now on once it comes back.
        const dynamicExpert = state.dynamicExperts.find((e) => e.domain === domain)
        const expert = expertFor(domain) ?? dynamicExpert
        if (!expert) get().ensureExpertFor(domain)
        const expertNote = expert
          ? ` The scenario should involve ${expert.name}, a ${expert.role.toLowerCase()} the player knows (interested in ${expert.interest}${expert.backstory ? `; ${expert.backstory}` : ''}), as a specific person in the scene -- refer to them by name, written consistently with that background. Do not put words in their mouth beyond what the scene needs.`
          : ''
        // "Story based, given by scenario and people we work with" also
        // means real PLACES, not just people -- ground the scene in an
        // actual town from the generated world, and, when it fits the
        // source, the player's own named business or rival businesses
        // already active out there. Never invents a place; only ever
        // reuses what the world/economy simulation already generated.
        const town = locationName(state.playerX, state.playerY, state.worldSeed)
        const activeBusiness = source === 'business' ? state.businesses[Math.floor(Math.random() * state.businesses.length)] : undefined
        const rival = state.rivalBusinesses.find(r => !r.closed)
        const placeNote = activeBusiness
          ? ` Set the scene at the player's own business, "${activeBusiness.name}" in ${activeBusiness.location} -- name it, don't stay abstract.${rival ? ` A rival business, "${rival.name}" (${rival.sector}), is active nearby if it's useful to the situation.` : ''}`
          : ` Set the scene concretely in or around ${town}, where the player lives and works -- name the town rather than staying abstract.`
        const system = `You write short scenario cards for a life-sim game about a working developer and entrepreneur. Domain: ${domain}. Reply with exactly one JSON object, nothing else, shaped like: {"title": string (max 8 words), "scenario": string (2-3 sentences, a concrete situation, no advice yet), "options": array of exactly 3 objects {"label": string (an action, under 15 words), "outcome": string (1-2 sentences, what happens), "lesson": string (1-2 sentences, a specific, non-generic lesson written for an experienced professional, not a beginner)}. The 3 options must be genuinely different approaches, not a right-answer quiz. This should read like a real situation involving real people and places the player knows, not an abstract quiz question.${placeNote}${expertNote} ${difficulty === 'big' ? 'Make this a bigger, higher-stakes situation with real consequences.' : 'Keep it small and everyday.'} Never mention being an AI, a model, or a game.`
        const raw = await generateJSON(system, 'Write the scenario now, as JSON only.', 550)
        const challenge = validateChallenge(raw, domain, source, difficulty)
        if (challenge) {
          const pool = [...get().aiChallengePool, challenge].slice(-AI_CHALLENGE_POOL_CAP)
          // Also banked permanently in challengeLibrary -- unlike `pool`,
          // never pruned when one gets drawn, so nothing generated here is
          // ever thrown away.
          const library = [...get().challengeLibrary, challenge].slice(-CHALLENGE_LIBRARY_CAP)
          set({ aiChallengePool: pool, challengeLibrary: library })
        }
      } finally {
        set({ _aiChallengeLoading: false })
      }
    })()
  },

  refillAIOpportunity: () => {
    const state = get()
    if (state._aiOpportunityLoading || !aiReady() || state.opportunities.length >= MAX_OPEN_OPPORTUNITIES) return
    set({ _aiOpportunityLoading: true })
    void (async () => {
      try {
        const roll = Math.random()
        const kind: OpportunityKind = roll < 0.55 ? 'freelance' : roll < 0.85 ? 'job' : 'business'
        // Job/freelance postings are picked from a real, already-generated
        // company or person before the model ever sees a prompt -- same
        // grounding trick as refillAIChallenges' placeNote. The model only
        // drafts flavor text around a real name and place; it never
        // invents the employer itself. If no eligible one exists this
        // roll (rare), bail quietly rather than posting something abstract.
        const employerInfo = kind === 'business' ? undefined : pickEmployer(get().worldSeed, kind)
        if (kind !== 'business' && !employerInfo) return
        const strongest = Object.entries(get().skills).sort((a, b) => b[1] - a[1])[0]?.[0]
        const employerNote = employerInfo
          ? kind === 'job'
            ? ` The employer is a real business called "${employerInfo.employer}" in ${employerInfo.location}${employerInfo.contact ? `, and the player would report to ${employerInfo.contact}` : ''} -- name it in the title, don't stay abstract.`
            : ` The client is a real person named ${employerInfo.employer}, based in ${employerInfo.location} -- name them in the title, don't stay abstract.`
          : ''
        const system = `You write one short, realistic Job Board posting for a life-sim game about a working developer and entrepreneur economy. Kind: ${kind}.${employerNote} ${strongest ? `The player happens to be notably skilled at ${strongest} -- a posting that plays to that is a nice touch but not required.` : ''} Reply with exactly one JSON object, nothing else: {"title": string, under 12 words, starting with "Freelance:" for a freelance posting, "Job offer:" for a job, or "Opportunity:" for a business one, matching the kind given, "payoutUsd": number (200-1500 for freelance, 0 otherwise), "durationDays": number (1-6 for freelance, 0 otherwise)}. Never mention being an AI, a model, or a game.`
        const raw = await generateJSON(system, 'Write the posting now, as JSON only.', 150)
        const posting = validateOpportunity(raw, kind)
        const current = get().opportunities
        if (posting && current.length < MAX_OPEN_OPPORTUNITIES) {
          const location = employerInfo ? employerInfo.location : pickRandomTown(get().worldSeed)
          set({ opportunities: [...current, { ...posting, id: `ai-${nextId()}`, location, employer: employerInfo?.employer, employerBuildingId: employerInfo?.employerBuildingId, contact: employerInfo?.contact, postedOnDay: get().day, aiGenerated: true }] })
          get().addLog(`A new posting appeared on the Job Board: "${posting.title}".`)
        }
      } finally {
        set({ _aiOpportunityLoading: false })
      }
    })()
  },

  ensureExpertFor: (domain) => {
    const state = get()
    if (state._expertLoading || !aiReady()) return
    if (expertFor(domain) || state.dynamicExperts.some((e) => e.domain === domain)) return
    if (state.dynamicExperts.length >= MAX_DYNAMIC_EXPERTS) return
    const spot = pickExpertSpot(state.worldSeed, claimedBuildingIds(state))
    if (!spot) return
    set({ _expertLoading: true })
    void (async () => {
      try {
        const system = `You are inventing a new named character for a life-sim game about a working developer and entrepreneur economy. This character is the resident go-to expert on: ${domain}. They live and can be found in ${spot.location}. Reply with exactly one JSON object, nothing else: {"name": string, "role": string (their job/title, under 8 words), "interest": string (what they're personally into, under 12 words), "backstory": string (1-2 sentences, grounded and specific, not generic)}. Never mention being an AI, a model, or a game.`
        const raw = await generateJSON(system, 'Invent the character now, as JSON only.', 220)
        const expert = validateDynamicExpert(raw, domain, spot, get().day)
        if (expert) {
          set({ dynamicExperts: [...get().dynamicExperts, expert] })
          get().addLog(`You've gotten to know ${expert.name}, ${expert.role.toLowerCase()} in ${expert.location} -- the person to talk to about ${domain.replace('-', ' ')}.`, 'world')
        }
      } finally {
        set({ _expertLoading: false })
      }
    })()
  },

  buyBook: (id) => {
    const state = get()
    const book = state.bookShopStock.find(b => b.id === id)
    if (!book) return
    if (state.money < book.price) {
      get().addLog(`Wanted "${book.title}" but couldn't spare the ${formatInr(book.price)}.`)
      return
    }
    const owned: OwnedBook = { ...book, notes: [] }
    set({ money: state.money - book.price, bookShopStock: state.bookShopStock.filter(b => b.id !== id), library: [...state.library, owned] })
    get().addLog(`Bought "${book.title}" for ${formatInr(book.price)} -- added to your library at home.`)
    get().refillBookStock() // there's room again -- top the shelf back up if AI is connected
  },

  readBook: (id) => {
    const state = get()
    const book = state.library.find(b => b.id === id)
    if (!book) return
    if (!aiReady()) {
      const note = pickFallbackNote(book.title)
      set({ library: get().library.map(b => b.id === id ? { ...b, notes: [...b.notes, note].slice(-6) } : b) })
      get().addLog(`Read a bit of "${book.title}" and jotted down a note.`)
      return
    }
    set({ _readingBookId: id })
    void (async () => {
      try {
        const system = `You are quoting from a fictional book in a life-sim game. Book title: "${book.title}". ${book.blurb ? `About: ${book.blurb}` : ''} Write one short, quotable line (under 25 words) that could plausibly appear in this book -- a genuine-sounding quote or reflective note a reader might jot down, not a summary. Reply with exactly one JSON object, nothing else: {"note": string}. Never mention being an AI, a model, or a game.`
        const raw = await generateJSON(system, 'Write the quote now, as JSON only.', 100)
        const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
        const note = r && typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 240) : pickFallbackNote(book.title)
        // Only apply if the player hasn't moved on from this book by the
        // time the reply comes back -- same staleness guard as the judge.
        if (get()._readingBookId === id) {
          set({ library: get().library.map(b => b.id === id ? { ...b, notes: [...b.notes, note].slice(-6) } : b) })
          get().addLog(`Read a bit of "${book.title}" and jotted down a note.`)
        }
      } finally {
        if (get()._readingBookId === id) set({ _readingBookId: null })
      }
    })()
  },

  refillBookStock: () => {
    const state = get()
    if (state._aiBookLoading || !aiReady() || state.bookShopStock.length >= BOOK_SHOP_CAP) return
    set({ _aiBookLoading: true })
    void (async () => {
      try {
        const system = `You write short original book titles and one-sentence blurbs for a cozy bookshop in a life-sim game about a working developer and entrepreneur. Reply with exactly one JSON object, nothing else: {"title": string (under 10 words), "blurb": string (1 sentence, under 30 words), "priceUsd": number (4-20)}. Never mention being an AI, a model, or a game. Titles should feel like real book titles across a mix of genres -- fiction, memoir, practical/business, poetry -- not all the same kind.`
        const raw = await generateJSON(system, 'Write the book now, as JSON only.', 150)
        const book = validateBook(raw)
        if (book && get().bookShopStock.length < BOOK_SHOP_CAP) set({ bookShopStock: [...get().bookShopStock, book] })
      } finally {
        set({ _aiBookLoading: false })
      }
    })()
  },

  addLog: (message, kind = 'player') => {
    const state = get()
    const entry: LogEntry = { id: nextId(), day: state.day, message, kind }
    set({ log: [entry, ...state.log].slice(0, 60) })
  },

  meetResident: (id, name, role) => {
    const contacts = get().contacts
    set({ contacts: { ...contacts, [id]: { name, role, meetings: (contacts[id]?.meetings ?? 0) + 1 } } })
  },

  setResidentOverride: (id, override) => {
    set({ residentOverrides: { ...get().residentOverrides, [id]: override } })
  },

  openAssistant: () => set({ assistantOpen: true }),
  closeAssistant: () => set({ assistantOpen: false }),

  askMira: async (question) => {
    const trimmed = question.trim().slice(0, 1500)
    if (!trimmed || get().miraThinking) return
    const state = get(), request = ++miraRequest
    const playerMsg: ChatMessage = { id: nextId(), role: 'player', text: trimmed }
    const messages = [...state.chat, playerMsg].slice(-20)
    set({ chat: messages, miraThinking: true, miraNotice: '' })
    const context = { player: state.playerName, day: state.day, hour: state.hour, moneyINR: Math.round(state.money), health: state.health, craving: state.craving, focus: state.focus, bankLoan: state.bankLoan, skills: state.skills, efficiency: state.efficiency(), commitments: state.commitmentCount(), jobActive: state.devJobActive, officeRentStartupINR: OFFICE_RENT_STARTUP_COST, officeMonthlyRentINR: OFFICE_MONTHLY_RENT, landBuildCostINR: LAND_BUILD_COST, buildDays: BUILD_DAYS, businesses: state.businesses.map(b => ({ name: b.name, location: b.location, premises: b.premises })), gigs: state.activeGigs.map(g => ({ title: g.title, days: g.daysRemaining })), quest: state.activeQuest(), inventory: state.inventory.map(i => i.name), neighboursMet: Object.keys(state.contacts).length }
    const reply = await conversationReply(`You are Mira, the warm, practical companion in Forge of One, an offline career and community life-sim. Speak in 2-4 concise sentences. Help with careers, planning, focus, exploring, and learning. Use only this live game state for facts: ${JSON.stringify(context)}. Currency is INR. Current game actions are work, freelance opportunities, businesses, exploring, collecting items, and talking to neighbours. Do not claim to perform actions or change money. Do not invent game mechanics. If asked about an unavailable feature, say it is not built yet.`, messages.map(m => ({ role: m.role === 'mira' ? 'assistant' : 'user', content: m.text })), buildMiraReply(state, trimmed))
    if (request !== miraRequest) return
    set({ chat: [...get().chat, { id: nextId(), role: 'mira' as const, text: reply.text }].slice(-24), miraThinking: false, miraNotice: reply.notice })
    get()._completeQuest('ask-mira')
  },

  _completeQuest: (id) => {
    const state = get()
    const target = state.quests.find((q) => q.id === id)
    if (!target || target.completed) return
    set({ quests: state.quests.map((q) => (q.id === id ? { ...q, completed: true } : q)) })
    get().addLog(`Objective complete: "${target.title}".`)
    // v0.24: every completed objective also lands in storyLog, namespaced
    // (`quest:<id>`) so it can never collide with a STORY_ARC id -- this is
    // what actually merges "what do I do next" and "the story" into one
    // feed on Hall of Records, instead of two separate lists in two
    // separate places.
    set({ storyLog: [...get().storyLog, { id: `quest:${id}`, day: state.day, title: target.title, text: target.description }] })
    // v0.26: a tagged quest completing is itself the trigger for a real
    // lesson -- see LESSON_QUESTS above. Replaces the old independent
    // daily random-roll entirely; nothing spawns off a clock anymore.
    const lesson = LESSON_QUESTS[id]
    if (lesson) get()._queueLesson(lesson.domain, lesson.context)
  },

  _checkQuests: () => {
    const state = get()
    if (state.money >= 50000) get()._completeQuest('steady-books')
    if (state.businesses.length > 0) get()._completeQuest('first-venture')
    if (state.day >= 2) get()._completeQuest('first-paycheck')
    if (state.commitmentCount() > FOCUS_CAPACITY) {
      if (!state.everOvercommitted) set({ everOvercommitted: true })
      get()._completeQuest('overcommitted')
    }
    if (Object.keys(state.discoveries).length > 0) get()._completeQuest('explore-beyond')
    if (Object.keys(state.skills).length > 0) get()._completeQuest('first-lesson')
  },

  _checkStoryBeats: () => {
    const state = get()
    const newlyFired: StoryBeat[] = []
    let firedStoryBeats = state.firedStoryBeats
    for (const beat of STORY_ARC) {
      if (firedStoryBeats[beat.id]) continue
      if (!beat.condition(state)) continue
      newlyFired.push({ id: beat.id, day: state.day, title: beat.title, text: beat.text(state) })
      firedStoryBeats = { ...firedStoryBeats, [beat.id]: true }
    }
    if (newlyFired.length > 0) {
      set({ storyLog: [...state.storyLog, ...newlyFired], firedStoryBeats })
      newlyFired.forEach((beat) => get().addLog(`Story: ${beat.title}`, 'world'))
      // v0.26: the story arc itself is now also a lesson trigger -- "the
      // story arc should clearly give or suggest paths or tasks," direct
      // feedback. A milestone landing is exactly that kind of moment, so
      // it queues whatever's currently the thinnest skill (nextLessonHint)
      // rather than anything rolling on a clock. Skipped if a lesson's
      // already queued or a challenge is already up.
      const hint = get().nextLessonHint()
      if (hint) get()._queueLesson(hint.domain, 'the story so far')
    }
  },

  _runDailyTick: (newDay) => {
    const state = get()
    const eff = get().efficiency()
    let money = state.money
    let health = state.health

    if (state.devJobActive) money += DEV_JOB_DAILY_INCOME * eff

    // Owned buildings count down construction before they can earn; rented
    // offices are open from day one but bleed rent every day, forever.
    const constructionDone: string[] = []
    const businesses = state.businesses.map((biz) => {
      if (biz.premises === 'owned' && (biz.buildDaysRemaining ?? 0) > 0) {
        const buildDaysRemaining = (biz.buildDaysRemaining ?? 0) - 1
        if (buildDaysRemaining <= 0) constructionDone.push(biz.name)
        return { ...biz, buildDaysRemaining }
      }
      return biz
    })
    for (const biz of businesses) {
      if (biz.premises === 'owned' && (biz.buildDaysRemaining ?? 0) > 0) continue // still under construction, no revenue yet
      const variance = 0.8 + Math.random() * 0.4
      const employees = biz.employees ?? []
      // Staff add to the same revenue roll (so a good/bad day scales their
      // output too, same as the business's own base revenue) but their
      // wage is a flat cost either way -- a wage is a wage, rain or shine.
      const employeeRevenue = employees.reduce((sum, e) => sum + e.dailyRevenueBonus, 0)
      const employeeWages = employees.reduce((sum, e) => sum + e.dailyWage, 0)
      money += (biz.dailyRevenueBase + employeeRevenue) * eff * variance
      money -= employeeWages
      if (biz.premises === 'rented' && biz.monthlyRent) money -= biz.monthlyRent / 30
    }

    const finishedGigs: string[] = []
    const remainingGigs = state.activeGigs
      .map((gig) => ({ ...gig, daysRemaining: gig.daysRemaining - 1 }))
      .filter((gig) => {
        if (gig.daysRemaining <= 0) {
          money += gig.payout * eff * (1 + peopleBonus(state.skills))
          finishedGigs.push(gig.title)
          return false
        }
        return true
      })

    money -= DAILY_LIVING_COST

    let sickToday = false
    if (Math.random() < SICK_CHANCE * resilienceFactor(state.skills)) {
      sickToday = true
      money -= SICK_COST
      health = Math.max(0, health - 10)
    } else {
      health = Math.min(100, health + 2)
    }

    // Hunger creeps up daily no matter what -- ignore it long enough and
    // it starts costing health on its own, independent of ordinary bad
    // luck sickness above.
    const craving = Math.min(100, state.craving + CRAVING_RISE_PER_DAY)
    let starving = false
    if (craving >= CRAVING_HEALTH_PENALTY_START) {
      starving = true
      health = Math.max(0, health - Math.round((craving - CRAVING_HEALTH_PENALTY_START) / 6 + 1))
    }

    // Focus drains with every active commitment and recovers with rest,
    // independent of the commitment-count math efficiency() already does
    // -- this is what makes grinding without ever easing off cost you
    // even while under the FOCUS_CAPACITY threshold.
    const focus = Math.max(0, Math.min(100, state.focus - state.commitmentCount() * FOCUS_DRAIN_PER_COMMITMENT + FOCUS_DAILY_RECOVERY))

    // Bank: idle savings earn a little interest; an outstanding loan
    // bites back every day until it's paid off.
    if (money > 0) money += money * (SAVINGS_DAILY_RATE + Math.min(0.002, financeLevel(state.skills) * 0.00004))
    let bankLoan = state.bankLoan
    let loanPaidOff = false
    if (bankLoan) {
      money -= bankLoan.dailyPayment
      const daysRemaining = bankLoan.daysRemaining - 1
      if (daysRemaining <= 0) { bankLoan = null; loanPaidOff = true }
      else bankLoan = { ...bankLoan, daysRemaining }
    }

    let opportunities = state.opportunities
    let spawned = false
    if (opportunities.length < MAX_OPEN_OPPORTUNITIES && Math.random() < OPPORTUNITY_SPAWN_CHANCE) {
      const template = OPPORTUNITY_POOL[Math.floor(Math.random() * OPPORTUNITY_POOL.length)]
      // Every posting is rooted in one specific town somewhere in the
      // generated world, so it feels like it's coming from a real,
      // sprawling economy rather than just the player's home town. A job
      // or freelance posting is also anchored to a real company/person
      // (see pickEmployer) -- if that roll can't find one (rare), just
      // skip spawning this tick rather than falling back to abstract
      // flavor; there'll be another chance next tick.
      if (template.kind === 'business') {
        opportunities = [...opportunities, { ...template, id: nextId(), location: pickRandomTown(state.worldSeed), postedOnDay: newDay }]
        spawned = true
      } else {
        const employerInfo = pickEmployer(state.worldSeed, template.kind)
        if (employerInfo) {
          opportunities = [...opportunities, { ...template, id: nextId(), location: employerInfo.location, employer: employerInfo.employer, employerBuildingId: employerInfo.employerBuildingId, contact: employerInfo.contact, postedOnDay: newDay }]
          spawned = true
        }
      }
    }
    // A posting nobody's touched in OPPORTUNITY_EXPIRY_DAYS quietly comes
    // down -- "stored or removed," not left to pile up forever.
    const expired = opportunities.filter((o) => o.postedOnDay != null && newDay - o.postedOnDay > OPPORTUNITY_EXPIRY_DAYS)
    if (expired.length > 0) opportunities = opportunities.filter((o) => !expired.includes(o))

    // --- World simulation: rival businesses open and close independent of the player ---
    let rivals = state.rivalBusinesses
    const openRivals = rivals.filter((r) => !r.closed)
    let rivalOpened: RivalBusiness | null = null
    if (openRivals.length < MAX_RIVAL_BUSINESSES && Math.random() < RIVAL_SPAWN_CHANCE) {
      const usedNames = new Set(rivals.map((r) => r.name))
      const candidates = RIVAL_NAME_POOL.filter((c) => !usedNames.has(c.name))
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        const location = pickRandomTown(state.worldSeed)
        // Same "claim a real, unclaimed building" rule as the player's own
        // startBusiness -- a rival is a walkable place too, not just a name.
        const buildingId = pickPremisesBuilding(state.worldSeed, location, claimedBuildingIds(state))
        rivalOpened = { id: nextId(), name: pick.name, sector: pick.sector, foundedOnDay: newDay, closed: false, location, ...(buildingId ? { buildingId } : {}) }
        rivals = [...rivals, rivalOpened]
      }
    }
    const rivalsClosed: RivalBusiness[] = []
    rivals = rivals.map((r) => {
      if (r.closed) return r
      const age = newDay - r.foundedOnDay
      const closeChance = RIVAL_BASE_CLOSE_CHANCE * (1 + age / 60)
      if (age > 3 && Math.random() < closeChance) {
        rivalsClosed.push(r)
        return { ...r, closed: true }
      }
      return r
    })

    // --- NPC flavor: occasional sightings of townsfolk doing their own thing ---
    let npcLine: string | null = null
    if (Math.random() < NPC_FLAVOR_CHANCE) {
      const npc = NPC_NAME_POOL[Math.floor(Math.random() * NPC_NAME_POOL.length)]
      const activity = NPC_ACTIVITY_POOL[Math.floor(Math.random() * NPC_ACTIVITY_POOL.length)]
      npcLine = `You spot ${npc} ${activity}.`
    }

    // v0.26: challenges no longer spawn off the daily clock at all --
    // direct feedback was that a random popup "won't help the game,"
    // disconnected from whatever the player's actually doing. Learning
    // now only ever arrives as a queued lesson tied to a real trigger
    // (a tagged quest completing, or the story arc surfacing one -- see
    // LESSON_QUESTS/_queueLesson/_checkStoryBeats). pendingChallenge here
    // just passes through untouched; aiChallengePool is topped up below
    // by refillAIChallenges as always.
    const pendingChallenge = state.pendingChallenge
    const aiChallengePool = state.aiChallengePool

    set({ money, health, craving, focus, bankLoan, pendingChallenge, aiChallengePool, businesses, activeGigs: remainingGigs, opportunities, rivalBusinesses: rivals })

    get().addLog(`Day ${newDay} began. Living costs paid (${formatInr(DAILY_LIVING_COST)}), efficiency was ${(eff * 100).toFixed(0)}%.`)
    finishedGigs.forEach((title) => get().addLog(`Freelance gig completed: "${title}".`))
    if (sickToday) get().addLog(`Got sick -- lost health and paid ${formatInr(SICK_COST)} for care.`)
    if (starving) get().addLog(`Hunger caught up with you -- skipped meals too long, lost health for it.`)
    if (loanPaidOff) get().addLog(`Paid off your bank loan in full.`, 'world')
    constructionDone.forEach((name) => get().addLog(`"${name}"'s new building finished construction -- open for business.`, 'world'))
    if (spawned) get().addLog('A new opportunity appeared in the world.')
    if (expired.length > 0) get().addLog(`${expired.length} old posting${expired.length === 1 ? '' : 's'} came down from the Job Board, unanswered.`)
    if (rivalOpened) get().addLog(`"${rivalOpened.name}" opened downtown -- a new ${rivalOpened.sector}.`, 'world')
    rivalsClosed.forEach((r) => get().addLog(`"${r.name}" shut its doors after ${newDay - r.foundedOnDay} days in business.`, 'world'))
    if (npcLine) get().addLog(npcLine, 'world')

    get()._checkQuests()
    if (rivalOpened || rivalsClosed.length > 0) get()._completeQuest('watch-world')

    // The background story arc advances every day, unconditionally --
    // "not a choice... can go on even when they play freely." No AI
    // dependency, no gate: this just always runs. As of v0.26 it can also
    // queue a lesson itself -- see _checkStoryBeats.
    get()._checkStoryBeats()

    // Background, non-blocking: top up whichever pool is running low, if a
    // local model is connected. Both are no-ops otherwise.
    get().refillAIChallenges()
    get().refillAIOpportunity()
  },

  // --- Dev/test tooling below -- not part of the story ----------------------

  advanceDays: (days) => {
    const count = Math.max(1, Math.min(30, Math.floor(days)))
    for (let i = 0; i < count; i++) {
      const state = get()
      const newDayIndex = Math.floor(state.simMinutesTotal / 1440) + 1
      set({ simMinutesTotal: newDayIndex * 1440, day: newDayIndex + 1, hour: 0, minute: 0 })
      get()._runDailyTick(newDayIndex + 1)
    }
    get().addLog(`Fast-forwarded ${count} day${count === 1 ? '' : 's'}.`)
  },

  addMoney: (amount) => set((state) => ({ money: state.money + amount })),

  forceChallenge: () => {
    const state = get()
    if (state.pendingChallenge) return
    const fromAI = state.aiChallengePool[0]
    if (fromAI) {
      set({ pendingChallenge: fromAI, aiChallengePool: state.aiChallengePool.slice(1) })
    } else {
      const pick = CHALLENGE_POOL[Math.floor(Math.random() * CHALLENGE_POOL.length)]
      set({ pendingChallenge: pick })
    }
    get().refillAIChallenges()
  },

  _queueLesson: (domain, context) => {
    const state = get()
    if (state.queuedLesson || state.pendingChallenge) return
    let challenge: Challenge | null = null
    let aiChallengePool = state.aiChallengePool
    const aiMatch = aiChallengePool.find((c) => c.domain === domain)
    if (aiMatch) {
      challenge = aiMatch
      aiChallengePool = aiChallengePool.filter((c) => c.id !== aiMatch.id)
    } else {
      const libMatch = state.challengeLibrary.find((c) => c.domain === domain)
      if (libMatch) {
        challenge = libMatch
      } else {
        const staticMatches = CHALLENGE_POOL.filter((c) => c.domain === domain)
        if (staticMatches.length > 0) challenge = staticMatches[Math.floor(Math.random() * staticMatches.length)]
      }
    }
    if (!challenge) return
    const label = DOMAIN_LABEL[domain]
    const intro = `Tam has a thought about ${context} -- something in ${label} worth trying next.`
    set({
      queuedLesson: { challenge, intro },
      aiChallengePool,
      chat: [...state.chat, { id: nextId(), role: 'mira' as const, text: `${intro} Check the objective banner up top when you want to take it on.` }].slice(-24),
    })
  },

  acceptQueuedLesson: () => {
    const state = get()
    if (!state.queuedLesson || state.pendingChallenge) return
    set({ pendingChallenge: state.queuedLesson.challenge, queuedLesson: null })
    get().refillAIChallenges()
  },

  dismissQueuedLesson: () => set({ queuedLesson: null }),

  saveToSlot: (slot) => {
    const name = slot.trim() || 'checkpoint'
    const { _tickHandle, running, _aiChallengeLoading, _aiOpportunityLoading, _judgeLoading, ...snapshot } = get()
    try {
      localStorage.setItem(SAVE_SLOT_PREFIX + name, JSON.stringify(snapshot))
      get().addLog(`Saved snapshot "${name}".`)
    } catch {
      get().addLog(`Couldn't save snapshot "${name}" -- storage may be full.`)
    }
  },

  loadFromSlot: (slot) => {
    try {
      const raw = localStorage.getItem(SAVE_SLOT_PREFIX + slot)
      if (!raw) return
      const data = JSON.parse(raw)
      get().stopClock()
      set({ ...data, _tickHandle: null, running: false, _aiChallengeLoading: false, _aiOpportunityLoading: false, _judgeLoading: false })
      get().addLog(`Loaded snapshot "${slot}".`)
    } catch {
      get().addLog(`Couldn't load snapshot "${slot}" -- it may be corrupted.`)
    }
  },

  deleteSlot: (slot) => {
    try {
      localStorage.removeItem(SAVE_SLOT_PREFIX + slot)
    } catch {
      // ignore
    }
  },
    }),
    {
      name: 'forge-of-one-save',
      storage: loggedStorage,
      // Transient/non-serializable fields never get written to disk --
      // they're reset on rehydrate below regardless, but this keeps the
      // saved JSON small and free of stale interval handles.
      partialize: (state) => {
        const { _tickHandle, running, _aiChallengeLoading, _aiOpportunityLoading, _judgeLoading, _aiBookLoading, _readingBookId, _expertLoading, ...rest } = state
        return rest
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._tickHandle = null
          state.running = false
          state._aiChallengeLoading = false
          state._aiOpportunityLoading = false
          state._judgeLoading = false
          state._aiBookLoading = false
          state._readingBookId = null
          state._expertLoading = false
        }
      },
    }
  )
)
