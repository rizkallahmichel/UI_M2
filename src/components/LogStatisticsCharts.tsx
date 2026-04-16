import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Bar, BarChart, Legend } from 'recharts'
import type { VerificationLogEntry } from '../types'

type LogStatisticsChartsProps = {
  logs: VerificationLogEntry[]
}

const dayKey = (value?: string) => {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toISOString().slice(0, 10)
}

const LogStatisticsCharts = ({ logs }: LogStatisticsChartsProps) => {
  const trendData = useMemo(() => {
    const grouped = new Map<string, { day: string; success: number; failed: number }>()
    logs.forEach((log) => {
      const day = dayKey(log.attemptedAtUtc ?? log.ecgStartTimeUtc)
      const current = grouped.get(day) ?? { day, success: 0, failed: 0 }
      if (log.authenticated) current.success += 1
      else current.failed += 1
      grouped.set(day, current)
    })
    return Array.from(grouped.values())
      .filter((row) => row.day !== 'unknown')
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14)
  }, [logs])

  const resultData = useMemo(() => {
    const success = logs.filter((log) => log.authenticated).length
    const failed = logs.length - success
    return [
      { name: 'Successful', value: success, color: '#1f7a48' },
      { name: 'Failed', value: failed, color: '#c2512f' },
    ]
  }, [logs])

  if (logs.length === 0) return null

  return (
    <div className="analytics-grid">
      <div className="chart-panel">
        <p className="chart-title">Attempts trend (last 14 days)</p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 33, 38, 0.12)" />
              <XAxis dataKey="day" tickFormatter={(value) => value.slice(5)} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" name="Successful" fill="#1f7a48" radius={[6, 6, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#c2512f" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-panel">
        <p className="chart-title">Success vs fail ratio</p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={resultData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={4}>
                {resultData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default LogStatisticsCharts
