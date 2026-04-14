import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './App.css'
import { collectSession, fetchCurrentFitbitUser, fetchSessions, trainModel, verifyAttempt } from './api/client'
import type {
  CollectSessionResponse,
  CurrentFitbitUser,
  EcgSessionRecord,
  ModelTrainingResult,
  Participant,
  SessionCapturePayload,
  VerifyAttempt,
  WorkflowLogEntry,
} from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import ParticipantsTab from './components/ParticipantsTab'
import EnrollmentWizard from './components/EnrollmentWizard'
import VerificationPanel from './components/VerificationPanel'
import ActivityLogPanel from './components/ActivityLogPanel'

const progressFromSessions = (count: number) => Math.min(1, count / 12)

const buildParticipantsFromSessions = (sessions: EcgSessionRecord[]): Participant[] => {
  const grouped = new Map<
    string,
    {
      sessionCount: number
      lastSessionAt?: string
    }
  >()

  sessions.forEach((session) => {
    if (!session.fitbitUserId) return
    const entry = grouped.get(session.fitbitUserId) ?? { sessionCount: 0 }
    entry.sessionCount += 1

    if (session.ecgStartTime) {
      if (!entry.lastSessionAt || new Date(session.ecgStartTime).getTime() > new Date(entry.lastSessionAt).getTime()) {
        entry.lastSessionAt = session.ecgStartTime
      }
    }

    grouped.set(session.fitbitUserId, entry)
  })

  return Array.from(grouped.entries()).map(([id, info]) => ({
    id,
    sessionCount: info.sessionCount,
    lastSessionAt: info.lastSessionAt,
    enrollmentProgress: progressFromSessions(info.sessionCount),
  }))
}

