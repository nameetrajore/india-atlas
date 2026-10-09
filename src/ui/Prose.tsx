import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { SelectionKind } from '../types'

const LINK = /\[([^\]]+)\]\((event|person|place|polity|unit):([a-z0-9-]+)\)|\*\*([^*]+)\*\*/g

/** Narrative text: one paragraph per line (YAML folds blank lines to newlines); [label](kind:id) links open cards; **bold**. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const select = useStore((s) => s.select)
  const paras = text.trim().split(/\n+/)
  return (
    <div className={className}>
      {paras.map((p, i) => {
        const out: ReactNode[] = []
        let last = 0
        for (const m of p.matchAll(LINK)) {
          if (m.index! > last) out.push(p.slice(last, m.index))
          if (m[4]) out.push(<strong key={m.index}>{m[4]}</strong>)
          else
            out.push(
              <button key={m.index} className="inline-link" onClick={() => select({ kind: m[2] as SelectionKind, id: m[3] })}>
                {m[1]}
              </button>,
            )
          last = m.index! + m[0].length
        }
        out.push(p.slice(last))
        return <p key={i}>{out}</p>
      })}
    </div>
  )
}
