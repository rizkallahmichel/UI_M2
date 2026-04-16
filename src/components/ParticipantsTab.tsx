import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import clsx from 'clsx'
import type { ModelTrainingResult, Participant } from '../types'
import ViewStateBanner from './ViewStateBanner'

type ParticipantsTabProps = {
  participants: Participant[]
  loading: boolean
  errorMessage?: string
  selectedParticipantId?: string
  onSelectParticipant: (id: string) => void
  onAliasChange: (id: string, alias: string) => void
  onGoToEnrollment: () => void
  onGoToVerification: () => void
  onTrainModel: (maxPairs: number) => void
  training: boolean
  lastTrainingResult: ModelTrainingResult | null
}

const percent = (value?: number) => (value != null ? `${(value * 100).toFixed(1)}%` : '-')

const ParticipantsTab = ({
  participants,
  loading,
  errorMessage,
  selectedParticipantId,
  onSelectParticipant,
  onAliasChange,
  onGoToEnrollment,
  onGoToVerification,
  onTrainModel,
  training,
  lastTrainingResult,
}: ParticipantsTabProps) => {
  const [maxPairs, setMaxPairs] = useState(500)
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    participants.forEach((participant) => {
      next[participant.id] = participant.alias ?? ''
    })
    setAliasDrafts(next)
  }, [participants])

  const readyForTraining = participants.filter((participant) => (participant.sessionCount ?? 0) >= 10).length

  const summaryCards = useMemo(
    () => [
      {
        title: 'Participants',
        value: loading ? '...' : participants.length.toString(),
        hint: 'Fitbit IDs available for ECG identity work',
      },
      {
        title: 'Training-ready',
        value: loading ? '...' : readyForTraining.toString(),
        hint: 'Users with enough ECG sessions to contribute to training',
      },
      {
        title: 'Latest model',
        value: lastTrainingResult?.modelPath ? 'Available' : 'Missing',
        hint: lastTrainingResult?.modelPath?.replace(/^.*[\\/]/, '') ?? 'Run training to create a fresh model',
      },
    ],
    [participants.length, readyForTraining, loading, lastTrainingResult],
  )

  const trainingMetrics = useMemo(
    () =>
      lastTrainingResult
        ? [
            {
              label: 'Accuracy',
              value: lastTrainingResult.accuracy,
              tone: 'gold',
              note: 'Overall correct authentication decisions',
            },
            {
              label: 'AUC',
              value: lastTrainingResult.areaUnderRocCurve,
              tone: 'green',
              note: 'Separation quality between positive and negative pairs',
            },
            {
              label: 'F1',
              value: lastTrainingResult.f1Score,
              tone: 'cyan',
              note: 'Balance between precision and recall',
            },
          ]
        : [],
    [lastTrainingResult],
  )

  const handleAliasCommit = (participantId: string) => {
    const trimmed = aliasDrafts[participantId]?.trim() ?? ''
    onAliasChange(participantId, trimmed)
  }

  return (
    <div className="panel participants-panel">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Participants and model</h2>
          <p>Choose the expected identity, rename Fitbit IDs, and prepare the model before testing verification.</p>
        </div>
      </header>

      {loading && (
        <ViewStateBanner
          tone="loading"
          title="Loading participants"
          message="Fetching recorded ECG sessions to build participant profiles."
        />
      )}
      {errorMessage && (
        <ViewStateBanner
          tone="error"
          title="Participant data issue"
          message={errorMessage}
        />
      )}

      <section className="participant-stats-grid participant-stats-grid-compact">
        {summaryCards.map((card) => (
          <article key={card.title} className="card summary-card compact-card">
            <p className="card-title">{card.title}</p>
            <p className="card-value">{card.value}</p>
            <p className="card-hint">{card.hint}</p>
          </article>
        ))}
      </section>

      <section className="model-workbench-grid">
        <article className="card train-workbench-card">
          <div className="train-workbench-copy">
            <p className="card-title">Train model</p>
            <h3>Refresh the ECG model</h3>
            <p className="card-hint">
              Training rebuilds the identity model from stored ECG sessions. Run it after collecting new data so
              verification uses fresh pairs and metrics.
            </p>
          </div>

          <div className="train-input-row">
            <label className="train-input train-input-light">
              <span>Max pairs per user</span>
              <input
                type="number"
                min={100}
                max={1500}
                step={50}
                value={maxPairs}
                onChange={(event) => setMaxPairs(Number(event.target.value))}
              />
            </label>
            <button type="button" className="primary train-submit" disabled={training} onClick={() => onTrainModel(maxPairs)}>
              {training ? 'Training...' : 'Train now'}
            </button>
          </div>

          <p className="form-helper train-helper-text">
            This limit caps how many training pairs are sampled for each user. Higher values usually improve coverage
            but make training slower.
          </p>

          <div className="train-meta-grid">
            <div className="train-meta-card">
              <span>Current limit</span>
              <strong>{maxPairs} pairs</strong>
            </div>
            <div className="train-meta-card">
              <span>Latest run</span>
              <strong>{lastTrainingResult ? `${lastTrainingResult.pairCount} pairs` : 'No run yet'}</strong>
            </div>
          </div>
        </article>

        <article className="card model-results-card model-results-workbench">
          <div className="results-card-header">
            <div className="results-card-copy">
              <p className="card-title">Model results</p>
              <h3>Training quality</h3>
              <p>Latest output from the backend training run.</p>
            </div>
            {lastTrainingResult ? (
              <div className="model-results-pills">
                <span className="result-pill">{lastTrainingResult.pairCount} pairs</span>
                <span className="result-pill">{lastTrainingResult.sessionCount} sessions</span>
              </div>
            ) : null}
          </div>

          {lastTrainingResult ? (
            <>
              <div className="model-output-strip">
                <div className="model-output-card">
                  <span>Model file</span>
                  <strong>{lastTrainingResult.modelPath.replace(/^.*[\\/]/, '')}</strong>
                </div>
                <div className="model-output-card">
                  <span>Recommended reading</span>
                  <strong>Retrain after collecting new ECG sessions</strong>
                </div>
              </div>

              <div className="metric-stack compact-light">
                {trainingMetrics.map((metric) => (
                  <article key={metric.label} className="metric-row light">
                    <div className="metric-row-header dark">
                      <span>{metric.label}</span>
                      <strong>{percent(metric.value)}</strong>
                    </div>
                    <div className="metric-bar-track light">
                      <div
                        className={clsx('metric-bar-fill', `tone-${metric.tone}`)}
                        style={{ width: `${Math.max(0, Math.min(100, metric.value * 100))}%` }}
                      />
                    </div>
                    <p className="metric-note">{metric.note}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="train-empty polished light">
              <p>No training result yet. Run the model once and the performance graph will appear here.</p>
            </div>
          )}
        </article>
      </section>

      <section className="table-section">
        <header>
          <div>
            <h3>Known Fitbit users</h3>
            <p>Click a row to define the expected identity for collection and identity testing.</p>
          </div>
          <div className="table-actions">
            <button type="button" className="ghost-btn" onClick={onGoToEnrollment}>
              Go to collection
            </button>
            <button type="button" className="ghost-btn" onClick={onGoToVerification}>
              Go to identity test
            </button>
          </div>
        </header>
        <div className="table-wrapper">
          <table>
            <caption className="sr-only">Participants and enrollment status</caption>
            <thead>
              <tr>
                <th scope="col">Alias</th>
                <th scope="col">Fitbit ID</th>
                <th scope="col">Enrollment</th>
                <th scope="col">Sessions</th>
                <th scope="col">Model status</th>
                <th scope="col">Last session</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((participant) => (
                <tr
                  key={participant.id}
                  className={clsx({ selected: participant.id === selectedParticipantId })}
                  onClick={() => onSelectParticipant(participant.id)}
                >
                  <td>
                    <input
                      className="alias-input"
                      value={aliasDrafts[participant.id] ?? ''}
                      placeholder="Add alias"
                      onChange={(event) =>
                        setAliasDrafts((prev) => ({ ...prev, [participant.id]: event.target.value }))
                      }
                      onBlur={() => handleAliasCommit(participant.id)}
                    />
                  </td>
                  <td className="monospace">{participant.id}</td>
                  <td>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${(participant.enrollmentProgress ?? 0) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td>{participant.sessionCount ?? 0}</td>
                  <td>
                    {participant.modelStatus ? (
                      <span>
                        {participant.modelStatus.trainedPairs} pairs |{' '}
                        {participant.modelStatus.lastTrainedAt
                          ? formatDistanceToNowStrict(new Date(participant.modelStatus.lastTrainedAt), { addSuffix: true })
                          : 'Not trained'}
                      </span>
                    ) : (
                      'Not trained'
                    )}
                  </td>
                  <td>
                    {participant.lastSessionAt
                      ? formatDistanceToNowStrict(new Date(participant.lastSessionAt), { addSuffix: true })
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {participants.length === 0 && (
            <div className="empty-state">
              <p>No participant detected yet. Run one ECG collection and the Fitbit user ID will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default ParticipantsTab
