import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EcgBenchmarkRequest, EcgBenchmarkResponse, ModelTrainingResult, Participant, VerifyAttempt } from '../types'

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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5104'

const percentDisplay = (value?: number) => {
  if (typeof value !== 'number') return '-'
  return `${(value * 100).toFixed(1)}%`
}

const countDisplay = (value?: number) => {
  if (typeof value !== 'number') return '-'
  return value.toLocaleString()
}

const metricImageSources = [
  {
    key: 'roc_curve.png',
    title: 'ROC curve',
    sources: [`${API_BASE_URL}/api/ecg-auth/metrics/roc_curve.png`, '/metrics/roc_curve.png'],
  },
  {
    key: 'score_distribution.png',
    title: 'Score distribution',
    sources: [`${API_BASE_URL}/api/ecg-auth/metrics/score_distribution.png`, '/metrics/score_distribution.png'],
  },
]

const AnalyticsTab = ({
  lastRefreshed,
  onRefresh,
  benchmark,
  benchmarkLoading,
  benchmarkError,
  onRunBenchmark,
  benchmarkDefaults,
}: AnalyticsTabProps) => {
  const [benchmarkPairs, setBenchmarkPairs] = useState<number>(benchmarkDefaults?.maxPairsPerUser ?? 600)
  const [benchmarkSplit, setBenchmarkSplit] = useState<number>(benchmarkDefaults?.testFraction ?? 0.4)
  const [imageSourceIndex, setImageSourceIndex] = useState<Record<string, number>>({
    'roc_curve.png': 0,
    'score_distribution.png': 0,
  })

  useEffect(() => {
    if (benchmarkDefaults?.maxPairsPerUser) setBenchmarkPairs(benchmarkDefaults.maxPairsPerUser)
    if (benchmarkDefaults?.testFraction) setBenchmarkSplit(benchmarkDefaults.testFraction)
  }, [benchmarkDefaults])

  const benchmarkMetricBars = useMemo(() => {
    if (!benchmark?.metrics) return []
    return [
      { metric: 'Accuracy', value: Number((benchmark.metrics.accuracy * 100).toFixed(2)) },
      { metric: 'AUC', value: Number((benchmark.metrics.areaUnderRocCurve * 100).toFixed(2)) },
      { metric: 'F1', value: Number((benchmark.metrics.f1Score * 100).toFixed(2)) },
    ]
  }, [benchmark])

  const handleBenchmarkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onRunBenchmark) return

    const maxPairsPerUser = Math.max(100, Math.round(benchmarkPairs / 50) * 50)
    const testFraction = Math.min(0.8, Math.max(0.2, Number(benchmarkSplit.toFixed(2))))
    onRunBenchmark({ maxPairsPerUser, testFraction })
  }

  const handleImageError = (key: string, maxIndex: number) => {
    setImageSourceIndex((prev) => {
      const next = { ...prev }
      const current = next[key] ?? 0
      next[key] = Math.min(current + 1, maxIndex)
      return next
    })
  }

  return (
    <div className="panel analytics-panel">
      <header className="panel-header">
        <div>
          <h2>Analytics</h2>
          <p>Benchmark-focused view based only on benchmark API return.</p>
        </div>
        <div className="header-actions">
          <span className="last-refresh">
            {lastRefreshed ? `Last refreshed ${format(new Date(lastRefreshed), 'MMM d HH:mm')}` : 'No refresh yet'}
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
          <h3>Benchmark</h3>
          <p>Run ECG-ID benchmark and display only returned metrics.</p>
        </header>

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
            {benchmarkLoading ? 'Running benchmark...' : 'Run ECG-ID benchmark'}
          </button>
        </form>
        {benchmarkError && <p className="form-hint error">{benchmarkError}</p>}
      </section>

      <section className="cards-grid">
        <article className="card">
          <p className="card-title">Dataset</p>
          <p className="card-value">{benchmark?.dataset?.toUpperCase() ?? '-'}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">Subjects / Sessions</p>
          <p className="card-value">{countDisplay(benchmark?.subjectCount)} / {countDisplay(benchmark?.sessionCount)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">Train / Test</p>
          <p className="card-value">{percentDisplay(benchmark?.trainFraction)} / {percentDisplay(benchmark?.testFraction)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">Accuracy</p>
          <p className="card-value">{percentDisplay(benchmark?.metrics.accuracy)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">AUC</p>
          <p className="card-value">{percentDisplay(benchmark?.metrics.areaUnderRocCurve)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">F1 score</p>
          <p className="card-value">{percentDisplay(benchmark?.metrics.f1Score)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">Session count</p>
          <p className="card-value">{countDisplay(benchmark?.metrics.sessionCount)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
        <article className="card">
          <p className="card-title">Pair count</p>
          <p className="card-value">{countDisplay(benchmark?.metrics.pairCount)}</p>
          <p className="card-hint">From benchmark return</p>
        </article>
      </section>

      {benchmarkMetricBars.length === 0 ? (
        <div className="empty-state">
          <p>No benchmark result yet. Run ECG-ID benchmark to populate this section.</p>
        </div>
      ) : (
        <section className="chart-section">
          <header>
            <h3>Benchmark metrics graph</h3>
            <p>Built only from returned benchmark values: accuracy, AUC, and F1.</p>
          </header>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={benchmarkMetricBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                <Legend />
                <Bar dataKey="value" name="Value" fill="#1f5f5b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="chart-section">
        <header>
          <h3>Training visuals</h3>
          <p>Loaded from backend metrics API (fallback to local public/metrics).</p>
        </header>
        <div className="metrics-gallery">
          {metricImageSources.map((image) => {
            const idx = imageSourceIndex[image.key] ?? 0
            const src = image.sources[idx]
            const exhausted = idx >= image.sources.length

            if (exhausted) return null

            return (
              <figure key={image.key}>
                <img
                  src={src}
                  alt={`${image.title} from latest training`}
                  loading="lazy"
                  onError={() => handleImageError(image.key, image.sources.length)}
                />
                <figcaption>{image.title}</figcaption>
              </figure>
            )
          })}
          {metricImageSources.every((image) => (imageSourceIndex[image.key] ?? 0) >= image.sources.length) && (
            <p className="empty-state small">
              No training visuals found yet. Run benchmark/training, then generate plots with the backend tools.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

export default AnalyticsTab
