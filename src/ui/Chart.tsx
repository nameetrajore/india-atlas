import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { ChartData } from '../types'

// Small explanatory charts (dataviz skill): one series, one hue, thin marks, recessive axes,
// hover tooltips, the current date marked, and a table view.
const H = 150
const M = { top: 10, right: 44, bottom: 22, left: 34 }
const INK_MUTED = '#8a7660'
const GRID = '#e2d4b6'
const SERIES = '#9c3d25'
const SURFACE = '#f3ead7'

const fmt = (v: number) => String(Number(v >= 100 ? v.toFixed(0) : v.toFixed(1)))

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((x) => x >= v) ?? v
}

export function Chart({ id }: { id: string }) {
  const chart = useStore((s) => s.content?.charts.find((c) => c.id === id))
  const t = useStore((s) => s.t)
  const sources = useStore((s) => s.content?.sources)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(360)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  if (!chart) return null
  return (
    <figure className="chart" ref={box}>
      <figcaption>
        <span className="chart-title">{chart.title}</span>
        <span className="chart-sub">{chart.subtitle}</span>
      </figcaption>
      {table ? (
        <DataTable chart={chart} />
      ) : chart.kind === 'line' ? (
        <Line chart={chart} w={w} t={t} hover={hover} setHover={setHover} />
      ) : (
        <Ranges chart={chart} w={w} hover={hover} setHover={setHover} />
      )}
      <div className="chart-foot">
        {chart.note && <span>{chart.note}</span>}{' '}
        <span className="muted">Source: {chart.sources.map((s) => sources?.[s]?.title.split(',')[0]).join('; ')}.</span>{' '}
        <button className="link-btn small" onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show data'}
        </button>
      </div>
    </figure>
  )
}

function Line({ chart, w, t, hover, setHover }: { chart: ChartData; w: number; t: number; hover: number | null; setHover: (i: number | null) => void }) {
  const pts = chart.points
  const x0 = pts[0][0]
  const x1 = pts[pts.length - 1][0]
  const yMax = niceMax(Math.max(...pts.map((p) => p[1])))
  const iw = w - M.left - M.right
  const ih = H - M.top - M.bottom
  const x = (v: number) => M.left + ((v - x0) / (x1 - x0)) * iw
  const y = (v: number) => M.top + ih - (v / yMax) * ih
  // Step charts hold each value until the next change (borders change in steps, not slopes).
  const d = pts
    .map((p, i) => {
      const px = x(p[0]).toFixed(1)
      const py = y(p[1]).toFixed(1)
      if (!i) return `M${px},${py}`
      return chart.step ? `H${px}V${py}` : `L${px},${py}`
    })
    .join('')
  const area = `${d}L${x(x1)},${y(0)}L${x(x0)},${y(0)}Z`
  const ticks = [0, yMax / 2, yMax]
  const yearTicks = [Math.ceil(x0), Math.round((x0 + x1) / 2 / 50) * 50, Math.floor(x1)]
  const inRange = t >= x0 && t <= x1
  // Value at t, linearly interpolated, for the "now" marker.
  let now: number | null = null
  for (let i = 1; i < pts.length && inRange; i++)
    if (t <= pts[i][0]) {
      const f = (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1)
      now = chart.step ? pts[i - 1][1] : pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])
      break
    }
  const last = pts[pts.length - 1]
  const hv = hover !== null ? pts[hover] : null
  return (
    <div className="chart-plot">
      <svg
        width={w}
        height={H}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect()
          const px = e.clientX - r.left
          let best = 0
          pts.forEach((p, i) => (Math.abs(x(p[0]) - px) < Math.abs(x(pts[best][0]) - px) ? (best = i) : 0))
          setHover(best)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={w - M.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {fmt(v)}
            </text>
          </g>
        ))}
        {yearTicks.map((v) => (
          <text key={v} x={x(v)} y={H - 6} textAnchor="middle" className="chart-axis">
            {v}
          </text>
        ))}
        <path d={area} fill={SERIES} opacity={0.1} />
        <path d={d} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.length <= 12 && !chart.step && pts.map((p) => <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />)}
        <text x={x(last[0]) + 8} y={y(last[1]) + 4} className="chart-value">
          {fmt(last[1])}
          {chart.unit}
        </text>
        {now !== null && (
          <g>
            <line x1={x(t)} x2={x(t)} y1={M.top} y2={y(0)} stroke={INK_MUTED} strokeWidth={1} />
            <circle cx={x(t)} cy={y(now)} r={5} fill={SURFACE} stroke="#2b2118" strokeWidth={2} />
            <text x={x(t)} y={M.top + 2} textAnchor={x(t) > w - 70 ? 'end' : 'start'} dx={x(t) > w - 70 ? -4 : 4} className="chart-now">
              {Math.floor(t)}: {fmt(now)}
              {chart.unit}
            </text>
          </g>
        )}
        {hv && (
          <g pointerEvents="none">
            <line x1={x(hv[0])} x2={x(hv[0])} y1={M.top} y2={y(0)} stroke={GRID} strokeWidth={1} />
            <circle cx={x(hv[0])} cy={y(hv[1])} r={6} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>
      {hv && (
        <div className="chart-tip" style={{ left: Math.min(w - 110, Math.max(0, x(hv[0]) - 40)) }}>
          <strong>{Math.floor(hv[0])}</strong> {fmt(hv[1])}
          {chart.unit}
        </div>
      )}
    </div>
  )
}

function Ranges({ chart, w, hover, setHover }: { chart: ChartData; w: number; hover: number | null; setHover: (i: number | null) => void }) {
  const rows = chart.ranges
  const rowH = 26
  const labelW = Math.min(w * 0.5, Math.max(...rows.map((r) => r.label.length)) * 6.3 + 10)
  const max = niceMax(Math.max(...rows.map((r) => r.max)))
  const iw = w - labelW - 40
  const x = (v: number) => labelW + (v / max) * iw
  const h = rows.length * rowH + 22
  return (
    <div className="chart-plot">
      <svg width={w} height={h} onPointerLeave={() => setHover(null)}>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={0} y2={h - 18} stroke={GRID} strokeWidth={1} />
            <text x={x(v)} y={h - 5} textAnchor="middle" className="chart-axis">
              {fmt(v)}
              {chart.unit}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = i * rowH + rowH / 2
          return (
            <g key={r.event} onPointerEnter={() => setHover(i)}>
              <rect x={0} y={cy - rowH / 2} width={w} height={rowH} fill="transparent" />
              <text x={0} y={cy + 4} className="chart-label">
                {r.label}
              </text>
              <rect x={x(r.min)} y={cy - 5} width={Math.max(4, x(r.max) - x(r.min))} height={10} rx={4} fill={SERIES} opacity={hover === i ? 1 : 0.8} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: labelW, top: hover * rowH - 30 }}>
          <strong>{rows[hover].label}</strong> {fmt(rows[hover].min)}–{fmt(rows[hover].max)} million
        </div>
      )}
    </div>
  )
}

function DataTable({ chart }: { chart: ChartData }) {
  return (
    <table className="chart-table">
      <tbody>
        {chart.kind === 'line'
          ? chart.points.map((p) => (
              <tr key={p[0]}>
                <td>{Math.floor(p[0])}</td>
                <td>
                  {fmt(p[1])}
                  {chart.unit}
                </td>
              </tr>
            ))
          : chart.ranges.map((r) => (
              <tr key={r.event}>
                <td>{r.label}</td>
                <td>
                  {fmt(r.min)}–{fmt(r.max)} million
                </td>
              </tr>
            ))}
      </tbody>
    </table>
  )
}
