import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
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
  const [rocAvailable, setRocAvailable] = useState(true)
  const [histAvailable, setHistAvailable] = useState(true)
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

  const latestConfidence = attempts.find((attempt) => attempt.confidence)?.confidence
  const confidenceLevelDisplay = latestConfidence ? `${(latestConfidence.confidenceLevel * 100).toFixed(0)}%` : 'N/A'
  const driftDisplay = latestConfidence ? `${(latestConfidence.drift * 100).toFixed(1)}%` : 'N/A'

  const scatterBase = useMemo(
    () =>
      sortedAttempts.map((attempt, index) => ({
        index,
        score: Number(attempt.score.toFixed(3)),
        alias: attempt.alias ?? attempt.participantId,
        label: attempt.label ?? 'unlabeled',
        passed: attempt.passed,
        threshold: Number(attempt.threshold.toFixed(3)),
      })),
    [sortedAttempts],
  )

  const scatterSeries = useMemo(
    () => ({
      genuine: scatterBase.filter((point) => point.label === 'genuine'),
      impostor: scatterBase.filter((point) => point.label === 'impostor'),
      unlabeled: scatterBase.filter((point) => point.label !== 'genuine' && point.label !== 'impostor'),
    }),
    [scatterBase],
  )

  const avgThreshold = attempts.length
    ? attempts.reduce((sum, attempt) => sum + attempt.threshold, 0) / attempts.length
    : 0.85

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
        <article className="card">
          <p className="card-title">Confidence</p>
          <p className="card-value">{confidenceLevelDisplay}</p>
          <p className="card-hint">
            {latestConfidence ? `Drift ${driftDisplay}` : 'Label attempts to enable drift monitoring'}
          </p>
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
          <h3>Genuine vs impostor tests</h3>
          <p>Each point is a verification attempt colored by the operator label.</p>
        </header>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="index"
                name="Attempt #"
                tickFormatter={(value) => (Number(value) + 1).toString()}
              />
              <YAxis dataKey="score" domain={[0, 1]} name="Score" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value, name) => {
                  const numericValue = Number(value)
                  if (name === 'score') return [numericValue.toFixed(2), 'Score']
                  if (name === 'index') return [Math.round(numericValue + 1), 'Attempt #']
                  return [value, name as string]
                }}
                labelFormatter={(value) => `Attempt ${Number(value) + 1}`}
              />
              <Legend />
              <ReferenceLine y={avgThreshold} stroke="#f97316" strokeDasharray="4 4" label="Avg threshold" />
              {scatterSeries.genuine.length > 0 && (
                <Scatter name="Genuine" data={scatterSeries.genuine} fill="#22c55e" />
              )}
              {scatterSeries.impostor.length > 0 && (
                <Scatter name="Impostor" data={scatterSeries.impostor} fill="#ef4444" />
              )}
              {scatterSeries.unlabeled.length > 0 && (
                <Scatter name="Unlabeled" data={scatterSeries.unlabeled} fill="#94a3b8" />
              )}
            </ScatterChart>
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

      <section className="chart-section">
        <header>
          <h3>Training visuals</h3>
          <p>Drop FitServer docs/metrics PNGs into <code>public/metrics</code> to surface ROC and score plots.</p>
        </header>
        <div className="metrics-gallery">
          {rocAvailable && (
            <figure>
              <img
                src="/metrics/roc_curve.png"
                alt="ROC curve from the latest model training run"
                loading="lazy"
                onError={() => setRocAvailable(false)}
              />
              <figcaption>ROC curve (docs/metrics/roc_curve.png)</figcaption>
            </figure>
          )}
          {histAvailable && (
            <figure>
              <img
                src="/metrics/score_distribution.png"
                alt="Score distribution from the latest model training run"
                loading="lazy"
                onError={() => setHistAvailable(false)}
              />
              <figcaption>Score distribution (docs/metrics/score_distribution.png)</figcaption>
            </figure>
          )}
          {!rocAvailable && !histAvailable && (
            <p className="empty-state small">
              Generate plots via <code>python tools/plot_train_metrics.py --scores bin/Debug/net9.0/reports/train_scores.csv</code> inside{' '}
              <code>fyp_fitbit_server</code> and copy <code>docs/metrics/*.png</code> into <code>public/metrics</code>.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

export default AnalyticsTab
