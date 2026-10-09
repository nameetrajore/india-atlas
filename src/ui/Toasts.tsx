import { useEffect } from 'react'
import { useStore } from '../store'
import { badgeUrl, kindDef } from './icons'

const TTL = 5000

/** "Breaking news" cards for events the playhead just crossed. */
export function Toasts() {
  const content = useStore((s) => s.content)
  const crossed = useStore((s) => s.crossed)
  const { dismiss, select, setPlaying } = useStore.getState()

  useEffect(() => {
    if (!crossed.length) return
    const oldest = Math.min(...crossed.map((c) => c.at))
    const id = window.setTimeout(() => dismiss(crossed.find((c) => c.at === oldest)!.id), Math.max(0, oldest + TTL - performance.now()))
    return () => clearTimeout(id)
  }, [crossed, dismiss])

  if (!content || !crossed.length) return null
  return (
    <div className="toasts">
      {crossed.map((c) => {
        const e = content.events.find((x) => x.id === c.id)
        if (!e) return null
        return (
          <button
            key={c.id}
            className="toast"
            style={{ borderLeftColor: kindDef(e.kind).color }}
            onClick={() => {
              setPlaying(false)
              select({ kind: 'event', id: e.id })
              dismiss(c.id)
            }}
          >
            <img src={badgeUrl(e.kind)} width={26} height={26} alt="" />
            <span>
              <span className="toast-date">{e.date.label}</span>
              <span className="toast-name">{e.name}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
