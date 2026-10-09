import type { CDate, Precision } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysIn = (y: number) => (isLeap(y) ? 366 : 365)
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function dayOfYear(y: number, m: number, d: number): number {
  let n = d - 1
  for (let i = 0; i < m - 1; i++) n += MONTH_DAYS[i] + (i === 1 && isLeap(y) ? 1 : 0)
  return n
}

/** "1757", "1757-06", "1757-06-23" (negative years allowed for BCE) -> start-of-period fractional year. */
export function parseDate(s: string, approx = false): CDate {
  const m = /^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s.trim())
  if (!m) throw new Error(`Bad date "${s}"`)
  const y = Number(m[1])
  const mo = m[2] ? Number(m[2]) : undefined
  const d = m[3] ? Number(m[3]) : undefined
  const precision: Precision = d ? 'day' : mo ? 'month' : 'year'
  const t = y + dayOfYear(y, mo ?? 1, d ?? 1) / daysIn(y)
  return { t, precision, label: formatDate(y, mo, d, approx), ...(approx ? { approx } : {}) }
}

function formatDate(y: number, mo?: number, d?: number, approx = false): string {
  const yr = y < 0 ? `${-y} BCE` : `${y}`
  const core = d ? `${d} ${MONTHS[mo! - 1]} ${yr}` : mo ? `${MONTHS[mo - 1]} ${yr}` : yr
  return approx ? `c. ${core}` : core
}

/** Fractional year -> label at the given precision. */
export function formatT(t: number, precision: Precision): string {
  const y = Math.floor(t)
  if (precision === 'year') return formatDate(y)
  let doy = Math.floor((t - y) * daysIn(y))
  let mo = 0
  while (mo < 11) {
    const len = MONTH_DAYS[mo] + (mo === 1 && isLeap(y) ? 1 : 0)
    if (doy < len) break
    doy -= len
    mo++
  }
  return precision === 'month' ? formatDate(y, mo + 1) : formatDate(y, mo + 1, doy + 1)
}

/** Length of one day in fractional-year units, near year t. */
export const DAY = 1 / 365.25
