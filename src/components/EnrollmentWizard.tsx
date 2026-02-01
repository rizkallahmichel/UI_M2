import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { CollectSessionResponse, Participant } from '../types'

type EnrollmentWizardProps = {
  participant?: Participant
  participants: Participant[]
  onSelectParticipant: (id: string) => void
  onCapture: () => Promise<CollectSessionResponse>
  isCapturing: boolean
  latestSession: CollectSessionResponse | null
  errorMessage?: string
}

const CAPTURE_DURATION_MS = 30_000

const EnrollmentWizard = ({
  participant,
  participants,
  onSelectParticipant,
  onCapture,
  isCapturing,
  latestSession,
  errorMessage,
}: EnrollmentWizardProps) => {
  const [step, setStep] = useState<'instructions' | 'capture' | 'summary'>('instructions')
  const [progress, setProgress] = useState(0)
  const [pendingSession, setPendingSession] = useState<CollectSessionResponse | null>(null)
  const [sessionSummary, setSessionSummary] = useState<CollectSessionResponse | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [captureComplete, setCaptureComplete] = useState(false)

  useEffect(() => {
    if (latestSession && !isCapturing) {
      setSessionSummary(latestSession)
    }
  }, [latestSession, isCapturing])

  useEffect(() => {
    if (step !== 'capture') return
    setProgress(0)
    setCaptureComplete(false)
    const start = performance.now()
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - start
      const ratio = Math.min(1, elapsed / CAPTURE_DURATION_MS)
      setProgress(ratio * 100)
      if (ratio >= 1) {
        setCaptureComplete(true)
        window.clearInterval(interval)
      }
    }, 200)

    return () => window.clearInterval(interval)
  }, [step])

  useEffect(() => {
    if (captureComplete && pendingSession) {
      setSessionSummary(pendingSession)
      setStep('summary')
      setPendingSession(null)
      setCaptureComplete(false)
    }
  }, [captureComplete, pendingSession])

  const startCapture = async () => {
    if (!participant) {
      setCaptureError('Select a participant before capturing.')
      return
    }

    setCaptureError(null)
    setPendingSession(null)
    setSessionSummary(null)
    setStep('capture')

    try {
      const session = await onCapture()
      setPendingSession(session)
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Failed to capture ECG session.')
      setStep('instructions')
    }
  }

  const summaryFeatures = useMemo(() => {
    if (!sessionSummary?.features) return []
    const { features } = sessionSummary
    return [
      { label: 'Estimated BPM', value: features.estimatedBpm.toFixed(1) },
      { label: 'Peak count', value: features.peakCount.toString() },
      { label: 'Mean ± Std', value: `${features.mean.toFixed(3)} ± ${features.std.toFixed(3)}` },
      { label: 'HRV (RMSSD)', value: `${features.hrvDailyRmssd?.toFixed(1) ?? '—'} ms` },
      { label: 'Signal quality', value: features.signalQuality.toUpperCase() },
    ]
  }, [sessionSummary])

  return (
    <div className="panel enrollment-panel">
      <header className="panel-header">
        <div>
          <h2>Enrollment wizard</h2>
          <p>Guide the participant through a high-quality 30 s ECG capture.</p>
        </div>
        <div className="participant-select">
          <label htmlFor="participant-select">Participant</label>
          <select
            id="participant-select"
            value={participant?.id ?? ''}
            onChange={(event) => onSelectParticipant(event.target.value)}
          >
            <option value="" disabled>
              Choose participant
            </option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.alias ?? p.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="wizard-grid">
        <article className={`wizard-step ${step === 'instructions' ? 'active' : ''}`}>
          <h3>Step 1 — Instructions</h3>
          <ul>
            <li>Seat the participant, ask them to relax their arm, and stay silent.</li>
            <li>Check the watch fit and confirm the watch is on the Fitbit ECG screen.</li>
            <li>Start the Fitbit ECG reading and tap “Start capture” below.</li>
          </ul>
          <button className="primary" disabled={isCapturing} onClick={startCapture}>
            {isCapturing ? 'Capturing…' : 'Start capture'}
          </button>
          {(captureError || errorMessage) && <p className="error-text">{captureError ?? errorMessage}</p>}
        </article>

        <article className={`wizard-step ${step === 'capture' ? 'active' : ''}`}>
          <h3>Step 2 — Capture (30 s)</h3>
          <div className="capture-progress">
            <div className="progress-ring">
              <svg viewBox="0 0 36 36">
                <path
                  className="bg"
                  d="M18 2.0845
                     a 15.9155 15.9155 0 0 1 0 31.831
                     a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="indicator"
                  strokeDasharray={`${progress}, 100`}
                  d="M18 2.0845
                     a 15.9155 15.9155 0 0 1 0 31.831
                     a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span>{Math.round(progress)}%</span>
            </div>
            <p>Keep still… capturing ECG waveform and HRV metrics.</p>
          </div>
        </article>

        <article className={`wizard-step ${step === 'summary' ? 'active' : ''}`}>
          <h3>Step 3 — Save & review</h3>
          {sessionSummary ? (
            <>
              <p className="timestamp">
                Session {sessionSummary.documentId} ·{' '}
                {sessionSummary.ecgStartTime
                  ? format(new Date(sessionSummary.ecgStartTime), 'MMM d, HH:mm')
                  : 'Timestamp pending'}
              </p>
              <div className="summary-grid">
                {summaryFeatures.map((item) => (
                  <article key={item.label}>
                    <p className="card-title">{item.label}</p>
                    <p className="card-value">{item.value}</p>
                  </article>
                ))}
              </div>
              {sessionSummary.features.signalQuality === 'poor' && (
                <p className="warning-text">
                  Signal quality flagged as POOR. Ask the participant to re-seat the watch and repeat the recording.
                </p>
              )}
              <button className="ghost-btn" onClick={startCapture}>
                Capture again
              </button>
            </>
          ) : (
            <p>Run a capture to see the summary.</p>
          )}
        </article>
      </div>
    </div>
  )
}

export default EnrollmentWizard
