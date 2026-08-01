/** Compact number: 18432011 → "18.4M". */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

/** Bytes → human unit, e.g. 1363148800 → { value: "1.27", unit: "GB" }. */
export function formatBytes(bytes: number): { value: string; unit: string } {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return { value: i === 0 ? String(Math.round(v)) : v.toFixed(2), unit: units[i] }
}

/** Bytes → single display string, e.g. 1363148800 → "1.27 GB". */
export function formatBytesStr(bytes: number): string {
  const { value, unit } = formatBytes(bytes)
  return `${value} ${unit}`
}

/** Cache hit ratio 0..1 → "94.2". */
export function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1)
}

/** Share of a total as "34%" (one decimal below 10%). */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return '0%'
  const pct = (part / total) * 100
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`
}

/** Compact relative age token: "now", "5m", "3h", "2d", "1w", "2mo", "1y". */
export function formatAgo(input: string | number | Date, now: Date = new Date()): string {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  const s = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

/** Local wall-clock time "15:41:02", or "15:41:02.118" with `withMs`. */
export function formatClock(input: string | number | Date, withMs = false): string {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  const base = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  return withMs ? `${base}.${p(d.getMilliseconds(), 3)}` : base
}

/** Day bucket for timeline grouping: today / yesterday / older + "dd/MM/yyyy" label. */
export function dateGroup(
  input: string | number | Date,
  now: Date = new Date(),
): { key: 'today' | 'yesterday' | 'other'; date: string } {
  const d = new Date(input)
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  return { key: diffDays === 0 ? 'today' : diffDays === 1 ? 'yesterday' : 'other', date }
}

/** Best-effort "Chrome · Windows" from a raw user agent; falls back to the raw string. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return '?'
  const browser = /edg(?:e|a|ios)?\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /firefox\//i.test(ua)
        ? 'Firefox'
        : /chrome|crios\//i.test(ua)
          ? 'Chrome'
          : /safari\//i.test(ua)
            ? 'Safari'
            : /curl|wget|postman|axios|node/i.test(ua)
              ? 'CLI'
              : null
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /mac os|macintosh/i.test(ua)
        ? 'macOS'
        : /android/i.test(ua)
          ? 'Android'
          : /linux/i.test(ua)
            ? 'Linux'
            : null
  if (browser && os) return `${browser} · ${os}`
  if (browser || os) return (browser || os) as string
  return ua.length > 42 ? `${ua.slice(0, 42)}…` : ua
}
