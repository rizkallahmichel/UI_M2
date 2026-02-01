import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Participant, VerifyAttempt } from '../types'

type AnalyticsTabProps = {
  attempts: VerifyAttempt[]
  participants: Participant[]
  lastRefreshed?: string
  onRefresh?: () => void
}

const AnalyticsTab = ({ attempts, participants, lastRefreshed, onRefresh }: AnalyticsTabProps) => {
  const sortedAttempts = useMemo(
    () => [...attempts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [attempts],
  )

  const timelineData = sortedAttempts.map((attempt) => ({
    time: format(new Date(attempt.timestamp), 'MMM d HH:mm'),
    score: Number(attempt.score.toFixed(3)),
    threshold: Number(attempt.threshold.toFixed(3)),
    participant: attempt.alias ?? attempt.participantId,
    label: attempt.label ?? 'unlabeled',
  }))

  const genuineAttempts = attempts.filter((attempt) => attempt.label === 'genuine')
  const impostorAttempts = attempts.filter((attempt) => attempt.label === 'impostor')

  const far = impostorAttempts.length
    ? impostorAttempts.filter((attempt) => attempt.passed).length / impostorAttempts.length
    : 0
  const frr = genuineAttempts.length
    ? genuineAttempts.filter((attempt) => !attempt.passed).length / genuineAttempts.length
    : 0
  const eer = (far + frr) / 2

  const distributionData = [
    {
      label: 'Genuine',
      pass: genuineAttempts.filter((attempt) => attempt.passed).length,
      fail: genuineAttempts.filter((attempt) => !attempt.passed).length,
    },
    {
      label: 'Impostor',
      pass: impostorAttempts.filter((attempt) => attempt.passed).length,
      fail: impostorAttempts.filter((attempt) => !attempt.passed).length,
    },
  ]

  return (
    <div className="panel analytics-panel">
      <header className="panel-header">
        <div>
          <h2>Analytics</h2>
          <p>Plot verification quality, label coverage, and tune your biometric threshold.</p>
        </div>
        <div className="header-actions">
          <span className="last-refresh">
            {lastRefreshed ? `Last refreshed ${format(new Date(lastRefreshed), 'MMM d HH:mm')}` : 'Updates with new attempts'}
          </span>
          {onRefresh && (
            <button className="ghost-btn" onClick={onRefresh}>
              Refresh analytics
            </button>
          )}
        </div>
      </header>

      <section className="cards-grid">
        <article className="card">
          <p className="card-title">Attempts logged</p>
          <p className="card-value">{attempts.length}</p>
          <p className="card-hint">{participants.length} participants</p>
        </article>
        <article className="card">
          <p className="card-title">FAR</p>
          <p className="card-value">{(far * 100).toFixed(1)}%</p>
          <p className="card-hint">False Accept Rate (impostor pass)</p>
        </article>
        <article className="card">
          <p className="card-title">FRR</p>
          <p className="card-value">{(frr * 100).toFixed(1)}%</p>
          <p className="card-hint">False Reject Rate (genuine fail)</p>
        </article>
        <article className="card">
          <p className="card-title">EER est.</p>
          <p className="card-value">{(eer * 100).toFixed(1)}%</p>
          <p className="card-hint">Approximate equal-error threshold</p>
        </article>
      </section>

      <section className="chart-section">
        <header>
          <h3>Scores over time</h3>
          <p>Monitor score drift per participant to spot watch fit or physiological changes.</p>
        </header>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 1]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="threshold" stroke="#f97316" strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="chart-section">
        <header>
          <h3>Label distribution</h3>
          <p>Compare pass/fail outcomes for genuine vs impostor attempts.</p>
        </header>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="pass" stackId="a" fill="#22c55e" />
              <Bar dataKey="fail" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}

export default AnalyticsTab
