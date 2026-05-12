import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './App.css'
import {
  benchmarkEcgId,
  collectSession,
  fetchAllFitbitData,
  fetchCurrentFitbitUser,
  fetchDataOverview,
  fetchSessions,
  fetchFitbitHrv,
  fetchVerificationLogs,
  trainModel,
  verifyAttempt,
} from './api/client'
import type {
  CollectSessionResponse,
  CurrentFitbitUser,
  EcgBenchmarkResponse,
  EcgSessionRecord,
  ModelTrainingResult,
  Participant,
  SessionCapturePayload,
  VerifyAttempt,
  VerificationLogEntry,
  WorkflowLogEntry,
} from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import ViewStateBanner from './components/ViewStateBanner'

const ParticipantsTab = lazy(() => import('./components/ParticipantsTab'))
const EnrollmentWizard = lazy(() => import('./components/EnrollmentWizard'))
const VerificationPanel = lazy(() => import('./components/VerificationPanel'))
const ActivityLogPanel = lazy(() => import('./components/ActivityLogPanel'))
const AnalyticsTab = lazy(() => import('./components/AnalyticsTab'))
const BackendExplorer = lazy(() => import('./components/BackendExplorer'))

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
  { id: 'analytics', label: 'Analytics' },
  { id: 'backend', label: 'Backend' },
  { id: 'logs', label: 'Logs' },
] as const

type WorkspaceView = (typeof workspaceTabs)[number]['id']

