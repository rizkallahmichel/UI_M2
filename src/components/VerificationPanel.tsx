import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import clsx from 'clsx'
import type { Participant, VerifyAttempt } from '../types'
import ScoreMeter from './ScoreMeter'

type VerificationPanelProps = {
  participants: Participant[]
  selectedParticipantId?: string
  onSelectParticipant: (id: string) => void
  onVerify: (threshold: number, label?: 'genuine' | 'impostor', notes?: string) => void
  isVerifying: boolean
  latestResult: VerifyAttempt | null
  onLabelUpdate: (attemptId: string, label: 'genuine' | 'impostor', notes?: string) => void
  attempts: VerifyAttempt[]
}

const thresholds = [0.6, 0.7, 0.8, 0.85, 0.9]

const VerificationPanel = ({
  participants,
  selectedParticipantId,
  onSelectParticipant,
  onVerify,
  isVerifying,
  latestResult,
  onLabelUpdate,
  attempts,
}: VerificationPanelProps) => {
  const [threshold, setThreshold] = useState(0.85)
  const [impostorMode, setImpostorMode] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setNotes(latestResult?.notes ?? '')
  }, [latestResult?.id, latestResult?.notes])

  const sweepResults = useMemo(
    () =>
      thresholds.map((value) => ({
        value,
        passed: (latestResult?.score ?? 0) >= value,
      })),
    [latestResult],
  )

  const bestComparison = latestResult?.comparisons.reduce(
    (prev, current) => (current.probability > (prev?.probability ?? 0) ? current : prev),
    undefined as VerifyAttempt['comparisons'][number] | undefined,
  )

  const handleVerify = () => {
    onVerify(threshold, impostorMode ? 'impostor' : 'genuine', notes.trim() || undefined)
  }

  const handleLabelChange = (label: 'genuine' | 'impostor') => {
    if (!latestResult) return
    onLabelUpdate(latestResult.id, label, notes.trim() || undefined)
  }

  return (
    <div className="panel verification-panel">
      <header className="panel-header">
        <div>
          <h2>Verification</h2>
          <p>Stream Fitbit ECG attempts, adjust the threshold, and log ground-truth labels.</p>
        </div>
        <div className="participant-select">
          <label htmlFor="verify-participant">Participant</label>
          <select
            id="verify-participant"
            value={selectedParticipantId ?? ''}
            onChange={(event) => onSelectParticipant(event.target.value)}
          >
            <option value="" disabled>
              Choose participant
            </option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.alias ?? participant.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="verify-controls">
        <div>
          <label>
            Threshold: {threshold.toFixed(2)}
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={impostorMode}
              onChange={(event) => setImpostorMode(event.target.checked)}
            />
            Impostor mode
          </label>
        </div>
        <div className="notes-box">
          <label htmlFor="attempt-notes">Attempt notes</label>
          <textarea
            id="attempt-notes"
            placeholder="Optional: posture, motion artifacts, reason for impostor attempt"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <button className="primary" disabled={isVerifying} onClick={handleVerify}>
          {isVerifying ? 'Verifying…' : 'Verify now (30 s)'}
        </button>
      </section>

      <section className="verify-results">
        {latestResult ? (
          <>
            <ScoreMeter score={latestResult.score} threshold={latestResult.threshold} />
            <div className="label-actions">
              <span>Mark attempt as</span>
              <button
                className={clsx('ghost-btn', { active: latestResult.label === 'genuine' })}
                onClick={() => handleLabelChange('genuine')}
              >
                Genuine
              </button>
              <button
                className={clsx('ghost-btn', { active: latestResult.label === 'impostor' })}
                onClick={() => handleLabelChange('impostor')}
              >
                Impostor
              </button>
            </div>
            <div className="threshold-sweep">
              <h4>Threshold sweep</h4>
              <div className="sweep-grid">
                {sweepResults.map((item) => (
                  <div key={item.value} className={item.passed ? 'pass' : 'fail'}>
                    <p>{item.value.toFixed(2)}</p>
                    <p>{item.passed ? 'PASS' : 'FAIL'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="comparisons">
              <h4>Comparison scores</h4>
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
                      <td>{comparison.probability.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>No verification attempts yet. Capture an ECG and tap “Verify now”.</p>
        )}
      </section>

      <section className="attempt-log">
        <header>
          <h3>Recent attempts</h3>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Participant</th>
                <th>Score</th>
                <th>Threshold</th>
                <th>Result</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td>{formatDistanceToNowStrict(new Date(attempt.timestamp), { addSuffix: true })}</td>
                  <td>{attempt.alias ?? attempt.participantId}</td>
                  <td>{attempt.score.toFixed(2)}</td>
                  <td>{attempt.threshold.toFixed(2)}</td>
                  <td>{attempt.passed ? 'PASS' : 'FAIL'}</td>
                  <td>{attempt.label ?? 'Unlabeled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default VerificationPanel
