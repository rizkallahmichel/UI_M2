import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import './App.css'
import { fetchSessions, collectSession, trainModel, verifyAttempt } from './api/client'
import type { CollectSessionResponse, ModelTrainingResult, Participant, VerifyAttempt, EcgSessionRecord } from './types'
import { useLocalStorage } from './hooks/useLocalStorage'
import ParticipantsTab from './components/ParticipantsTab'
import EnrollmentWizard from './components/EnrollmentWizard'
import VerificationPanel from './components/VerificationPanel'
import AnalyticsTab from './components/AnalyticsTab'

const tabs = [
  { id: 'participants', label: 'Participants' },
  { id: 'enrollment', label: 'Enrollment' },
  { id: 'verification', label: 'Verification' },
  { id: 'analytics', label: 'Analytics' },
] as const

type TabId = (typeof tabs)[number]['id']

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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('participants')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>()
  const [latestSession, setLatestSession] = useState<CollectSessionResponse | null>(null)
  const [latestVerify, setLatestVerify] = useState<VerifyAttempt | null>(null)
  const [attemptLogs, setAttemptLogs] = useState<VerifyAttempt[]>([])
  const [lastTrainingResult, setLastTrainingResult] = useState<ModelTrainingResult | null>(null)
  const [lastTrainedAt, setLastTrainedAt] = useState<string | undefined>()
  const [aliasMap, setAliasMap] = useLocalStorage<Record<string, string>>('ui:fitbit-aliases', {})
  const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState<string | undefined>()
  const queryClient = useQueryClient()

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
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

  useEffect(() => {
    if (!selectedParticipantId && participants.length > 0) {
      setSelectedParticipantId(participants[0].id)
    }
  }, [participants, selectedParticipantId])

  useEffect(() => {
    if (attemptLogs.length > 0) {
      setAnalyticsUpdatedAt(new Date().toISOString())
    }
  }, [attemptLogs])

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId)

  const collectMutation = useMutation({
    mutationFn: collectSession,
    onSuccess: (session) => {
      setLatestSession(session)
      queryClient.setQueryData<EcgSessionRecord[]>(['sessions'], (prev) => {
        const next: EcgSessionRecord = {
          documentId: session.documentId,
          fitbitUserId: session.fitbitUserId,
          ecgStartTime: session.ecgStartTime,
          hrvDailyRmssd: session.hrvDailyRmssd,
          features: session.features,
        }
        return prev ? [...prev, next] : [next]
      })
      setActiveTab('enrollment')
    },
  })

  const trainMutation = useMutation({
    mutationFn: (maxPairs: number) => trainModel(maxPairs),
    onSuccess: (result) => {
      setLastTrainingResult(result)
      setLastTrainedAt(new Date().toISOString())
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (payload: { threshold: number; label?: 'genuine' | 'impostor'; notes?: string; alias?: string }) =>
      verifyAttempt(payload),
    onSuccess: (attempt) => {
      setLatestVerify(attempt)
      setAttemptLogs((prev) => [attempt, ...prev].slice(0, 400))
      setActiveTab('verification')
    },
  })

  const handleAliasChange = (participantId: string, alias: string) => {
    setAliasMap((prev) => ({ ...prev, [participantId]: alias }))
  }

  const handleVerify = (threshold: number, label?: 'genuine' | 'impostor', notes?: string) => {
    verifyMutation.mutate({
      threshold,
      label,
      notes,
      alias: selectedParticipant?.alias ?? selectedParticipant?.id,
    })
  }

  const handleLabelUpdate = (attemptId: string, label: 'genuine' | 'impostor', notes?: string) => {
    setAttemptLogs((prev) => prev.map((attempt) => (attempt.id === attemptId ? { ...attempt, label, notes } : attempt)))
    setLatestVerify((prev) => (prev?.id === attemptId ? { ...prev, label, notes } : prev))
  }

  const handleTrain = (maxPairs: number) => {
    trainMutation.mutate(maxPairs)
  }

  const tabLabel = (tabId: TabId) => {
    switch (tabId) {
      case 'participants':
        return `${tabs.find((t) => t.id === tabId)?.label ?? 'Participants'} (${participants.length})`
      case 'analytics':
        return `${tabs.find((t) => t.id === tabId)?.label ?? 'Analytics'} (${attemptLogs.length})`
      default:
        return tabs.find((t) => t.id === tabId)?.label ?? tabId
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>ECG Research Console</h1>
          <p>Monitor enrollment, train the model, and verify Fitbit ECG attempts in one place.</p>
        </div>
        <div className="header-actions">
          <span className="status-pill online">Backend ready</span>
          <button className="ghost-btn" onClick={() => sessionsQuery.refetch()}>
            Refresh data
          </button>
        </div>
      </header>

      <nav className="tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tabLabel(tab.id)}
          </button>
        ))}
      </nav>

      <section className="tab-panel">
        {activeTab === 'participants' && (
          <ParticipantsTab
            participants={participants}
            loading={sessionsQuery.isLoading}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={setSelectedParticipantId}
            onAliasChange={handleAliasChange}
            onGoToEnrollment={() => setActiveTab('enrollment')}
            onGoToVerification={() => setActiveTab('verification')}
            onTrainModel={handleTrain}
            training={trainMutation.isPending}
            lastTrainingResult={lastTrainingResult}
          />
        )}

        {activeTab === 'enrollment' && (
          <EnrollmentWizard
            participant={selectedParticipant}
            onSelectParticipant={setSelectedParticipantId}
            participants={participants}
            onCapture={() => collectMutation.mutateAsync()}
            isCapturing={collectMutation.isPending}
            latestSession={latestSession}
            errorMessage={collectMutation.error instanceof Error ? collectMutation.error.message : undefined}
          />
        )}

        {activeTab === 'verification' && (
          <VerificationPanel
            participants={participants}
            selectedParticipantId={selectedParticipantId}
            onSelectParticipant={setSelectedParticipantId}
            onVerify={handleVerify}
            isVerifying={verifyMutation.isPending}
            latestResult={latestVerify}
            onLabelUpdate={handleLabelUpdate}
            attempts={attemptLogs.slice(0, 12)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            attempts={attemptLogs}
            participants={participants}
            lastRefreshed={analyticsUpdatedAt}
          />
        )}
      </section>
    </div>
  )
}

export default App
