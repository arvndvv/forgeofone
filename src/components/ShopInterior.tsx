import { useEffect, useRef, useState } from 'react'
import { drawRoom } from '../world/roomArt'
import { useGameStore, formatInr } from '../store/gameStore'
import { FOOD_CATALOG, FOOD_CATEGORIES, FOOD_CATEGORY_LABEL } from '../world/shopping'
import type { FoodCategory } from '../types/game'

const W = 680, H = 150

/** A physical shop's interior -- reached by walking to a shopType:'food' or
 *  'book' building's doorstep and pressing E (see WorldView.tsx/generation.ts).
 *  Same "look inside" chrome as HomeInterior.tsx (a drawn room via roomArt.ts,
 *  reusing its existing 'cooking'/'reading' scenes rather than adding new
 *  art), but shows a purchasable stock list instead of a resident.
 *
 *  Food: a fixed, hand-written catalog (world/shopping.ts's FOOD_CATALOG),
 *  grouped into category tabs -- buying stores the item in the player's
 *  inventory (same CollectedItem list the World's collectibles use), eaten
 *  later from home (Life & Bank's Pantry panel).
 *  Books: gameStore's `bookShopStock` -- AI-drafted when a local model is
 *  connected, hand-written fallback titles otherwise -- buying moves one
 *  into the player's home library, read later from Life & Bank. */
export function ShopInterior({ kind, label, onClose }: { kind: 'food' | 'book'; label: string; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    drawRoom(ctx, kind === 'book' ? 'reading' : 'cooking', W, H)
  }, [kind])

  const money = useGameStore(s => s.money)
  const inventory = useGameStore(s => s.inventory)
  const buyFood = useGameStore(s => s.buyFood)
  const bookShopStock = useGameStore(s => s.bookShopStock)
  const buyBook = useGameStore(s => s.buyBook)
  const [category, setCategory] = useState<FoodCategory>('fruit')

  // Top the shelf back up with an AI-drafted title whenever a slot's open
  // and a model's connected -- a no-op otherwise, same as every other
  // background-refill call in this game.
  useEffect(() => { if (kind === 'book') useGameStore.getState().refillBookStock() }, [kind])

  return <aside className="home-interior" role="dialog" aria-label={`Inside ${label}`} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
    <div className="home-interior-card shop-interior-card">
      <header>
        <div><h2>{label}</h2><p>{kind === 'food' ? 'Food shop' : 'Bookshop'} <span className="activity-tag">You have {formatInr(money)}</span></p></div>
        <button aria-label="Close" onClick={onClose}>×</button>
      </header>
      <canvas ref={ref} width={W} height={H} aria-hidden="true" className="home-interior-canvas shop-interior-canvas" />
      <div className="shop-interior-body">
        {kind === 'food' ? <>
          <div className="shop-category-tabs" role="tablist" aria-label="Food categories">
            {FOOD_CATEGORIES.map(c => <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>{FOOD_CATEGORY_LABEL[c]}</button>)}
          </div>
          <div className="shop-item-list">
            {FOOD_CATALOG.filter(f => f.category === category).map(f => {
              const owned = inventory.find(i => i.id === f.id)
              return <div key={f.id} className="shop-item-row">
                <div className="shop-item-info"><strong>{f.name}</strong><small>{f.description}{owned ? ` · You have ${owned.quantity} at home` : ''}</small></div>
                <div className="shop-item-buy"><span>{formatInr(f.price)}</span><button disabled={money < f.price} onClick={() => buyFood(f.id)}>Buy</button></div>
              </div>
            })}
          </div>
        </> : <div className="shop-item-list">
          {bookShopStock.length === 0 && <p className="shop-empty">The shelves are bare right now -- come back later.</p>}
          {bookShopStock.map(b => <div key={b.id} className="shop-item-row">
            <div className="shop-item-info"><strong>{b.title}</strong><small>{b.blurb}</small></div>
            <div className="shop-item-buy"><span>{formatInr(b.price)}</span><button disabled={money < b.price} onClick={() => buyBook(b.id)}>Buy</button></div>
          </div>)}
        </div>}
      </div>
      <p className="home-interior-note shop-interior-note">{kind === 'food' ? 'Bought food is stored at home -- eat it any time from Life & Bank.' : 'Bought books go to your home library -- read them from Life & Bank for a quote or two.'}</p>
    </div>
  </aside>
}