const createLogId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `log-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

const workspaceTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'collect', label: 'Collect' },
  { id: 'verify', label: 'Verify' },
  { id: 'logs', label: 'Logs' },
] as const

type WorkspaceView = (typeof workspaceTabs)[number]['id']

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('overview')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>()
  const [selectionMode, setSelectionMode] = useState<'auto' | 'user'>('auto')
  const [latestSession, setLatestSession] = useState<CollectSessionResponse | null>(null)
  const [latestVerify, setLatestVerify] = useState<VerifyAttempt | null>(null)
  const [attemptLogs, setAttemptLogs] = useState<VerifyAttempt[]>([])
  const [lastTrainingResult, setLastTrainingResult] = useState<ModelTrainingResult | null>(null)
  const [lastTrainedAt, setLastTrainedAt] = useState<string | undefined>()
  const [aliasMap, setAliasMap] = useLocalStorage<Record<string, string>>('ui:fitbit-aliases', {})
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowLogEntry[]>([])
  const queryClient = useQueryClient()

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
  })

  const currentUserQuery = useQuery({
    queryKey: ['current-fitbit-user'],
    queryFn: fetchCurrentFitbitUser,
  })

  const participants = useMemo(() => {
    const base = buildParticipantsFromSessions(sessionsQuery.data ?? [])
    return base
      .sort((a, b) => (a.id > b.id ? 1 : -1))
      .map((participant) => {
        const alias = aliasMap[participant.id] ?? participant.alias
        const modelStatus = lastTrainingResult
          ? {
              trainedPairs: lastTrainingResult.pairCount,
              lastTrainedAt,
              accuracy: lastTrainingResult.accuracy,
              auc: lastTrainingResult.areaUnderRocCurve,
              f1: lastTrainingResult.f1Score,
            }
          : participant.modelStatus

        return {
          ...participant,
          alias,
          modelStatus,
        }
      })
  }, [sessionsQuery.data, aliasMap, lastTrainingResult, lastTrainedAt])

  const currentFitbitUser = currentUserQuery.data
  const connectedParticipantId = currentFitbitUser?.fitbitUserId
  const connectedParticipant = participants.find((participant) => participant.id === connectedParticipantId)

  useEffect(() => {
    const fitbitUserId = currentFitbitUser?.fitbitUserId
    const displayName = currentFitbitUser?.displayName?.trim()
    if (!fitbitUserId || !displayName) return

    setAliasMap((prev) => {
      if ((prev[fitbitUserId] ?? '').trim().length > 0) return prev
      return { ...prev, [fitbitUserId]: displayName }
    })
  }, [currentFitbitUser?.displayName, currentFitbitUser?.fitbitUserId, setAliasMap])

  useEffect(() => {
    if (selectionMode === 'user') return

    if (connectedParticipantId && participants.some((participant) => participant.id === connectedParticipantId)) {
      if (selectedParticipantId !== connectedParticipantId) {
        setSelectedParticipantId(connectedParticipantId)
      }
      return
    }

    if (!selectedParticipantId && participants.length > 0) {
      const michelParticipant = participants.find(
        (participant) => participant.alias === 'Michel' || participant.id === 'Michel',
      )
      setSelectedParticipantId(michelParticipant?.id ?? participants[0].id)
    }
  }, [connectedParticipantId, participants, selectedParticipantId, selectionMode])

  const appendLogEntry = (entry: Omit<WorkflowLogEntry, 'id' | 'timestamp'> & { timestamp?: string }) => {
    setWorkflowLogs((prev) => [
      {
        id: createLogId(),
        timestamp: entry.timestamp ?? new Date().toISOString(),
        ...entry,
      },
      ...prev,
    ].slice(0, 40))
  }

  const openView = (view: WorkspaceView) => setActiveView(view)

  const normalizeParticipantSelection = (id: string) => {
    setSelectionMode('user')
    setSelectedParticipantId(id || undefined)
  }

  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId)

  const collectMutation = useMutation<CollectSessionResponse, Error, SessionCapturePayload>({
    mutationFn: (payload) => collectSession(payload),
    onSuccess: (session, payload) => {
      setLatestSession(session)
      setSelectionMode('auto')
      setSelectedParticipantId(session.fitbitUserId)
      setActiveView('collect')
      queryClient.setQueryData<EcgSessionRecord[]>(['sessions'], (prev) => {
        const next: EcgSessionRecord = { ...session }
        return prev ? [...prev, next] : [next]
      })
      appendLogEntry({
        scope: 'collection',
        status: 'success',
        title: 'ECG sample collected',
        summary: `Session ${session.documentId} saved for ${session.fitbitUserId}.`,
        requestPayload: payload,
        responsePayload: session.rawPayload ?? session,
        timestamp: session.ecgStartTime,
      })
    },
    onError: (error, payload) => {
      appendLogEntry({
        scope: 'collection',
        status: 'error',
        title: 'Collection failed',
        summary: error.message,
        requestPayload: payload,
        responsePayload: { error: error.message },
      })
    },
  })

  const trainMutation = useMutation<ModelTrainingResult, Error, number>({
    mutationFn: (maxPairs: number) => trainModel(maxPairs),
    onSuccess: (result, maxPairs) => {
      setLastTrainingResult(result)
      setLastTrainedAt(new Date().toISOString())
      appendLogEntry({
        scope: 'training',
        status: 'success',
        title: 'Model training completed',
        summary: `Accuracy ${(result.accuracy * 100).toFixed(1)}%, AUC ${(result.areaUnderRocCurve * 100).toFixed(1)}%.`,
        requestPayload: { maxPairsPerUser: maxPairs },
        responsePayload: result.rawPayload ?? result,
      })
    },
    onError: (error, maxPairs) => {
      appendLogEntry({
        scope: 'training',
        status: 'error',
        title: 'Model training failed',
        summary: error.message,
        requestPayload: { maxPairsPerUser: maxPairs },
        responsePayload: { error: error.message },
      })
    },
  })

  const verifyMutation = useMutation<
    VerifyAttempt,
    Error,
    { threshold: number; label?: 'genuine' | 'impostor'; notes?: string; alias?: string }
  >({
    mutationFn: (payload) => verifyAttempt(payload),
    onSuccess: (attempt, payload) => {
      setLatestVerify(attempt)
      setAttemptLogs((prev) => [attempt, ...prev].slice(0, 400))
      setActiveView('verify')
      appendLogEntry({
        scope: 'verification',
        status: 'success',
        title: 'Identity test completed',
        summary: `${attempt.passed ? 'Authenticated' : 'Rejected'} with score ${attempt.score.toFixed(3)} at threshold ${attempt.threshold.toFixed(2)}.`,
        requestPayload: payload,
        responsePayload: attempt.rawPayload ?? attempt,
        timestamp: attempt.timestamp,
      })
    },
    onError: (error, payload) => {
      appendLogEntry({
        scope: 'verification',
        status: 'error',
        title: 'Identity test failed',
        summary: error.message,
        requestPayload: payload,
        responsePayload: { error: error.message },
      })
    },
  })

  const handleAliasChange = (participantId: string, alias: string) => {
    setAliasMap((prev) => ({ ...prev, [participantId]: alias }))
  }

  const resolveIdentityLabel = (currentUser?: CurrentFitbitUser | null) => {
    if (connectedParticipant?.alias) return connectedParticipant.alias
    if (currentUser?.displayName) return currentUser.displayName
    if (connectedParticipantId) return connectedParticipantId
    if (selectedParticipant?.alias) return selectedParticipant.alias
    return selectedParticipant?.id
  }

  const handleVerify = (threshold: number, label?: 'genuine' | 'impostor', notes?: string) => {
    verifyMutation.mutate({
      threshold,
      label,
      notes,
      alias: resolveIdentityLabel(currentFitbitUser),
    })
  }

  const latestDecision = latestVerify ? (latestVerify.passed ? 'Authenticated' : 'Rejected') : 'No test yet'
  const backendStatus =
    sessionsQuery.isLoading || currentUserQuery.isLoading
      ? 'Loading backend...'
      : sessionsQuery.isError || currentUserQuery.isError
        ? 'Backend issue'
        : 'Backend ready'
  const selectedIdentityLabel = resolveIdentityLabel(currentFitbitUser) ?? 'Unavailable'
  const latestSessionLabel = latestSession?.documentId ?? 'No sample yet'
  const helperSteps = [
    'Overview keeps participants and model controls in one place.',
    'Collect only opens the ECG capture flow.',
    'Verify uses the connected Fitbit account as the backend identity baseline.',
    'Logs centralize backend payloads when you need detail.',
  ]

  return (
    <div className="app-shell workspace-app">
      <header className="hero compact-hero">
        <div className="hero-copy compact-copy">
          <p className="eyebrow">ECG identity workflow</p>
          <h1>Compact workspace for collection, testing, and backend review</h1>
          <p className="hero-text">
            The interface now uses focused views instead of one long page. Switch context without scrolling through the
            entire project each time.
          </p>
        </div>

        <div className="hero-panel compact-panel">
          <div className="status-row">
            <span className={sessionsQuery.isError ? 'status-pill offline' : 'status-pill online'}>{backendStatus}</span>
            <button
              className="ghost-btn"
              onClick={() => {
                void sessionsQuery.refetch()
                void currentUserQuery.refetch()
              }}
            >
              Refresh data
            </button>
          </div>

          <div className="hero-stats compact-stats">
            <article className="hero-stat">
              <p className="card-title">Connected Fitbit identity</p>
              <p className="card-value compact-value">{selectedIdentityLabel}</p>
            </article>
            <article className="hero-stat">
              <p className="card-title">Last ECG sample</p>
              <p className="card-value compact-value">{latestSessionLabel}</p>
            </article>
            <article className="hero-stat">
              <p className="card-title">Last decision</p>
              <p className="card-value compact-value">{latestDecision}</p>
            </article>
            <article className="hero-stat">
              <p className="card-title">Operation logs</p>
              <p className="card-value compact-value">{workflowLogs.length}</p>
            </article>
          </div>
        </div>
      </header>

      <section className="workspace-shell">
        <aside className="workspace-sidebar">
          <section className="panel sidebar-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Views</h2>
              </div>
            </div>

            <nav className="workspace-nav" aria-label="Workspace views">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={tab.id === activeView ? 'workspace-tab active' : 'workspace-tab'}
                  onClick={() => openView(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'overview' && <strong>{participants.length}</strong>}
                  {tab.id === 'collect' && <strong>{latestSession ? '1' : '0'}</strong>}
                  {tab.id === 'verify' && <strong>{attemptLogs.length}</strong>}
                  {tab.id === 'logs' && <strong>{workflowLogs.length}</strong>}
                </button>
              ))}
            </nav>
          </section>

          <section className="panel sidebar-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Quick status</p>
                <h2>At a glance</h2>
              </div>
            </div>
            <div className="sidebar-summary">
              <article className="summary-tile">
                <p className="card-title">Participants</p>
                <p className="card-value">{participants.length}</p>
              </article>
              <article className="summary-tile">
                <p className="card-title">Sessions</p>
                <p className="card-value">{sessionsQuery.data?.length ?? 0}</p>
              </article>
              <article className="summary-tile">
                <p className="card-title">Checks</p>
                <p className="card-value">{attemptLogs.length}</p>
              </article>
              <article className="summary-tile">
                <p className="card-title">Model</p>
                <p className="card-value">{lastTrainingResult ? 'Ready' : 'Untrained'}</p>
              </article>
            </div>
          </section>

          <section className="panel sidebar-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">How it works</p>
                <h2>Flow</h2>
              </div>
            </div>
            <ol className="helper-list">
              {helperSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        </aside>

        <main className="workspace-main">
          <div className="workspace-stage">
            <div className="workspace-stage-copy">
              <p className="eyebrow">Current view</p>
              <h2>{workspaceTabs.find((tab) => tab.id === activeView)?.label}</h2>
              <p>
                {activeView === 'overview' && 'Manage participants, aliases, and model training without leaving this view.'}
                {activeView === 'collect' && 'Collect a new ECG sample and review its signal summary in one focused screen.'}
                {activeView === 'verify' && 'Run the identity test against the connected Fitbit account and inspect the backend verdict.'}
                {activeView === 'logs' && 'Inspect backend payloads and the exact operation history without cluttering the main flow.'}
              </p>
            </div>
            <div className="workspace-stage-actions">
              {activeView !== 'collect' && (
                <button className="ghost-btn" onClick={() => openView('collect')}>
                  Collect ECG
                </button>
              )}
              {activeView !== 'verify' && (
                <button className="ghost-btn" onClick={() => openView('verify')}>
                  Identity test
                </button>
              )}
              {activeView !== 'logs' && (
                <button className="ghost-btn" onClick={() => openView('logs')}>
                  Backend logs
                </button>
              )}
            </div>
          </div>

          <section className="workspace-content">
            {activeView === 'overview' && (
              <ParticipantsTab
                participants={participants}
                loading={sessionsQuery.isLoading}
                selectedParticipantId={selectedParticipantId}
                onSelectParticipant={normalizeParticipantSelection}
                onAliasChange={handleAliasChange}
                onGoToEnrollment={() => openView('collect')}
                onGoToVerification={() => openView('verify')}
                onTrainModel={(maxPairs) => trainMutation.mutate(maxPairs)}
                training={trainMutation.isPending}
                lastTrainingResult={lastTrainingResult}
              />
            )}

            {activeView === 'collect' && (
              <EnrollmentWizard
                participant={selectedParticipant}
                onSelectParticipant={normalizeParticipantSelection}
                participants={participants}
                onCapture={(payload) => collectMutation.mutateAsync(payload)}
                isCapturing={collectMutation.isPending}
                latestSession={latestSession}
                errorMessage={collectMutation.error instanceof Error ? collectMutation.error.message : undefined}
                onUseForVerification={() => openView('verify')}
                onOpenTraining={() => openView('overview')}
              />
            )}

            {activeView === 'verify' && (
              <VerificationPanel
                participants={participants}
                connectedUser={currentFitbitUser}
                selectedParticipantId={selectedParticipantId}
                onSelectParticipant={normalizeParticipantSelection}
                onVerify={handleVerify}
                isVerifying={verifyMutation.isPending}
                latestResult={latestVerify}
                errorMessage={verifyMutation.error instanceof Error ? verifyMutation.error.message : undefined}
                attempts={attemptLogs}
                onGoToCollection={() => openView('collect')}
              />
            )}

            {activeView === 'logs' && <ActivityLogPanel entries={workflowLogs} />}
          </section>
        </main>
      </section>
    </div>
  )
}

export default App
