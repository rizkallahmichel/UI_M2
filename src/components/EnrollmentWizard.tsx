import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { CollectSessionResponse, Participant, SessionCapturePayload, SessionMetadata } from '../types'

type EnrollmentWizardProps = {
  participant?: Participant
  participants: Participant[]
  onSelectParticipant: (id: string) => void
  onCapture: (payload: SessionCapturePayload) => Promise<CollectSessionResponse>
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
  const [metadataDraft, setMetadataDraft] = useState<SessionMetadata>({})
  const [tagsInput, setTagsInput] = useState('')
  const [notes, setNotes] = useState('')

  const formatNumber = (value?: number, digits = 2) => (value != null && Number.isFinite(value) ? value.toFixed(digits) : '—')

  const buildCapturePayload = (): SessionCapturePayload => {
    const trimmedMetadata: SessionMetadata = {
      activityLabel: metadataDraft.activityLabel?.trim() || undefined,
      stressLevel: metadataDraft.stressLevel?.trim() || undefined,
      sensorPlacement: metadataDraft.sensorPlacement?.trim() || undefined,
      deviceModel: metadataDraft.deviceModel?.trim() || undefined,
    }
    const hasMetadata = Object.values(trimmedMetadata).some((value) => value && value.length > 0)
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    const trimmedNotes = notes.trim()
    const payload: SessionCapturePayload = {}
    if (hasMetadata) payload.metadata = trimmedMetadata
    if (tags.length > 0) payload.tags = tags
    if (trimmedNotes.length > 0) payload.notes = trimmedNotes
    return payload
  }

  useEffect(() => {
    if (latestSession && !isCapturing) {
      setSessionSummary(latestSession)
    }
  }, [latestSession, isCapturing])

  useEffect(() => {
    setMetadataDraft({})
    setTagsInput('')
    setNotes('')
  }, [participant?.id])

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
      const session = await onCapture(buildCapturePayload())
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
      { label: 'Estimated BPM', value: formatNumber(features.estimatedBpm, 1) },
      { label: 'Peak count', value: Number.isFinite(features.peakCount) ? features.peakCount.toString() : '—' },
      { label: 'Mean ± Std', value: `${formatNumber(features.mean, 3)} ± ${formatNumber(features.std, 3)}` },
      { label: 'RR mean / std', value: `${formatNumber(features.rrMeanMs, 0)} ms / ${formatNumber(features.rrStdMs, 0)} ms` },
      { label: 'QRS width', value: `${formatNumber(features.qrsWidthMs, 1)} ms` },
      { label: 'HRV (RMSSD)', value: `${formatNumber(features.hrvDailyRmssd, 1)} ms` },
      {
        label: 'Signal quality',
        value: `${features.signalQuality.toUpperCase()} (${formatNumber(features.signalQualityScore, 2)})`,
      },
      { label: 'Motion artifact', value: formatNumber(features.motionArtifactIndex, 2) },
      { label: 'Baseline drift', value: formatNumber(features.baselineDriftRatio, 2) },
    ]
  }, [sessionSummary])

  const surveySummary = useMemo(() => {
    if (!sessionSummary) {
      return { metadataEntries: [], tags: '—', notes: '—', hasData: false }
    }
    const metadata = sessionSummary.metadata ?? {}
    const metadataEntries = [
      { label: 'Activity', value: metadata.activityLabel ?? '—' },
      { label: 'Stress', value: metadata.stressLevel ?? '—' },
      { label: 'Sensor placement', value: metadata.sensorPlacement ?? '—' },
      { label: 'Device model', value: metadata.deviceModel ?? '—' },
    ]
    const tagsValue = sessionSummary.tags.length ? sessionSummary.tags.join(', ') : '—'
    const notesValue = sessionSummary.notes ?? '—'
    const hasData = metadataEntries.some((entry) => entry.value !== '—') || tagsValue !== '—' || notesValue !== '—'
    return { metadataEntries, tags: tagsValue, notes: notesValue, hasData }
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
          <div className="survey-form">
            <h4>ECG biometric survey</h4>
            <div className="survey-grid">
              <label>
                <span>Activity label</span>
                <input
                  value={metadataDraft.activityLabel ?? ''}
                  placeholder="e.g. resting, post-run"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, activityLabel: event.target.value }))}
                />
              </label>
              <label>
                <span>Stress level</span>
                <input
                  value={metadataDraft.stressLevel ?? ''}
                  placeholder="e.g. calm, elevated"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, stressLevel: event.target.value }))}
                />
              </label>
              <label>
                <span>Sensor placement</span>
                <input
                  value={metadataDraft.sensorPlacement ?? ''}
                  placeholder="e.g. left wrist"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, sensorPlacement: event.target.value }))}
                />
              </label>
              <label>
                <span>Device model</span>
                <input
                  value={metadataDraft.deviceModel ?? ''}
                  placeholder="e.g. Charge 6"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, deviceModel: event.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>Tags (comma separated)</span>
              <input
                value={tagsInput}
                placeholder="e.g. seated, watch loose"
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </label>
            <label>
              <span>Operator notes</span>
              <textarea
                value={notes}
                placeholder="Optional context or quality notes"
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>
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
              <div className="survey-summary">
                <h4>Survey responses</h4>
                {surveySummary.hasData ? (
                  <>
                    <div className="survey-summary-grid">
                      {surveySummary.metadataEntries.map((entry) => (
                        <article key={entry.label}>
                          <p className="card-title">{entry.label}</p>
                          <p className="card-value">{entry.value}</p>
                        </article>
                      ))}
                    </div>
                    <div className="survey-notes">
                      <div>
                        <p className="card-title">Tags</p>
                        <p className="card-value">{surveySummary.tags}</p>
                      </div>
                      <div>
                        <p className="card-title">Operator notes</p>
                        <p className="card-value multi-line">{surveySummary.notes}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p>No survey responses captured.</p>
                )}
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



