import { useGameStore } from '../store/gameStore'
export function CollectionJournal({ onClose }: { onClose: () => void }) {
  const items = useGameStore(s => s.inventory), contacts = useGameStore(s => s.contacts)
  return <aside className="collection-journal" role="dialog" aria-label="Collection journal" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
    <header><div><small>THINGS YOU FIND. PEOPLE YOU MEET.</small><h2>Your journal</h2></div><button aria-label="Close journal" onClick={onClose}>×</button></header>
    <div className="journal-content"><h3>Collection <span>{items.reduce((n, i) => n + i.quantity, 0)} items</span></h3>{items.length ? items.map(i => <article key={i.id}><span className={`item-glyph ${i.category}`}>{i.category === 'artifact' ? '✦' : i.category === 'food' ? '❧' : '◆'}</span><div><strong>{i.name} <small>×{i.quantity}</small></strong><p>{i.description}</p><small>{i.category}</small></div></article>) : <p className="world-muted">Look for old ruins west of town, or the camp and community harvest to the south. Inspect them to collect a keepsake or supplies.</p>}<h3>People you know <span>{Object.keys(contacts).length}</span></h3>{Object.entries(contacts).map(([id, c]) => <article key={id}><span className="contact-glyph">{c.name[0]}</span><div><strong>{c.name}</strong><p>{c.role} · {c.meetings} conversation{c.meetings === 1 ? '' : 's'}</p></div></article>)}{!Object.keys(contacts).length && <p className="world-muted">Click a neighbour and choose Talk to get acquainted.</p>}</div>
  </aside>
}
