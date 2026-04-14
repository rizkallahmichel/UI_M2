import { formatDistanceToNowStrict } from 'date-fns'
import type { WorkflowLogEntry } from '../types'

type ActivityLogPanelProps = {
  entries: WorkflowLogEntry[]
}

const stringifyPayload = (value: unknown) => {
  if (value == null) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const ActivityLogPanel = ({ entries }: ActivityLogPanelProps) => {
  return (
    <section className="panel log-panel" aria-labelledby="activity-log-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Backend visibility</p>
          <h2 id="activity-log-title">Operation log</h2>
          <p>Every collection, model training run, and identity check is stored here with its payload.</p>
        </div>
      </header>

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
