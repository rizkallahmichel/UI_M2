import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { VerifyAttempt } from '../types'

type VerificationChartsProps = {
  attempts: VerifyAttempt[]
}

const VerificationCharts = ({ attempts }: VerificationChartsProps) => {
  const chartPoints = useMemo(
    () =>
      attempts
        .slice()
        .reverse()
        .map((attempt, index) => ({
          index,
          score: Number(attempt.score.toFixed(3)),
          threshold: Number(attempt.threshold.toFixed(3)),
          result: attempt.passed ? 'pass' : 'fail',
        })),
    [attempts],
  )

  const scatterSeries = useMemo(
    () => ({
      pass: chartPoints.filter((point) => point.result === 'pass'),
      fail: chartPoints.filter((point) => point.result === 'fail'),
    }),
    [chartPoints],
  )

  const distributionData = useMemo(
    () => [
      { label: 'Passed', count: attempts.filter((attempt) => attempt.passed).length },
      { label: 'Rejected', count: attempts.filter((attempt) => !attempt.passed).length },
    ],
    [attempts],
  )

  const avgThreshold = attempts.length
    ? attempts.reduce((sum, attempt) => sum + attempt.threshold, 0) / attempts.length
    : 0.85

  return (
    <div className="analytics-grid">
      <div className="chart-panel">
        <p className="chart-title">Score scatter</p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 33, 38, 0.12)" />
              <XAxis type="number" dataKey="index" name="Attempt" tickFormatter={(value) => `${Number(value) + 1}`} allowDecimals={false} />
              <YAxis type="number" dataKey="score" name="Score" domain={[0, 1]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => {
                  if (name === 'score' || name === 'threshold') return [Number(value).toFixed(3), name]
                  return [value, name as string]
                }}
                labelFormatter={(value) => `Attempt ${Number(value) + 1}`}
              />
              <Legend />
              <ReferenceLine y={avgThreshold} stroke="#c2512f" strokeDasharray="4 4" label="Avg threshold" />
              {scatterSeries.pass.length > 0 && <Scatter name="Pass" data={scatterSeries.pass} fill="#1f7a48" />}
              {scatterSeries.fail.length > 0 && <Scatter name="Rejected" data={scatterSeries.fail} fill="#c2512f" />}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-panel">
        <p className="chart-title">Result distribution</p>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 33, 38, 0.12)" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#1f5f5b" name="Attempts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default VerificationCharts
