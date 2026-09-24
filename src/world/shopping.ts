import type { Book, FoodCategory, FoodItem } from '../types/game'

/** Which of generation.ts's SHOPS names are which kind of physical shop --
 *  used at settlement-generation time to tag a shop building's `shopType`
 *  (Building.shopType in generation.ts), which is what turns its doorstep
 *  into a "step inside" ShopInterior instead of a decorative building.
 *  Workshop and Flower Shop are left untagged for now -- still decorative,
 *  same as every shop building before this round. */
export const FOOD_SHOP_NAMES = new Set(['Bakery', 'General Store', 'Coffee House'])
export const BOOK_SHOP_NAME = 'Bookshop'

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  fruit: 'Fruit',
  bakery: 'Bakery',
  'fast-food': 'Fast Food',
  drink: 'Drinks',
}
export const FOOD_CATEGORIES: FoodCategory[] = ['fruit', 'bakery', 'fast-food', 'drink']

/** Every food shop building shows this same catalog, grouped into tabs by
 *  category -- see the FoodCategory doc comment in types/game.ts for why
 *  this isn't (yet) split per-shop. Hand-written, not AI-generated: this is
 *  fixed flavor + fixed numbers, not the kind of open-ended content the
 *  local-model pipeline is for. */
export const FOOD_CATALOG: FoodItem[] = [
  { id: 'food-apple', name: 'Apple', category: 'fruit', price: 120, relief: 25, healthBonus: 1, description: 'A crisp, everyday apple.' },
  { id: 'food-banana', name: 'Banana', category: 'fruit', price: 90, relief: 20, description: 'A quick, cheap source of energy.' },
  { id: 'food-orange', name: 'Orange', category: 'fruit', price: 110, relief: 22, healthBonus: 1, description: 'Bright, juicy, and a little tart.' },
  { id: 'food-bread-loaf', name: 'Bread Loaf', category: 'bakery', price: 200, relief: 38, healthBonus: 1, description: 'A fresh loaf, still warm from the oven.' },
  { id: 'food-croissant', name: 'Croissant', category: 'bakery', price: 170, relief: 30, description: 'Flaky, buttery, gone in a minute.' },
  { id: 'food-muffin', name: 'Cinnamon Muffin', category: 'bakery', price: 160, relief: 28, description: 'Sweet enough to feel like a small reward.' },
  { id: 'food-burger', name: 'Burger', category: 'fast-food', price: 380, relief: 55, description: 'Quick, filling, and completely worth the mess.' },
  { id: 'food-pizza-slice', name: 'Pizza Slice', category: 'fast-food', price: 340, relief: 50, description: 'One slice never seems to be enough.' },
  { id: 'food-coffee', name: 'Coffee', category: 'drink', price: 140, relief: 12, description: 'Bitter, hot, and exactly what the morning needed.' },
  { id: 'food-juice', name: 'Fresh Juice', category: 'drink', price: 160, relief: 18, healthBonus: 2, description: 'Cold-pressed and a little too expensive for what it is.' },
]

/** Seeds the bookshop's stock (gameStore's `bookShopStock`) on a fresh game
 *  and after "start over" -- always exactly BOOK_SHOP_CAP titles, so a
 *  player with no local model connected still has a full shelf to browse.
 *  gameStore's refillBookStock() tops slots back up with AI-drafted titles
 *  as these get bought, same "gets generated but then stored or removed"
 *  loop as the Job Board and the challenge pool. */
export const STATIC_BOOKS: Book[] = [
  { id: 'book-static-1', title: 'The Slow Compound', blurb: "A quiet argument for the kind of progress nobody notices until it's enormous.", price: 420 },
  { id: 'book-static-2', title: 'Letters to a Young Founder', blurb: 'Old advice about money, patience, and knowing when to stop.', price: 480 },
  { id: 'book-static-3', title: 'Everyday Negotiations', blurb: 'Short, practical stories about getting to yes without losing the room.', price: 520 },
  { id: 'book-static-4', title: 'The Unfinished Garden', blurb: 'A gentle novel about a gardener who never quite finishes anything, on purpose.', price: 390 },
  { id: 'book-static-5', title: 'Notes from the Workshop', blurb: "A carpenter's private notebook, half technique and half philosophy.", price: 460 },
]
export const BOOK_SHOP_CAP = STATIC_BOOKS.length

/** Hand-written fallback quotes for readBook() when no local model is
 *  connected (or a call fails) -- templated with the book's own title, same
 *  "always degrades to something, never nothing" rule as every other AI
 *  feature in this game. */
const FALLBACK_NOTE_TEMPLATES: Array<(title: string) => string> = [
  title => `A line worth keeping from "${title}": progress is just yesterday's discipline compounding quietly.`,
  title => `From "${title}": the hardest part of any craft is doing it again on the day you don't feel like it.`,
  title => `"${title}" left me thinking -- most mistakes look obvious only in hindsight, and that's fine.`,
  title => `A note from "${title}": ask better questions before reaching for a faster answer.`,
  title => `"${title}": the people who finish are rarely the most talented, just the steadiest.`,
]
export function pickFallbackNote(title: string): string {
  return FALLBACK_NOTE_TEMPLATES[Math.floor(Math.random() * FALLBACK_NOTE_TEMPLATES.length)](title)
}
