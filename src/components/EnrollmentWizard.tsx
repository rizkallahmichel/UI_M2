import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { CollectSessionResponse, Participant, SessionCapturePayload, SessionMetadata } from '../types'
import ViewStateBanner from './ViewStateBanner'

type EnrollmentWizardProps = {
  participant?: Participant
  participants: Participant[]
  onSelectParticipant: (id: string) => void
  onCapture: (payload: SessionCapturePayload) => Promise<CollectSessionResponse>
  isCapturing: boolean
  latestSession: CollectSessionResponse | null
  errorMessage?: string
  onUseForVerification?: () => void
  onOpenTraining?: () => void
}

const formatNumber = (value?: number, digits = 2) => (value != null && Number.isFinite(value) ? value.toFixed(digits) : '--')

const EnrollmentWizard = ({
  participant,
  participants,
  onSelectParticipant,
  onCapture,
  isCapturing,
  latestSession,
  errorMessage,
  onUseForVerification,
  onOpenTraining,
}: EnrollmentWizardProps) => {
  const [step, setStep] = useState<'instructions' | 'capturing' | 'summary'>('instructions')
  const [sessionSummary, setSessionSummary] = useState<CollectSessionResponse | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [metadataDraft, setMetadataDraft] = useState<SessionMetadata>({})
  const [tagsInput, setTagsInput] = useState('')
  const [notes, setNotes] = useState('')

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
      setStep('summary')
    }
  }, [latestSession, isCapturing])

  useEffect(() => {
    setMetadataDraft({})
    setTagsInput('')
    setNotes('')
  }, [participant?.id])

  const startCapture = async () => {
    setCaptureError(null)
    setSessionSummary(null)
    setStep('capturing')

    try {
      const session = await onCapture(buildCapturePayload())
      setSessionSummary(session)
      setStep('summary')
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'Failed to collect ECG session.')
      setStep('instructions')
    }
  }

  const summaryFeatures = useMemo(() => {
    if (!sessionSummary?.features) return []
    const { features } = sessionSummary
    return [
      { label: 'Fitbit user', value: sessionSummary.fitbitUserId },
      { label: 'Estimated BPM', value: formatNumber(features.estimatedBpm, 1) },
      { label: 'Signal quality', value: `${features.signalQuality.toUpperCase()} (${formatNumber(features.signalQualityScore, 2)})` },
      { label: 'HRV (RMSSD)', value: `${formatNumber(features.hrvDailyRmssd, 1)} ms` },
      { label: 'Peak count', value: Number.isFinite(features.peakCount) ? features.peakCount.toString() : '--' },
      { label: 'RR mean / std', value: `${formatNumber(features.rrMeanMs, 0)} ms / ${formatNumber(features.rrStdMs, 0)} ms` },
      { label: 'QRS width', value: `${formatNumber(features.qrsWidthMs, 1)} ms` },
      { label: 'Motion artifact', value: formatNumber(features.motionArtifactIndex, 2) },
    ]
  }, [sessionSummary])

  return (
    <section className="panel workflow-section" aria-labelledby="collection-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2 id="collection-title">Collect a new ECG sample</h2>
          <p>No timer here. Follow the instructions, start the reading on the watch, then click once to collect.</p>
        </div>
        <div className="participant-select">
          <label htmlFor="participant-select">Expected identity</label>
          <select
            id="participant-select"
            value={participant?.id ?? ''}
            onChange={(event) => onSelectParticipant(event.target.value)}
          >
            <option value="">No preset selected</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.alias ?? p.id}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="collection-layout">
        <article className={`workflow-card ${step === 'instructions' ? 'active' : ''}`}>
          <p className="step-label">Prepare</p>
          <h3>Operator instructions</h3>
          <ol className="instruction-list">
            <li>Ask the person to sit still and keep the wrist relaxed.</li>
            <li>Open the Fitbit ECG app and wait until the reading screen is ready.</li>
            <li>When the watch capture starts, click the button below to fetch and save the sample.</li>
          </ol>

          <div className="survey-form">
            <h4>Optional context</h4>
            <div className="survey-grid">
              <label>
                <span>Activity</span>
                <input
                  value={metadataDraft.activityLabel ?? ''}
                  placeholder="resting, walking, post-run"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, activityLabel: event.target.value }))}
                />
              </label>
              <label>
                <span>Stress level</span>
                <input
                  value={metadataDraft.stressLevel ?? ''}
                  placeholder="calm, elevated"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, stressLevel: event.target.value }))}
                />
              </label>
              <label>
                <span>Sensor placement</span>
                <input
                  value={metadataDraft.sensorPlacement ?? ''}
                  placeholder="left wrist"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, sensorPlacement: event.target.value }))}
                />
              </label>
              <label>
                <span>Device model</span>
                <input
                  value={metadataDraft.deviceModel ?? ''}
                  placeholder="Charge 6"
                  onChange={(event) => setMetadataDraft((prev) => ({ ...prev, deviceModel: event.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>Tags</span>
              <input
                value={tagsInput}
                placeholder="seated, post-exercise"
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                value={notes}
                placeholder="Anything useful about the capture conditions"
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </div>

          <button type="button" className="primary" disabled={isCapturing} onClick={startCapture}>
            {isCapturing ? 'Collecting sample...' : 'Collect ECG sample'}
          </button>
          {isCapturing && (
            <ViewStateBanner
              tone="loading"
              title="Collecting ECG sample"
              message="Waiting for backend capture and feature extraction."
            />
          )}
          {(captureError || errorMessage) && (
            <ViewStateBanner
              tone="error"
              title="Collection failed"
              message={captureError ?? errorMessage ?? 'Unable to collect ECG sample.'}
            />
          )}
        </article>

        <article className={`workflow-card ${step === 'capturing' ? 'active' : ''}`}>
          <p className="step-label">Collecting</p>
          <h3>Waiting for backend capture</h3>
          <p>The UI stays simple here on purpose. Keep the watch stable until the backend returns the ECG session.</p>
          <div className="capture-checklist">
            <p>What the system is doing now:</p>
            <ul>
              <li>Reading the latest ECG session from the backend</li>
              <li>Extracting waveform and HRV features</li>
              <li>Preparing the sample for enrollment and identity testing</li>
            </ul>
          </div>
        </article>

        <article className={`workflow-card ${step === 'summary' ? 'active' : ''}`}>
          <p className="step-label">Ready</p>
          <h3>Collected sample summary</h3>
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
                <p className="warning-text">Signal quality is poor. Re-seat the watch before running an identity test.</p>
              )}
              <div className="inline-actions">
                <button type="button" className="primary" onClick={onUseForVerification}>
                  Identify this ECG
                </button>
                <button type="button" className="ghost-btn" onClick={startCapture}>
                  Collect another sample
                </button>
                <button type="button" className="ghost-btn" onClick={onOpenTraining}>
                  Train / refresh model
                </button>
              </div>
            </>
          ) : (
            <p>Start a collection to view the sample summary.</p>
          )}
        </article>
      </div>
    </section>
  )
}

export default EnrollmentWizard

