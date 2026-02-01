import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import clsx from 'clsx'
import type { ModelTrainingResult, Participant } from '../types'

type ParticipantsTabProps = {
  participants: Participant[]
  loading: boolean
  selectedParticipantId?: string
  onSelectParticipant: (id: string) => void
  onAliasChange: (id: string, alias: string) => void
  onGoToEnrollment: () => void
  onGoToVerification: () => void
  onTrainModel: (maxPairs: number) => void
  training: boolean
  lastTrainingResult: ModelTrainingResult | null
}

const percent = (value?: number) => (value != null ? `${(value * 100).toFixed(1)}%` : '—')

const ParticipantsTab = ({
  participants,
  loading,
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

  const readyForTraining = participants.filter((p) => (p.sessionCount ?? 0) >= 10).length

  const summaryCards = useMemo(
    () => [
      {
        title: 'Participants',
        value: loading ? '…' : participants.length.toString(),
        hint: 'Total Fitbit IDs seen in Firestore',
      },
      {
        title: 'Training-ready',
        value: loading ? '…' : readyForTraining.toString(),
        hint: 'Users with ≥10 ECG sessions',
      },
      {
        title: 'Last trained',
        value: lastTrainingResult?.modelPath ? 'Model saved' : 'Not yet',
        hint: lastTrainingResult?.modelPath?.replace(/^.*[\\/]/, '') ?? 'Trigger training to view metrics',
      },
    ],
    [participants.length, readyForTraining, loading, lastTrainingResult],
  )

  const handleAliasCommit = (participantId: string) => {
    const trimmed = aliasDrafts[participantId]?.trim() ?? ''
    onAliasChange(participantId, trimmed)
  }

  return (
    <div className="panel participants-panel">
      <section className="cards-grid">
        {summaryCards.map((card) => (
          <article key={card.title} className="card">
            <p className="card-title">{card.title}</p>
            <p className="card-value">{card.value}</p>
            <p className="card-hint">{card.hint}</p>
          </article>
        ))}
        <article className="card train-card">
          <header>
            <p className="card-title">Train model</p>
            <p className="card-hint">Sweep HRV/ECG pairs to refresh the biometric model.</p>
          </header>
          <div className="train-form">
            <label>
              Max pairs per user
              <input
                type="number"
                min={100}
                max={1500}
                step={50}
                value={maxPairs}
                onChange={(event) => setMaxPairs(Number(event.target.value))}
              />
            </label>
            <button className="primary" disabled={training} onClick={() => onTrainModel(maxPairs)}>
              {training ? 'Training…' : 'Train now'}
            </button>
          </div>
          {lastTrainingResult && (
            <ul className="train-metrics">
              <li>Accuracy: {percent(lastTrainingResult.accuracy)}</li>
              <li>AUC: {percent(lastTrainingResult.areaUnderRocCurve)}</li>
              <li>F1: {percent(lastTrainingResult.f1Score)}</li>
            </ul>
          )}
        </article>
      </section>

      <section className="table-section">
        <header>
          <div>
            <h2>Participants</h2>
            <p>Alias each Fitbit ID and track enrollment / model coverage.</p>
          </div>
          <div className="table-actions">
            <button className="ghost-btn" onClick={onGoToEnrollment}>
              Collect session
            </button>
            <button className="ghost-btn" onClick={onGoToVerification}>
              Go to verification
            </button>
          </div>
        </header>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Alias</th>
                <th>Fitbit ID</th>
                <th>Enrollment</th>
                <th>Sessions</th>
                <th>Model status</th>
                <th>Last session</th>
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
                        {participant.modelStatus.trainedPairs} pairs ·{' '}
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
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {participants.length === 0 && (
            <div className="empty-state">
              <p>No participants yet. Run Collect Session after syncing a Fitbit ECG reading.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default ParticipantsTab
