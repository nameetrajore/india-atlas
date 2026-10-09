import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { DAY, formatT } from '../lib/time'
import type { HistEvent, Precision } from '../types'
import { kindDef } from './icons'

// Zoomable scrubber (D7): wheel zooms around the cursor, drag the scale to pan, click/drag the track to set time.
const MIN_SPAN = 20 * DAY
const STEPS: { step: number; precision: Precision }[] = [
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

// Vertical layout (px)
const H = { scale: 18, phase: [20, 16], viceroy: [38, 13], lanes: 56, lane: 25, nLanes: 3 } as const
const HEIGHT = H.lanes + H.lane * H.nLanes + 2
const PHASE_FILLS = ['#e6d6b4', '#dccaa4']

function pickStep(span: number, width: number) {
  const maxTicks = Math.max(4, Math.floor(width / 90))
  for (let i = STEPS.length - 1; i >= 0; i--) if (span / STEPS[i].step <= maxTicks) return STEPS[i]
  return STEPS[0]
}

function ticks(a: number, b: number, step: number) {
  const out: number[] = []
  if (step >= 1) for (let x = Math.ceil(a / step) * step; x <= b; x += step) out.push(x)
  else if (step >= 1 / 12 - 1e-9) {
    const per = Math.round(step * 12)
    for (let y = Math.floor(a); y <= b; y++)
      for (let m = 0; m < 12; m += per) {
        const x = y + m / 12
        if (x >= a && x <= b) out.push(x)
      }
  } else for (let x = Math.ceil(a / step) * step; x <= b; x += step) out.push(x)
  return out
}

const badgeR = (sig: number) => 5 + sig * 1.4
const labelW = (e: HistEvent) => e.name.length * 6.4 + 8

interface Placed {
  e: HistEvent
  x: number
  lane: number
  label: boolean
}

/** Stack events into lanes: most significant first, labelled where there is room, badge-only otherwise. */
function layoutEvents(events: HistEvent[], x: (t: number) => number, width: number): Placed[] {
  const lanes: [number, number][][] = Array.from({ length: H.nLanes }, () => [])
  const free = (lane: number, a: number, b: number) => lanes[lane].every(([p, q]) => b < p || a > q)
  const out: Placed[] = []
  const sorted = [...events].sort((p, q) => q.significance - p.significance || p.date.t - q.date.t)
  for (const e of sorted) {
    const ex = x(e.date.t)
    if (ex < -40 || ex > width + 40) continue
    const r = badgeR(e.significance)
    const withLabel: [number, number] = [ex - r - 2, ex + r + labelW(e)]
    const bare: [number, number] = [ex - r - 1, ex + r + 1]
    let placed: Placed | null = null
    for (let l = 0; l < H.nLanes && !placed; l++) if (free(l, ...withLabel) && withLabel[1] < width) placed = { e, x: ex, lane: l, label: true }
    for (let l = 0; l < H.nLanes && !placed; l++) if (free(l, ...bare)) placed = { e, x: ex, lane: l, label: false }
    // No room: the event waits until the user zooms in (most significant events are placed first).
    if (!placed) continue
    lanes[placed.lane].push(placed.label ? withLabel : bare)
    out.push(placed)
  }
  return out
}

export function Timeline() {
  const content = useStore((s) => s.content)
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const selection = useStore((s) => s.selection)
  const { setT, setPlaying, select } = useStore.getState()
  const range = content?.range ?? [1857, 1948]
  const [lo, hi] = range
  const [win, setWin] = useState<[number, number]>([lo, hi])
  const track = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<{ e: HistEvent; x: number } | null>(null)
  const drag = useRef<{ mode: 'scrub' | 'pan'; x: number; win: [number, number] } | null>(null)

  useEffect(() => setWin([lo, hi]), [lo, hi])
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    if (track.current) ro.observe(track.current)
    return () => ro.disconnect()
  }, [])

  // Keep the playhead in view when time jumps (stories, card links).
  useEffect(() => {
    setWin(([a, b]) => {
      if (t >= a && t <= b) return [a, b]
      const span = b - a
      const na = Math.max(lo, Math.min(hi - span, t - span / 2))
      return [na, na + span]
    })
  }, [t, lo, hi])

  // Playback: cross the visible window in about 60 seconds.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const s = useStore.getState()
      const next = s.t + ((now - last) / 1000) * ((win[1] - win[0]) / 60)
      last = now
      if (next >= hi) {
        s.setT(hi)
        s.setPlaying(false)
        return
      }
      s.setT(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, win, hi])

  const [a, b] = win
  const span = b - a
  const x = (v: number) => ((v - a) / span) * width
  const toT = (px: number) => a + (px / width) * span
  const { step, precision } = pickStep(span, width)
  const tickList = useMemo(() => ticks(a, b, step), [a, b, step])
  const placed = useMemo(() => (content ? layoutEvents(content.events, x, width) : []), [content, a, b, width])
  const readout = formatT(t, span < 2 ? 'day' : span < 8 ? 'month' : 'year')

  const clampWin = (na: number, nb: number): [number, number] => {
    const s = Math.min(hi - lo, Math.max(MIN_SPAN, nb - na))
    const l = Math.max(lo, Math.min(hi - s, na))
    return [l, l + s]
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
    if (mode === 'scrub') setT(toT(e.clientX - track.current!.getBoundingClientRect().left))
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.mode === 'scrub') setT(toT(e.clientX - track.current!.getBoundingClientRect().left))
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
  }, [step, setPlaying, setT])

  if (!content) return null
  const phases = content.eras.filter((e) => e.kind === 'phase')
  const viceroys = content.eras.filter((e) => e.kind === 'viceroy')
  const viceroyNow = viceroys.find((v) => v.from.t <= t && t < v.to.t)

  return (
    <div className="timeline" onWheel={onWheel}>
      <div className="timeline-head">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="readout">{readout}</div>
        {viceroyNow && (
          <div className="now-viceroy">
            {t < 1858.83 ? 'Governor-General' : 'Viceroy'}: {viceroyNow.name}
          </div>
        )}
        <div className="timeline-hint">scroll to zoom · drag the scale to pan · space to play</div>
      </div>
      <div ref={track} className="track">
        <svg width={width} height={HEIGHT} onPointerMove={onMove} onPointerUp={onUp}>
          <rect x={0} y={0} width={width} height={H.scale} className="scale-band" onPointerDown={(e) => onDown(e, 'pan')} />
          {tickList.map((v) => (
            <text key={v} x={x(v)} y={13} className="tick-label" pointerEvents="none">
              {formatT(v + 1e-6, precision)}
            </text>
          ))}
          <rect x={0} y={H.scale} width={width} height={HEIGHT - H.scale} className="track-band" onPointerDown={(e) => onDown(e, 'scrub')} />
          {tickList.map((v) => (
            <line key={v} x1={x(v)} x2={x(v)} y1={H.scale} y2={HEIGHT} className="tick" pointerEvents="none" />
          ))}
          {phases.map((p, i) => {
            const x0 = Math.max(0, x(p.from.t))
            const x1 = Math.min(width, x(p.to.t))
            if (x1 <= 0 || x0 >= width) return null
            return (
              <g key={p.id} pointerEvents="none">
                <rect x={x0} y={H.phase[0]} width={x1 - x0} height={H.phase[1]} fill={PHASE_FILLS[i % 2]} />
                {x1 - x0 > p.name.length * 6.2 + 10 && (
                  <text x={x0 + 6} y={H.phase[0] + 11.5} className="phase-label">
                    {p.name}
                  </text>
                )}
              </g>
            )
          })}
          {viceroys.map((v, i) => {
            const x0 = Math.max(0, x(v.from.t))
            const x1 = Math.min(width, x(v.to.t))
            if (x1 <= 0 || x0 >= width) return null
            const on = v === viceroyNow
            return (
              <g key={v.id} pointerEvents="none">
                <rect x={x0} y={H.viceroy[0]} width={Math.max(0, x1 - x0 - 1)} height={H.viceroy[1]} className={`viceroy${on ? ' on' : ''}${i % 2 ? ' alt' : ''}`} />
                {x1 - x0 > v.name.length * 5.6 + 6 && (
                  <text x={x0 + 4} y={H.viceroy[0] + 9.5} className="viceroy-label">
                    {v.name}
                  </text>
                )}
              </g>
            )
          })}
          {content.keyframes.map((k) => (
            <g key={k.date.t} transform={`translate(${x(k.date.t)},${H.lanes - 3})`} className="keyframe" onPointerDown={(e) => e.stopPropagation()} onClick={() => setT(k.date.t + 0.001)}>
              <path d="M0,-4 l4,4 l-4,4 l-4,-4 z" />
              <title>{`${k.date.label}: ${k.note}`}</title>
            </g>
          ))}
          {placed.map(({ e, x: ex, lane, label }) => {
            const cy = H.lanes + H.lane * lane + H.lane / 2 + 2
            const r = badgeR(e.significance)
            const d = kindDef(e.kind)
            const sel = selection?.kind === 'event' && selection.id === e.id
            const past = e.date.t <= t
            return (
              <g
                key={e.id}
                className={`ev${sel ? ' selected' : ''}${past ? '' : ' future'}`}
                onPointerDown={(ev) => ev.stopPropagation()}
                onPointerEnter={() => setHover({ e, x: ex })}
                onPointerLeave={() => setHover(null)}
                onClick={() => {
                  setT(e.date.t)
                  select({ kind: 'event', id: e.id })
                }}
              >
                {e.end && <rect x={ex} y={cy - 2} width={Math.max(0, x(e.end.t) - ex)} height={4} rx={2} fill={d.color} opacity={0.35} />}
                <circle cx={ex} cy={cy} r={r} fill={d.color} />
                <g transform={`translate(${ex},${cy}) scale(${(r * 1.25) / 24}) translate(-12,-12)`}>
                  <path d={d.glyph} className="ev-glyph" />
                </g>
                {label && (
                  <text x={ex + r + 4} y={cy + 4} className="ev-label">
                    {e.name}
                  </text>
                )}
              </g>
            )
          })}
          <g transform={`translate(${x(t)},0)`} pointerEvents="none">
            <line y1={H.scale} y2={HEIGHT} className="playhead" />
            <path d="M-6,14 L6,14 L0,21 z" className="playhead-cap" />
          </g>
        </svg>
        {hover && (
          <div className="ev-tip" style={{ left: Math.min(width - 260, Math.max(0, hover.x - 20)) }}>
            <div className="ev-tip-kind" style={{ color: kindDef(hover.e.kind).color }}>
              {kindDef(hover.e.kind).label}
            </div>
            <div className="ev-tip-name">{hover.e.name}</div>
            <div className="ev-tip-date">
              {hover.e.date.label}
              {hover.e.end ? ` – ${hover.e.end.label}` : ''}
            </div>
            <div className="ev-tip-sum">{hover.e.summary.slice(0, 140)}{hover.e.summary.length > 140 ? '…' : ''}</div>
          </div>
        )}
      </div>
    </div>
  )
}
