// Number and time formatting for viewer overlays (decimal comma, pt-PT).

const formatters = new Map<number, Intl.NumberFormat>()

export function fmtNum(v: number, digits = 1): string {
  let f = formatters.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })
    formatters.set(digits, f)
  }
  return f.format(v)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** «00:01,13» — minutes:seconds,centiseconds. */
export function fmtClock(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return '—'
  const cs = Math.max(0, Math.round(sec * 100))
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${pad2(m)}:${pad2(s)},${pad2(cs % 100)}`
}

/** «00:03,2» — compact form for ranges in the findings list. */
export function fmtClockShort(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return '—'
  const ds = Math.max(0, Math.round(sec * 10))
  const m = Math.floor(ds / 600)
  const s = Math.floor((ds % 600) / 10)
  return `${pad2(m)}:${pad2(s)},${ds % 10}`
}
