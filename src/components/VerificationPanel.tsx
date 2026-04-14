import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import clsx from 'clsx'
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
import type { CurrentFitbitUser, Participant, VerifyAttempt } from '../types'
import ScoreMeter from './ScoreMeter'

type VerificationPanelProps = {
  participants: Participant[]
  connectedUser?: CurrentFitbitUser
  selectedParticipantId?: string
  onSelectParticipant: (id: string) => void
  onVerify: (threshold: number, label?: 'genuine' | 'impostor', notes?: string) => void
  isVerifying: boolean
  latestResult: VerifyAttempt | null
  errorMessage?: string
  attempts: VerifyAttempt[]
  onGoToCollection?: () => void
}

const thresholds = [0.6, 0.7, 0.8, 0.85, 0.9]

const stringifyPayload = (value: unknown) => {
  if (value == null) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const VerificationPanel = ({
  participants,
  connectedUser,
  selectedParticipantId,
  onSelectParticipant,
  onVerify,
  isVerifying,
  latestResult,
  errorMessage,
  attempts,
  onGoToCollection,
}: VerificationPanelProps) => {
  const [threshold, setThreshold] = useState(0.85)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setNotes(latestResult?.notes ?? '')
  }, [latestResult?.id, latestResult?.notes])

  const verificationParticipantId = connectedUser?.fitbitUserId ?? selectedParticipantId
  const selectedParticipant = participants.find((participant) => participant.id === verificationParticipantId)
  const connectedIdentityLabel = selectedParticipant?.alias ?? connectedUser?.displayName ?? verificationParticipantId ?? 'Unavailable'
  const totalComparisons = latestResult?.comparisons.length ?? 0
  const backendPayload = stringifyPayload(latestResult?.rawPayload ?? latestResult)
  const isPoorSignalError = (errorMessage ?? '').toLowerCase().includes('signal quality is insufficient')
  const hasVerificationError = Boolean(errorMessage)
  const metrics = useMemo(() => {
    if (!latestResult) return []
    const consensus = latestResult.consensusScore ?? latestResult.score
    return [
      {
        title: 'Backend verdict',
        value: latestResult.passed ? 'Authenticated' : 'Rejected',
        hint: latestResult.passed ? 'The score passed the selected threshold' : 'The score stayed below the selected threshold',
        tone: latestResult.passed ? 'pass' : 'fail',
      },
      {
        title: 'Consensus score',
        value: consensus.toFixed(3),
        hint: 'Top baseline similarity used for identity decision',
      },
      {
        title: 'Passing votes',
        value: `${latestResult.passingVotes ?? 0}/${totalComparisons}`,
        hint: totalComparisons > 0 ? 'Baseline sessions scoring above threshold' : 'No baseline comparison available',
      },
      {
        title: 'HRV (RMSSD)',
        value: latestResult.hrv != null ? `${latestResult.hrv.toFixed(1)} ms` : 'N/A',
        hint: latestResult.hrv != null ? 'Daily Fitbit HRV used alongside ECG' : 'HRV unavailable for this attempt',
      },
    ]
  }, [latestResult, totalComparisons])

  const confidenceSummary = useMemo(() => {
    if (!latestResult?.confidence) return null
    const level = Math.min(1, Math.max(0, latestResult.confidence.confidenceLevel))
    const drift = Math.max(0, latestResult.confidence.drift)
    return {
      levelPercentLabel: `${(level * 100).toFixed(0)}%`,
      driftPercentLabel: `${(drift * 100).toFixed(1)}%`,
      fillWidth: level * 100,
      passes: latestResult.confidence.consecutivePasses,
    }
  }, [latestResult?.confidence])

  const sweepResults = useMemo(
    () =>
      thresholds.map((value) => ({
        value,
        passed: (latestResult?.score ?? 0) >= value,
      })),
    [latestResult],
  )

  const chartPoints = useMemo(
    () =>
      attempts
        .slice()
        .reverse()
        .map((attempt, index) => ({
          index,
          score: Number(attempt.score.toFixed(3)),
          threshold: Number(attempt.threshold.toFixed(3)),
          expected: attempt.alias ?? attempt.participantId,
          label: attempt.label ?? 'unlabeled',
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
      {
        label: 'Passed',
        count: attempts.filter((attempt) => attempt.passed).length,
      },
      {
        label: 'Rejected',
        count: attempts.filter((attempt) => !attempt.passed).length,
      },
    ],
    [attempts],
  )

  const avgThreshold = attempts.length
    ? attempts.reduce((sum, attempt) => sum + attempt.threshold, 0) / attempts.length
    : 0.85

  const bestComparison = latestResult?.comparisons.reduce(
    (prev, current) => (current.probability > (prev?.probability ?? 0) ? current : prev),
    undefined as VerifyAttempt['comparisons'][number] | undefined,
  )

  const handleVerify = () => {
    onVerify(threshold, undefined, notes.trim() || undefined)
  }

  return (
    <section className="panel workflow-section verification-panel" aria-labelledby="verification-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Step 3</p>
          <h2 id="verification-title">Identity test</h2>
          <p>Run one check and immediately see whether the ECG matches the connected Fitbit account baseline.</p>
        </div>
        <div className="participant-select">
          <label htmlFor="verify-participant">Connected Fitbit identity</label>
          <select
            id="verify-participant"
            value={verificationParticipantId ?? ''}
            onChange={(event) => onSelectParticipant(event.target.value)}
            disabled={Boolean(connectedUser)}
          >
            {!connectedUser && <option value="">No preset selected</option>}
            {connectedUser ? (
              <option value={connectedUser.fitbitUserId}>
                {connectedUser.displayName
                  ? `${connectedUser.displayName} (${connectedUser.fitbitUserId})`
                  : connectedUser.fitbitUserId}
              </option>
            ) : (
              participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.alias ?? participant.id}
                </option>
              ))
            )}
          </select>
          {connectedUser && <p className="card-hint">Backend verification is tied to the current Fitbit session.</p>}
        </div>
      </header>

      {hasVerificationError && (
        <section className={clsx('feedback-banner', isPoorSignalError ? 'warning' : 'error')}>
          <div>
            <p className="feedback-title">
              {isPoorSignalError ? 'Unable to decide if this ECG belongs to the connected Fitbit user' : 'Identity test failed'}
            </p>
            <p className="feedback-copy">
              {isPoorSignalError
                ? 'The ECG signal quality is too low for reliable authentication. Please collect a new ECG sample, then run the identity test again.'
                : errorMessage}
            </p>
            {isPoorSignalError && (
              <p className="feedback-copy">
                The system cannot say yet whether this is the right user or an impostor.
              </p>
            )}
          </div>
          <div className="feedback-actions">
            {onGoToCollection && (
              <button className="primary" onClick={onGoToCollection}>
                Collect a new ECG
              </button>
            )}
            <button className="ghost-btn" disabled={isVerifying} onClick={handleVerify}>
              {isVerifying ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        </section>
      )}

      <div className="verification-layout">
        <article className="workflow-card verify-setup-card">
          <p className="step-label">Test setup</p>
          <h3>Choose how to evaluate the next ECG</h3>
          <label className="range-field">
            <span>Threshold: {threshold.toFixed(2)}</span>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
          <div className="notes-box">
            <label htmlFor="attempt-notes">Attempt notes</label>
            <textarea
              id="attempt-notes"
              placeholder="Optional local note about posture, artifacts, or capture conditions"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <button className="primary" disabled={isVerifying} onClick={handleVerify}>
            {isVerifying ? 'Running identity test…' : 'Run identity test'}
          </button>
        </article>

        <article className={clsx('workflow-card', 'verdict-card', { pass: latestResult?.passed, fail: latestResult && !latestResult.passed })}>
          <p className="step-label">Result</p>
          <h3>Latest decision</h3>
          {latestResult ? (
            <>
              <p className="verdict-title">{latestResult.passed ? 'Authenticated' : 'Not authenticated'}</p>
              <p className="verdict-copy">
                Score {latestResult.score.toFixed(3)} against threshold {latestResult.threshold.toFixed(2)} for backend Fitbit ID{' '}
                {latestResult.participantId}.
              </p>
              <p className="verdict-copy">
                Connected Fitbit identity: {connectedIdentityLabel}.
              </p>
              <div className="result-flags">
                <span className={clsx('status-pill', latestResult.passed ? 'online' : 'offline')}>
                  {latestResult.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <ScoreMeter score={latestResult.score} threshold={latestResult.threshold} />
            </>
          ) : (
            <p>No identity test has been run yet.</p>
          )}
        </article>
      </div>

      {latestResult ? (
        <>
          <div className="cards-grid compact">
            {metrics.map((metric) => (
              <article key={metric.title} className={clsx('card', metric.tone === 'pass' && 'accent-pass', metric.tone === 'fail' && 'accent-fail')}>
                <p className="card-title">{metric.title}</p>
                <p className="card-value">{metric.value}</p>
                <p className="card-hint">{metric.hint}</p>
              </article>
            ))}
            <article className="card confidence-card">
              <p className="card-title">Rolling confidence</p>
              <p className="card-value">{confidenceSummary ? confidenceSummary.levelPercentLabel : 'Need more attempts'}</p>
              <div className="confidence-meter">
                <div className="confidence-fill" style={{ width: `${confidenceSummary?.fillWidth ?? 0}%` }} />
              </div>
              <p className="card-hint">
                {confidenceSummary
                  ? `Drift ${confidenceSummary.driftPercentLabel} | ${confidenceSummary.passes} pass streak`
                  : 'Label attempts to unlock drift monitoring'}
              </p>
            </article>
          </div>

          <div className="verification-details-grid">
            <section className="workflow-card detail-card">
              <h4>Threshold sweep</h4>
              <div className="sweep-grid">
                {sweepResults.map((item) => (
                  <div key={item.value} className={item.passed ? 'pass' : 'fail'}>
                    <p>{item.value.toFixed(2)}</p>
                    <p>{item.passed ? 'PASS' : 'FAIL'}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="workflow-card detail-card">
              <h4>Comparison scores</h4>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Baseline</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestResult.comparisons.map((comparison) => (
                      <tr key={comparison.id} className={comparison.id === bestComparison?.id ? 'highlight' : ''}>
                        <td>{comparison.sessionLabel}</td>
                        <td>{comparison.probability.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="workflow-card raw-response-card">
            <h4>Raw backend response</h4>
            <p>This mirrors the response body you would otherwise inspect in Swagger or Postman.</p>
            <div className="json-block">
              {backendPayload ? <pre>{backendPayload}</pre> : <p className="empty-state small">No backend response available.</p>}
            </div>
          </section>

          <section className="workflow-card chart-card">
            <header className="chart-section-header">
              <div>
                <h4>Verification score graph</h4>
                <p>Scores are grouped by backend outcome so the chart always reflects real verification results.</p>
              </div>
            </header>

            {attempts.length > 0 ? (
              <div className="analytics-grid">
                <div className="chart-panel">
                  <p className="chart-title">Score scatter</p>
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height={280}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(23, 33, 38, 0.12)" />
                        <XAxis
                          type="number"
                          dataKey="index"
                          name="Attempt"
                          tickFormatter={(value) => `${Number(value) + 1}`}
                          allowDecimals={false}
                        />
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
                        {scatterSeries.pass.length > 0 && (
                          <Scatter name="Pass" data={scatterSeries.pass} fill="#1f7a48" />
                        )}
                        {scatterSeries.fail.length > 0 && (
                          <Scatter name="Rejected" data={scatterSeries.fail} fill="#c2512f" />
                        )}
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
            ) : (
              <div className="empty-state">
                <p>Run a few verification attempts and the graph will populate automatically.</p>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="empty-state">
          <p>Collect an ECG sample, then run the identity test to see the backend decision and raw JSON.</p>
        </div>
      )}

      <section className="attempt-log">
        <header className="section-heading compact">
          <div>
            <p className="eyebrow">Recent history</p>
            <h3>Previous identity checks</h3>
          </div>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Expected</th>
                <th>Score</th>
                <th>Threshold</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {attempts.slice(0, 12).map((attempt) => (
                <tr key={attempt.id}>
                  <td>{formatDistanceToNowStrict(new Date(attempt.timestamp), { addSuffix: true })}</td>
                  <td>{attempt.alias ?? attempt.participantId}</td>
                  <td>{attempt.score.toFixed(3)}</td>
                  <td>{attempt.threshold.toFixed(2)}</td>
                  <td>{attempt.passed ? 'PASS' : 'FAIL'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export default VerificationPanel