const isMichelAuthenticatorLog = (log: VerificationLogEntry, connectedFitbitUserId?: string) => {
  const fitbitUserId = log.fitbitUserId.trim().toLowerCase()
  const alias = (log.alias ?? '').trim().toLowerCase()
  const connectedId = (connectedFitbitUserId ?? '').trim().toLowerCase()
  if (connectedId.length > 0 && fitbitUserId === connectedId) return true
  return alias === 'michel' || fitbitUserId === 'michel'
}

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('overview')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>()
  const [selectionMode, setSelectionMode] = useState<'auto' | 'user'>('auto')
  const [latestSession, setLatestSession] = useState<CollectSessionResponse | null>(null)
  const [latestVerify, setLatestVerify] = useState<VerifyAttempt | null>(null)
  const [attemptLogs, setAttemptLogs] = useState<VerifyAttempt[]>([])
  const [lastTrainingResult, setLastTrainingResult] = useState<ModelTrainingResult | null>(null)
  const [lastBenchmarkResult, setLastBenchmarkResult] = useState<EcgBenchmarkResponse | null>(null)
  const [lastBenchmarkError, setLastBenchmarkError] = useState<string | undefined>()
  const [lastBenchmarkRunAt, setLastBenchmarkRunAt] = useState<string | undefined>()
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
  const verificationLogsQuery = useQuery({
    queryKey: ['verification-logs'],
    queryFn: () => fetchVerificationLogs({ limit: 400 }),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const dataOverviewQuery = useQuery({
    queryKey: ['data-overview'],
    queryFn: fetchDataOverview,
  })
  const hrvQuery = useQuery({
    queryKey: ['fitbit-hrv'],
    queryFn: fetchFitbitHrv,
  })
  const fitbitAllDataQuery = useQuery({
    queryKey: ['fitbit-all-data'],
    queryFn: fetchAllFitbitData,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
  const michelAuthenticatorLogs = useMemo(
    () => (verificationLogsQuery.data ?? []).filter((log) => isMichelAuthenticatorLog(log, connectedParticipantId)),
    [verificationLogsQuery.data, connectedParticipantId],
  )
  const authAttemptStats = useMemo(() => {
    const total = michelAuthenticatorLogs.length
    const success = michelAuthenticatorLogs.filter((log) => log.authenticated).length
    const failed = total - success
    return { total, success, failed }
  }, [michelAuthenticatorLogs])

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
      verifyMutation.mutate({
        threshold: 0.85,
        label: 'genuine',
        notes: 'Automatic verification right after collection.',
        alias: session.fitbitUserId,
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
    {
      threshold: number
      label?: 'genuine' | 'impostor'
      notes?: string
      alias?: string
      claimedFitbitUserId?: string
      impostorAttempt?: boolean
    }
  >({
    mutationFn: (payload) => verifyAttempt(payload),
    onSuccess: (attempt, payload) => {
      const freshLog: VerificationLogEntry = {
        id: attempt.id,
        fitbitUserId: attempt.participantId,
        alias: attempt.alias,
        attemptedAtUtc: attempt.timestamp,
        ecgStartTimeUtc: attempt.timestamp,
        score: attempt.score,
        threshold: attempt.threshold,
        authenticated: attempt.passed,
        consensusScore: attempt.consensusScore ?? 0,
        votesPassing: attempt.passingVotes ?? 0,
        comparisonCount: attempt.comparisons.length,
        confidenceLevel: attempt.confidence?.confidenceLevel ?? 0,
        confidenceDrift: attempt.confidence?.drift ?? 0,
        confidenceSamples: attempt.confidence?.sampleCount ?? 0,
        label: payload.label,
        notes: payload.notes,
      }
      queryClient.setQueryData<VerificationLogEntry[]>(['verification-logs'], (prev) => {
        if (!prev) return [freshLog]
        const deduped = prev.filter((entry) => entry.id !== freshLog.id)
        return [freshLog, ...deduped].slice(0, 400)
      })
      void queryClient.invalidateQueries({ queryKey: ['verification-logs'] })
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

  const benchmarkMutation = useMutation<EcgBenchmarkResponse, Error, { maxPairsPerUser?: number; testFraction?: number }>({
    mutationFn: (payload) => benchmarkEcgId(payload),
    onSuccess: (result, payload) => {
      setLastBenchmarkResult(result)
      setLastBenchmarkRunAt(new Date().toISOString())
      setLastBenchmarkError(undefined)
      setActiveView('analytics')
      appendLogEntry({
        scope: 'training',
        status: 'success',
        title: 'ECG-ID benchmark completed',
        summary: `Accuracy ${(result.metrics.accuracy * 100).toFixed(1)}% on ${result.dataset.toUpperCase()}.`,
        requestPayload: payload,
        responsePayload: result,
      })
    },
    onError: (error, payload) => {
      setLastBenchmarkResult(null)
      setLastBenchmarkError(error.message)
      appendLogEntry({
        scope: 'training',
        status: 'error',
        title: 'ECG-ID benchmark failed',
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

  const handleVerify = (
    threshold: number,
    label?: 'genuine' | 'impostor',
    notes?: string,
    claimedFitbitUserId?: string,
    impostorAttempt?: boolean,
  ) => {
    verifyMutation.mutate({
      threshold,
      label,
      notes,
      alias: resolveIdentityLabel(currentFitbitUser),
      claimedFitbitUserId,
      impostorAttempt,
    })
  }

  const latestDecision = latestVerify ? (latestVerify.passed ? 'Authenticated' : 'Rejected') : 'No test yet'
  const queryErrorMessage =
    (sessionsQuery.error instanceof Error ? sessionsQuery.error.message : undefined) ??
    (currentUserQuery.error instanceof Error ? currentUserQuery.error.message : undefined) ??
    (verificationLogsQuery.error instanceof Error ? verificationLogsQuery.error.message : undefined)
  const isInitialLoading = sessionsQuery.isLoading || currentUserQuery.isLoading || verificationLogsQuery.isLoading
  const backendStatus =
    isInitialLoading
      ? 'Loading backend...'
      : sessionsQuery.isError || currentUserQuery.isError || verificationLogsQuery.isError
        ? 'Backend issue'
        : 'Backend ready'
  const selectedIdentityLabel = resolveIdentityLabel(currentFitbitUser) ?? 'Unavailable'
  const latestSessionLabel = latestSession?.documentId ?? 'No sample yet'
  const helperSteps = [
    'Overview keeps participants and model controls in one place.',
    'Collect captures ECG and automatically runs a verification pass.',
    'Verify uses the connected Fitbit account as the backend identity baseline.',
    'Analytics includes benchmark metrics and training images.',
    'Backend exposes overview, HRV, and all Fitbit raw data.',
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
              type="button"
              className="ghost-btn"
              onClick={() => {
                void sessionsQuery.refetch()
                void currentUserQuery.refetch()
                void verificationLogsQuery.refetch()
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
                  type="button"
                  key={tab.id}
                  className={tab.id === activeView ? 'workspace-tab active' : 'workspace-tab'}
                  onClick={() => openView(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'overview' && <strong>{participants.length}</strong>}
                  {tab.id === 'collect' && <strong>{latestSession ? '1' : '0'}</strong>}
                  {tab.id === 'verify' && <strong>{attemptLogs.length}</strong>}
                  {tab.id === 'analytics' && <strong>{lastBenchmarkResult ? '1' : '0'}</strong>}
                  {tab.id === 'backend' && <strong>{dataOverviewQuery.data?.collections.length ?? 0}</strong>}
                  {tab.id === 'logs' && <strong>{authAttemptStats.total}</strong>}
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
                <p className="card-value">{authAttemptStats.total}</p>
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
                {activeView === 'verify' && 'Run or review identity tests against the connected Fitbit account baseline.'}
                {activeView === 'analytics' && 'Compare benchmark and wearable performance, then review training visuals.'}
                {activeView === 'backend' && 'Inspect backend summaries and raw payloads for all major API endpoints.'}
                {activeView === 'logs' && 'Inspect backend payloads and the exact operation history without cluttering the main flow.'}
              </p>
            </div>
            <div className="workspace-stage-actions">
              {activeView !== 'collect' && (
                <button type="button" className="ghost-btn" onClick={() => openView('collect')}>
                  Collect ECG
                </button>
              )}
              {activeView !== 'verify' && (
                <button type="button" className="ghost-btn" onClick={() => openView('verify')}>
                  Identity test
                </button>
              )}
              {activeView !== 'analytics' && (
                <button type="button" className="ghost-btn" onClick={() => openView('analytics')}>
                  Analytics
                </button>
              )}
              {activeView !== 'backend' && (
                <button type="button" className="ghost-btn" onClick={() => openView('backend')}>
                  Backend explorer
                </button>
              )}
              {activeView !== 'logs' && (
                <button type="button" className="ghost-btn" onClick={() => openView('logs')}>
                  Backend logs
                </button>
              )}
            </div>
          </div>

          <section className="workspace-content">
            {isInitialLoading && (
              <ViewStateBanner
                tone="loading"
                title="Loading workspace data"
                message="Fetching sessions and connected Fitbit identity from backend."
              />
            )}
            {queryErrorMessage && (
              <ViewStateBanner
                tone="error"
                title="Backend data unavailable"
                message={queryErrorMessage}
                actionLabel="Retry data"
                onAction={() => {
                  void sessionsQuery.refetch()
                  void currentUserQuery.refetch()
                  void verificationLogsQuery.refetch()
                }}
              />
            )}
            <Suspense
              fallback={
                <ViewStateBanner
                  tone="loading"
                  title="Loading screen"
                  message="Preparing this workspace view."
                />
              }
            >
              {activeView === 'overview' && (
                <ParticipantsTab
                  participants={participants}
                  loading={sessionsQuery.isLoading}
                  errorMessage={queryErrorMessage}
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

              {activeView === 'analytics' && (
                <AnalyticsTab
                  attempts={attemptLogs}
                  participants={participants}
                  lastRefreshed={lastBenchmarkRunAt}
                  onRefresh={() => void verificationLogsQuery.refetch()}
                  benchmark={lastBenchmarkResult ?? undefined}
                  benchmarkLoading={benchmarkMutation.isPending}
                  benchmarkError={lastBenchmarkError}
                  onRunBenchmark={(options) => benchmarkMutation.mutate(options ?? {})}
                  benchmarkDefaults={{ maxPairsPerUser: 600, testFraction: 0.4 }}
                  lastTrainingResult={lastTrainingResult}
                />
              )}

              {activeView === 'backend' && (
                <BackendExplorer
                  overview={dataOverviewQuery.data}
                  overviewLoading={dataOverviewQuery.isLoading}
                  overviewError={dataOverviewQuery.error instanceof Error ? dataOverviewQuery.error.message : undefined}
                  hrvData={hrvQuery.data}
                  hrvLoading={hrvQuery.isLoading}
                  hrvError={hrvQuery.error instanceof Error ? hrvQuery.error.message : undefined}
                  fitbitData={fitbitAllDataQuery.data}
                  fitbitDataLoading={fitbitAllDataQuery.isLoading}
                  fitbitDataError={fitbitAllDataQuery.error instanceof Error ? fitbitAllDataQuery.error.message : undefined}
                  onRefreshOverview={() => void dataOverviewQuery.refetch()}
                  onRefreshHrv={() => void hrvQuery.refetch()}
                  onRefreshFitbitData={() => void fitbitAllDataQuery.refetch()}
                />
              )}

              {activeView === 'logs' && (
                <ActivityLogPanel
                  entries={workflowLogs}
                  verificationLogs={michelAuthenticatorLogs}
                  verificationStats={authAttemptStats}
                  verificationLogsLoading={verificationLogsQuery.isLoading}
                  verificationLogsError={
                    verificationLogsQuery.error instanceof Error ? verificationLogsQuery.error.message : undefined
                  }
                />
              )}
            </Suspense>
          </section>
        </main>
      </section>
    </div>
  )
}

export default App
