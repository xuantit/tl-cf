import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalyticsRange, SeriesPoint } from '../../types/analytics'
import { formatCompact } from '../../utils/format'

interface MetricsChartProps {
  series: SeriesPoint[]
  range?: AnalyticsRange
  height?: number
}

function tickLabel(ts: string, range: AnalyticsRange): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  if (range === '24h') {
    return `${String(d.getHours()).padStart(2, '0')}:00`
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Console 1a requests chart (.bars): dense mono bar chart for /analytics series. */
export default function MetricsChart({ series, range = '24h', height = 170 }: MetricsChartProps) {
  const data = useMemo(
    () => series.map((p) => ({ ...p, label: tickLabel(p.ts, range) })),
    [series, range],
  )

  return (
    <div style={{ height }} className="w-full px-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke="var(--stroke-2)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--stroke)' }}
            tick={{ fill: 'var(--fg-3)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            width={40}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--fg-3)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip
            cursor={{ fill: 'var(--bg-hover)' }}
            contentStyle={{
              background: 'var(--bg)',
              border: '1px solid var(--stroke)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--fg)',
            }}
            formatter={(value) => [formatCompact(Number(value)), 'requests']}
            labelStyle={{ color: 'var(--fg-3)' }}
          />
          <Bar dataKey="requests" fill="var(--accent)" opacity={0.75} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

