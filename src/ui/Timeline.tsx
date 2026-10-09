import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { DAY, formatT } from '../lib/time'
import type { Precision } from '../types'

// Zoomable scrubber (D7): wheel zooms around the cursor, drag pans, click/drag on the track sets time.
const MIN_SPAN = 20 * DAY
const STEPS: { step: number; precision: Precision }[] = [
  { step: 100, precision: 'year' },
  { step: 50, precision: 'year' },
  { step: 25, precision: 'year' },
  { step: 10, precision: 'year' },
  { step: 5, precision: 'year' },
  { step: 2, precision: 'year' },
  { step: 1, precision: 'year' },
  { step: 1 / 4, precision: 'month' },
  { step: 1 / 12, precision: 'month' },
  { step: 7 * DAY, precision: 'day' },
  { step: DAY, precision: 'day' },
]

function pickStep(span: number, width: number) {
  const maxTicks = Math.max(4, Math.floor(width / 90))
  for (let i = STEPS.length - 1; i >= 0; i--) if (span / STEPS[i].step <= maxTicks) return STEPS[i]
  return STEPS[0]
}

/** Snap to whole months when stepping by months, so labels read cleanly. */
function ticks(a: number, b: number, step: number) {
  const out: number[] = []
  if (step >= 1) {
    for (let x = Math.ceil(a / step) * step; x <= b; x += step) out.push(x)
  } else if (step >= 1 / 12 - 1e-9) {
    const per = Math.round(step * 12)
    for (let y = Math.floor(a); y <= b; y++)
      for (let m = 0; m < 12; m += per) {
        const x = y + m / 12
        if (x >= a && x <= b) out.push(x)
      }
  } else {
    for (let x = Math.ceil(a / step) * step; x <= b; x += step) out.push(x)
  }
  return out
}

export function Timeline() {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const selection = useStore((s) => s.selection)
  const { setT, setPlaying, select } = useStore.getState()
  const range = content?.range ?? [1740, 1766]
  const [win, setWin] = useState<[number, number]>([range[0], range[1]])
  const track = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const drag = useRef<{ mode: 'scrub' | 'pan'; x: number; win: [number, number] } | null>(null)

  useEffect(() => setWin([range[0], range[1]]), [range[0], range[1]])
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    if (track.current) ro.observe(track.current)
    return () => ro.disconnect()
  }, [])

  // Keep the playhead in view when time jumps (stories, card links).
  useEffect(() => {
    const [a, b] = win
    if (t < a || t > b) {
      const span = b - a
      const na = Math.max(range[0], Math.min(range[1] - span, t - span / 2))
      setWin([na, na + span])
    }
  }, [t])

  // Playback: cross the visible window in about 40 seconds.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const s = useStore.getState()
      const span = win[1] - win[0]
      const next = s.t + ((now - last) / 1000) * (span / 40)
      last = now
      if (next >= range[1]) {
        s.setT(range[1])
        s.setPlaying(false)
        return
      }
      s.setT(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, win])

  const [a, b] = win
  const span = b - a
  const x = (v: number) => ((v - a) / span) * width
  const toT = (px: number) => a + (px / width) * span
  const { step, precision } = pickStep(span, width)
  const tickList = useMemo(() => ticks(a, b, step), [a, b, step])
  const readout = formatT(t, span < 2 ? 'day' : span < 8 ? 'month' : 'year')

  const clampWin = (na: number, nb: number): [number, number] => {
    const s = Math.min(range[1] - range[0], Math.max(MIN_SPAN, nb - na))
    const lo = Math.max(range[0], Math.min(range[1] - s, na))
    return [lo, lo + s]
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = track.current!.getBoundingClientRect()
    const anchor = toT(e.clientX - rect.left)
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = (e.deltaX / width) * span
      setWin(clampWin(a + d, b + d))
      return
    }
    const f = Math.exp(e.deltaY * 0.002)
    setWin(clampWin(anchor - (anchor - a) * f, anchor + (b - anchor) * f))
  }

  const onDown = (e: React.PointerEvent, mode: 'scrub' | 'pan') => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, win }
    if (mode === 'scrub') {
      const rect = track.current!.getBoundingClientRect()
      setT(toT(e.clientX - rect.left))
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const rect = track.current!.getBoundingClientRect()
    if (d.mode === 'scrub') setT(toT(e.clientX - rect.left))
    else {
      const dt = ((d.x - e.clientX) / width) * (d.win[1] - d.win[0])
      setWin(clampWin(d.win[0] + dt, d.win[1] + dt))
    }
  }
  const onUp = () => (drag.current = null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!useStore.getState().playing)
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        setT(useStore.getState().t + dir * (e.shiftKey ? step : step / 4))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  if (!content) return null
  return (
    <div className="timeline" onWheel={onWheel}>
      <div className="timeline-head">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="readout">{readout}</div>
        <div className="timeline-hint">scroll to zoom · drag the scale to pan · space to play</div>
      </div>
      <div ref={track} className="track">
        <svg width={width} height={74} onPointerMove={onMove} onPointerUp={onUp}>
          {/* Scale band: drag to pan */}
          <rect x={0} y={0} width={width} height={22} className="scale-band" onPointerDown={(e) => onDown(e, 'pan')} />
          {tickList.map((v) => (
            <g key={v} transform={`translate(${x(v)},0)`} pointerEvents="none">
              <line y1={16} y2={74} className="tick" />
              <text y={13} className="tick-label">
                {formatT(v + 1e-6, precision)}
              </text>
            </g>
          ))}
          {/* Track: click/drag to scrub */}
          <rect x={0} y={22} width={width} height={52} className="track-band" onPointerDown={(e) => onDown(e, 'scrub')} />
          {content.keyframes.map((k) => (
            <path
              key={k.date.t}
              d={`M${x(k.date.t)},26 l5,6 l-5,6 l-5,-6 z`}
              className="keyframe-mark"
              pointerEvents="none"
            >
              <title>{`${k.date.label}: territorial change`}</title>
            </path>
          ))}
          {content.events.map((e) => {
            const ex = x(e.date.t)
            if (ex < -20 || ex > width + 20) return null
            const h = 8 + e.significance * 5
            const sel = selection?.kind === 'event' && selection.id === e.id
            return (
              <g
                key={e.id}
                className={`event-tick${sel ? ' selected' : ''}`}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => {
                  setT(e.date.t)
                  select({ kind: 'event', id: e.id })
                }}
              >
                {e.end && <rect x={ex} y={70 - h} width={Math.max(2, x(e.end.t) - ex)} height={3} className="event-span" />}
                <line x1={ex} x2={ex} y1={74} y2={74 - h} />
                <circle cx={ex} cy={74 - h} r={2 + e.significance * 0.6} />
                <title>{`${e.date.label}: ${e.name}`}</title>
              </g>
            )
          })}
          <g transform={`translate(${x(t)},0)`} pointerEvents="none">
            <line y1={18} y2={74} className="playhead" />
            <path d="M-6,18 L6,18 L0,26 z" className="playhead-cap" />
          </g>
        </svg>
      </div>
    </div>
  )
}
