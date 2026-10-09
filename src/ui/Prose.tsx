import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { SelectionKind, Term } from '../types'

const LINK = /\[([^\]]+)\]\((event|person|place|polity|unit):([a-z0-9-]+)\)|\*\*([^*]+)\*\*/g

let termCache: { list: Term[]; re: RegExp; byWord: Map<string, Term> } | null = null
function glossaryIndex(list: Term[]) {
  if (termCache?.list === list) return termCache
  const byWord = new Map<string, Term>()
  for (const t of list) for (const w of [t.term, ...t.aliases]) byWord.set(w.toLowerCase(), t)
  // Longest first, so "subsidiary alliances" wins over "subsidiary alliance".
  const words = [...byWord.keys()].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  termCache = { list, re: new RegExp(`\\b(${words.join('|')})\\b`, 'gi'), byWord }
  return termCache
}

/** Plain text with the first use of each glossary term marked for a hover definition. */
function withTerms(text: string, terms: Term[], seen: Set<string>, key: string): ReactNode[] {
  if (!terms.length) return [text]
  const { re, byWord } = glossaryIndex(terms)
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const term = byWord.get(m[0].toLowerCase())
    if (!term || seen.has(term.id)) continue
    seen.add(term.id)
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(
      <span key={`${key}-${m.index}`} className="term" tabIndex={0}>
        {m[0]}
        <span className="term-def" role="tooltip">
          <strong>{term.term}</strong> {term.definition}
        </span>
      </span>,
    )
    last = m.index! + m[0].length
  }
  out.push(text.slice(last))
  return out
}

/** Narrative text: one paragraph per line (YAML folds blank lines to newlines); [label](kind:id) links open cards; **bold**; glossary terms get definitions. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const select = useStore((s) => s.select)
  const terms = useStore((s) => s.content?.glossary ?? [])
  const seen = new Set<string>()
  const paras = text.trim().split(/\n+/)
  return (
    <div className={className}>
      {paras.map((p, i) => {
        const out: ReactNode[] = []
        let last = 0
        for (const m of p.matchAll(LINK)) {
          if (m.index! > last) out.push(...withTerms(p.slice(last, m.index), terms, seen, `${i}-${last}`))
          if (m[4]) out.push(<strong key={m.index}>{m[4]}</strong>)
          else
            out.push(
              <button key={m.index} className="inline-link" onClick={() => select({ kind: m[2] as SelectionKind, id: m[3] })}>
                {m[1]}
              </button>,
            )
          last = m.index! + m[0].length
        }
        out.push(...withTerms(p.slice(last), terms, seen, `${i}-${last}`))
        return <p key={i}>{out}</p>
      })}
    </div>
  )
}
