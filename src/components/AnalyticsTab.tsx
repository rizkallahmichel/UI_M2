import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import type {
  EcgBenchmarkRequest,
  EcgBenchmarkResponse,
  ModelTrainingResult,
  Participant,
  VerifyAttempt,
} from '../types'

type AnalyticsTabProps = {
  attempts: VerifyAttempt[]
  participants: Participant[]
  lastRefreshed?: string
  onRefresh?: () => void
  benchmark?: EcgBenchmarkResponse
  benchmarkLoading?: boolean
  benchmarkError?: string
  onRunBenchmark?: (options?: EcgBenchmarkRequest) => void
  benchmarkDefaults?: EcgBenchmarkRequest
  lastTrainingResult?: ModelTrainingResult | null
}

const percentDisplay = (value?: number) => {
  if (typeof value !== 'number') return '—'
  return `${(value * 100).toFixed(1)}%`
}

const percentDelta = (wearable?: number, benchmarkValue?: number) => {
  if (typeof wearable !== 'number' || typeof benchmarkValue !== 'number') return '—'
  const delta = (wearable - benchmarkValue) * 100
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)} pp`
}

const countDisplay = (value?: number) => {
  if (typeof value !== 'number') return '—'
  return value.toLocaleString()
}

const countDelta = (wearable?: number, benchmarkValue?: number) => {
  if (typeof wearable !== 'number' || typeof benchmarkValue !== 'number') return '—'
  const delta = wearable - benchmarkValue
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()}`
}

