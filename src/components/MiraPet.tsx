import { useId } from 'react'
import './mira.css'

export function MiraPet({ mood = 'idle', size = 48 }: { mood?: 'idle' | 'listening' | 'thinking' | 'happy'; size?: number }) {
  const glowId = useId()
  return <svg className={`mira-pet mira-${mood}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Mira, your little star companion, ${mood}`}>
    <defs><radialGradient id={glowId}><stop stopColor="#ffe6a0" stopOpacity=".8"/><stop offset="1" stopColor="#ffe6a0" stopOpacity="0"/></radialGradient></defs>
    <ellipse className="mira-shadow" cx="32" cy="57" rx="14" ry="3" fill="#122e2a" opacity=".18"/>
    <g className="mira-body">
      <g className="mira-ear-left"><path d="M21 28Q5 24 9 8Q25 12 26 26" fill="#65b9a8" stroke="#32655f" strokeWidth="2"/><path d="M12 12L22 26" stroke="#b7ead0" strokeWidth="3"/></g>
      <g className="mira-ear-right"><path d="M40 27Q40 9 57 13Q56 29 42 31" fill="#65b9a8" stroke="#32655f" strokeWidth="2"/><path d="M53 16L43 27" stroke="#b7ead0" strokeWidth="3"/></g>
      <path d="M17 45Q10 50 16 54L24 51M41 50Q48 57 52 50L48 43" fill="#5cad9c" stroke="#32655f" strokeWidth="2"/>
      <path d="M14 36Q13 21 31 20Q48 20 50 37Q53 53 33 54Q14 55 14 36" fill="#92d6bb" stroke="#32655f" strokeWidth="2"/>
      <path d="M18 34Q20 23 30 23" stroke="#d6f2ce" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <ellipse cx="33" cy="44" rx="11" ry="8" fill="#def0ce"/>
      <g className="mira-eyes"><ellipse cx="25" cy="34" rx="2.1" ry="3" fill="#254945"/><ellipse cx="41" cy="34" rx="2.1" ry="3" fill="#254945"/><circle cx="25.6" cy="33" r=".7" fill="white"/><circle cx="41.6" cy="33" r=".7" fill="white"/></g>
      <path d="M30 38Q33 41 36 38" stroke="#32655f" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <ellipse cx="20" cy="38" rx="3" ry="1.5" fill="#e8ad91" opacity=".7"/><ellipse cx="46" cy="38" rx="3" ry="1.5" fill="#e8ad91" opacity=".7"/>
      <circle className="mira-heart-glow" cx="33" cy="45" r="13" fill={`url(#${glowId})`}/>
      <path className="mira-star" d="M33 39L35 43L40 44L36 47L37 51L33 49L29 51L30 47L26 44L31 43Z" fill="#f4cf77" stroke="#caa454" strokeWidth=".8"/>
      <path d="M29 21Q26 13 34 10Q39 14 34 21" fill="#c5e6a0" stroke="#47786a" strokeWidth="1.5"/>
    </g>
    <g className="mira-sparks" fill="#f5da8b"><path d="M7 31L8 34L11 35L8 36L7 39L6 36L3 35L6 34Z"/><path d="M56 4L57 7L60 8L57 9L56 12L55 9L52 8L55 7Z"/></g>
  </svg>
}
