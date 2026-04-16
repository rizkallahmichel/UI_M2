import { formatDistanceToNowStrict } from 'date-fns'
import { Suspense, lazy } from 'react'
import type { VerificationLogEntry, WorkflowLogEntry } from '../types'
import ViewStateBanner from './ViewStateBanner'

const LogStatisticsCharts = lazy(() => import('./LogStatisticsCharts'))

type ActivityLogPanelProps = {
  entries: WorkflowLogEntry[]
  verificationLogs: VerificationLogEntry[]
  verificationStats: {
    total: number
    success: number
    failed: number
  }
  verificationLogsLoading?: boolean
  verificationLogsError?: string
}

const stringifyPayload = (value: unknown) => {
  if (value == null) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const ActivityLogPanel = ({
  entries,
  verificationLogs,
  verificationStats,
  verificationLogsLoading,
  verificationLogsError,
}: ActivityLogPanelProps) => {
  return (
    <section className="panel log-panel" aria-labelledby="activity-log-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Backend visibility</p>
          <h2 id="activity-log-title">Operation log</h2>
          <p>Every collection, model training run, and identity check is stored here with its payload.</p>
        </div>
      </header>

      <div className="summary-grid">
        <article>
          <p className="card-title">Michel/Auth attempts</p>
          <p className="card-value">{verificationStats.total}</p>
        </article>
        <article>
          <p className="card-title">Successful</p>
          <p className="card-value pass-text">{verificationStats.success}</p>
        </article>
        <article>
          <p className="card-title">Failed</p>
          <p className="card-value fail-text">{verificationStats.failed}</p>
        </article>
      </div>

      {verificationLogsLoading && (
        <div className="empty-state">
          <p>Loading verification logs from backend...</p>
        </div>
      )}
      {verificationLogsError && (
        <div className="empty-state">
          <p className="error-text">{verificationLogsError}</p>
        </div>
      )}
      {!verificationLogsLoading && !verificationLogsError && verificationLogs.length > 0 && (
        <>
          <Suspense
            fallback={<ViewStateBanner tone="loading" title="Loading charts" message="Preparing log statistics charts." />}
          >
            <LogStatisticsCharts logs={verificationLogs} />
          </Suspense>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Fitbit ID</th>
                  <th>Alias</th>
                  <th>Score</th>
                  <th>Threshold</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {verificationLogs.map((log) => {
                  const when = log.attemptedAtUtc ?? log.ecgStartTimeUtc ?? ''
                  return (
                    <tr key={log.id}>
                      <td>{when ? formatDistanceToNowStrict(new Date(when), { addSuffix: true }) : 'n/a'}</td>
                      <td className="monospace">{log.fitbitUserId}</td>
                      <td>{log.alias ?? 'n/a'}</td>
                      <td>{log.score.toFixed(3)}</td>
                      <td>{log.threshold.toFixed(2)}</td>
                      <td className={log.authenticated ? 'pass-text' : 'fail-text'}>
                        {log.authenticated ? 'Authenticated' : 'Rejected'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <p>No operation yet. Start with a collection or an identity test.</p>
        </div>
      ) : (
        <div className="log-list">
          {entries.map((entry) => {
            const requestPayload = stringifyPayload(entry.requestPayload)
            const responsePayload = stringifyPayload(entry.responsePayload)

            return (
              <article key={entry.id} className="log-entry">
                <header className="log-entry-header">
                  <div>
                    <p className="log-entry-title">{entry.title}</p>
                    <p className="log-entry-summary">{entry.summary}</p>
                  </div>
                  <div className="log-entry-meta">
                    <span className={`status-pill ${entry.status === 'error' ? 'offline' : entry.status === 'info' ? 'neutral' : 'online'}`}>
                      {entry.status}
                    </span>
                    <span className="log-entry-time">
                      {formatDistanceToNowStrict(new Date(entry.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                </header>

                <div className="log-payload-grid">
                  <div className="json-block">
                    <p className="json-title">Request</p>
                    {requestPayload ? <pre>{requestPayload}</pre> : <p className="empty-state small">No payload</p>}
                  </div>
                  <div className="json-block">
                    <p className="json-title">Response</p>
                    {responsePayload ? <pre>{responsePayload}</pre> : <p className="empty-state small">No payload</p>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default ActivityLogPanel