const AnalyticsTab = ({
  attempts,
  participants,
  lastRefreshed,
  onRefresh,
  benchmark,
  benchmarkLoading,
  benchmarkError,
  onRunBenchmark,
  benchmarkDefaults,
  lastTrainingResult,
}: AnalyticsTabProps) => {
  const [rocAvailable, setRocAvailable] = useState(true)
  const [histAvailable, setHistAvailable] = useState(true)
  const [benchmarkPairs, setBenchmarkPairs] = useState<number>(benchmarkDefaults?.maxPairsPerUser ?? 600)
  const [benchmarkSplit, setBenchmarkSplit] = useState<number>(benchmarkDefaults?.testFraction ?? 0.4)
  const sortedAttempts = useMemo(
    () => [...attempts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [attempts],
  )

  useEffect(() => {
    if (benchmarkDefaults?.maxPairsPerUser) {
      setBenchmarkPairs(benchmarkDefaults.maxPairsPerUser)
    }
    if (benchmarkDefaults?.testFraction) {
      setBenchmarkSplit(benchmarkDefaults.testFraction)
    }
  }, [benchmarkDefaults])

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

  const totalFitbitSessions = useMemo(
    () => participants.reduce((sum, participant) => sum + (participant.sessionCount ?? 0), 0),
    [participants],
  )

  const stageOneMetrics = benchmark?.metrics
  const stageTwoMetrics = lastTrainingResult ?? undefined
  const stageComparisonReady = Boolean(stageOneMetrics && stageTwoMetrics)

  const handleBenchmarkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onRunBenchmark) return
    const maxPairsPerUser = Math.max(100, Math.round(benchmarkPairs / 50) * 50)
    const testFraction = Math.min(0.8, Math.max(0.2, Number(benchmarkSplit.toFixed(2))))
    onRunBenchmark({
      maxPairsPerUser,
      testFraction,
    })
  }

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

      <section className="comparison-section">
        <header>
          <h3>Stage comparison</h3>
          <p>
            Stage 1 reproduces the ECG-ID benchmark (Safie et al., 2024) for reproducible citation values. Stage 2 reflects
            the live Fitbit Charge 6 deployment with drift detection and automatic retraining.
          </p>
        </header>
        <div className="comparison-grid">
          <article className="card stage-card stage-benchmark">
            <p className="stage-heading">Stage 1 · Benchmark validation</p>
            <p className="stage-highlight">{percentDisplay(stageOneMetrics?.accuracy)}</p>
            <p className="card-hint">
              {benchmark
                ? `${benchmark.dataset.toUpperCase()} · ${countDisplay(benchmark.subjectCount)} subjects / ${countDisplay(benchmark.sessionCount)} sessions`
                : 'ECG-ID subset (90 subjects / 310 sessions) · run benchmark to load live metrics'}
            </p>
            <ul className="stage-stats">
              <li>
                <span>Accuracy</span>
                <strong>{percentDisplay(stageOneMetrics?.accuracy)}</strong>
              </li>
              <li>
                <span>AUC</span>
                <strong>{percentDisplay(stageOneMetrics?.areaUnderRocCurve)}</strong>
              </li>
              <li>
                <span>F1 score</span>
                <strong>{percentDisplay(stageOneMetrics?.f1Score)}</strong>
              </li>
              <li>
                <span>Train/Test</span>
                <strong>
                  {percentDisplay(benchmark?.trainFraction)} / {percentDisplay(benchmark?.testFraction)}
                </strong>
              </li>
              <li>
                <span>Pairs trained</span>
                <strong>{countDisplay(stageOneMetrics?.pairCount)}</strong>
              </li>
            </ul>
          </article>
          <article className="card stage-card stage-wearable">
            <p className="stage-heading">Stage 2 · Wearable extension</p>
            <p className="stage-highlight">{percentDisplay(stageTwoMetrics?.accuracy)}</p>
            <p className="card-hint">
              Fitbit Charge 6 collection with drift detection + automatic retraining (last <code>Train model</code> run).
            </p>
            <ul className="stage-stats">
              <li>
                <span>Participants synced</span>
                <strong>{participants.length.toLocaleString()}</strong>
              </li>
              <li>
                <span>Fitbit sessions</span>
                <strong>{totalFitbitSessions.toLocaleString()}</strong>
              </li>
              <li>
                <span>Pairs trained</span>
                <strong>{countDisplay(stageTwoMetrics?.pairCount)}</strong>
              </li>
              <li>
                <span>AUC</span>
                <strong>{percentDisplay(stageTwoMetrics?.areaUnderRocCurve)}</strong>
              </li>
              <li>
                <span>F1 score</span>
                <strong>{percentDisplay(stageTwoMetrics?.f1Score)}</strong>
              </li>
            </ul>
            {!stageTwoMetrics && <p className="stage-empty">Run “Train model” to populate wearable metrics.</p>}
          </article>
          <article className="card stage-card stage-delta">
            <p className="stage-heading">Delta · Stage 2 − Stage 1</p>
            <p className="stage-highlight">{stageComparisonReady ? percentDelta(stageTwoMetrics?.accuracy, stageOneMetrics?.accuracy) : '—'}</p>
            <p className="card-hint">Positive deltas indicate the wearable pipeline outperforming the baseline.</p>
            {stageComparisonReady ? (
              <ul className="stage-stats">
                <li>
                  <span>Accuracy</span>
                  <strong>{percentDelta(stageTwoMetrics?.accuracy, stageOneMetrics?.accuracy)}</strong>
                </li>
                <li>
                  <span>AUC</span>
                  <strong>{percentDelta(stageTwoMetrics?.areaUnderRocCurve, stageOneMetrics?.areaUnderRocCurve)}</strong>
                </li>
                <li>
                  <span>F1 score</span>
                  <strong>{percentDelta(stageTwoMetrics?.f1Score, stageOneMetrics?.f1Score)}</strong>
                </li>
                <li>
                  <span>Pairs</span>
                  <strong>{countDelta(stageTwoMetrics?.pairCount, stageOneMetrics?.pairCount)}</strong>
                </li>
                <li>
                  <span>Sessions</span>
                  <strong>{countDelta(stageTwoMetrics?.sessionCount, stageOneMetrics?.sessionCount)}</strong>
                </li>
              </ul>
            ) : (
              <p className="stage-empty">
                Run the ECG-ID benchmark and wearable training to quantify deltas.
              </p>
            )}
          </article>
        </div>
        <form className="benchmark-form" onSubmit={handleBenchmarkSubmit}>
          <div className="benchmark-controls">
            <label>
              Max pairs per user
              <input
                type="number"
                min={100}
                max={1500}
                step={50}
                value={benchmarkPairs}
                onChange={(event) => setBenchmarkPairs(Number(event.target.value))}
              />
            </label>
            <label>
              Test fraction
              <input
                type="number"
                min={0.2}
                max={0.8}
                step={0.05}
                value={benchmarkSplit}
                onChange={(event) => setBenchmarkSplit(Number(event.target.value))}
              />
            </label>
          </div>
          <button type="submit" className="primary" disabled={!onRunBenchmark || benchmarkLoading}>
            {benchmarkLoading ? 'Running benchmark…' : 'Run ECG-ID benchmark'}
          </button>
        </form>
        {benchmarkError && <p className="form-hint error">{benchmarkError}</p>}
      </section>

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
