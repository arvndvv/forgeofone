import { Fragment } from 'react'

/** Renders a chat line with *stage directions* (and **bold** ones) styled
 *  as actions instead of showing the raw asterisks. Stray, unpaired
 *  asterisks are dropped. */
export function ChatText({ text }: { text: string }) {
  const parts = text.split(/(\*{1,2}[^*\n]+\*{1,2})/g)
  return <>{parts.map((part, i) => {
    const m = part.match(/^\*{1,2}([^*\n]+)\*{1,2}$/)
    if (m) return <em key={i} className="chat-emote">{m[1].trim()}</em>
    return <Fragment key={i}>{part.replace(/\*/g, '')}</Fragment>
  })}</>
}
