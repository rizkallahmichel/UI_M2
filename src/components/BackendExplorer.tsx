import { formatDistanceToNowStrict } from 'date-fns'
import { useMemo } from 'react'
import type { EcgDataOverviewResponse } from '../types'

type BackendExplorerProps = {
  overview?: EcgDataOverviewResponse
  overviewLoading?: boolean
  overviewError?: string
  hrvData?: Record<string, unknown>
  hrvLoading?: boolean
  hrvError?: string
  fitbitData?: Array<Record<string, unknown>>
  fitbitDataLoading?: boolean
  fitbitDataError?: string
  onRefreshOverview: () => void
  onRefreshHrv: () => void
  onRefreshFitbitData: () => void
}

const formatAgo = (value?: string) => {
  if (!value) return 'n/a'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

const jsonSnippet = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const BackendExplorer = ({
  overview,
  overviewLoading,
  overviewError,
  hrvData,
  hrvLoading,
  hrvError,
  fitbitData,
  fitbitDataLoading,
  fitbitDataError,
  onRefreshOverview,
  onRefreshHrv,
  onRefreshFitbitData,
}: BackendExplorerProps) => {
  const fitbitSnapshot = (fitbitData && fitbitData.length > 0 ? fitbitData[0] : undefined) as Record<string, unknown> | undefined
  const fitbitSections = Array.isArray(fitbitSnapshot?.sections)
    ? (fitbitSnapshot?.sections as Array<Record<string, unknown>>)
    : []
  const compactHrv = useMemo(() => {
    const root = asRecord(hrvData)
    const hrvArray = Array.isArray(root?.hrv) ? root?.hrv : []
    return {
      hasData: hrvArray.length > 0,
      firstRecord: hrvArray[0] ?? null,
      rawKeys: root ? Object.keys(root) : [],
    }
  }, [hrvData])
  const compactFitbitSnapshot = useMemo(() => ({
    dateUtc: fitbitSnapshot?.dateUtc ?? null,
    source: fitbitSnapshot?.source ?? null,
    sections: fitbitSections.map((section) => ({
      section: section.section ?? 'unknown',
      success: Boolean(section.success),
      statusCode: section.statusCode ?? null,
      dataKeys: asRecord(section.data) ? Object.keys(asRecord(section.data)!) : [],
      error: section.error ?? null,
    })),
  }), [fitbitSections, fitbitSnapshot?.dateUtc, fitbitSnapshot?.source])

  return (
    <section className="panel backend-panel" aria-labelledby="backend-explorer-title">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Backend explorer</p>
          <h2 id="backend-explorer-title">API coverage</h2>
          <p>Inspect backend endpoints from one place: overview, raw Fitbit HRV, and the live Fitbit snapshot.</p>
        </div>
      </header>

      <section className="cards-grid compact">
        <article className="card">
          <p className="card-title">Collections</p>
          <p className="card-value">{overview?.collections.length ?? 0}</p>
          <p className="card-hint">`GET /api/ecg-auth/data-overview`</p>
        </article>
        <article className="card">
          <p className="card-title">Recent sessions</p>
          <p className="card-value">{overview?.recentSessions.length ?? 0}</p>
          <p className="card-hint">Latest ECG captures from backend summary</p>
        </article>
        <article className="card">
          <p className="card-title">Fitbit live sections</p>
          <p className="card-value">{fitbitSections.length}</p>
          <p className="card-hint">`GET /api/fitbit/all-data` (profile, hrv, spo2, temperature)</p>
        </article>
      </section>

      <section className="table-section">
        <header>
          <div>
            <h3>Data overview</h3>
            <p>Collection sizes, participants, notes, and model state.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onRefreshOverview}>
            Refresh overview
          </button>
        </header>
        {overviewLoading && <div className="empty-state"><p>Loading data overview...</p></div>}
        {overviewError && <div className="empty-state"><p className="error-text">{overviewError}</p></div>}
        {!overviewLoading && !overviewError && (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Collection</th>
                    <th>Documents</th>
                    <th>Last update</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.collections ?? []).map((row) => (
                    <tr key={row.name}>
                      <td className="monospace">{row.name}</td>
                      <td>{row.documentCount}</td>
                      <td>{formatAgo(row.lastUpdatedUtc)}</td>
                      <td>{row.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overview?.notes && overview.notes.length > 0 && (
              <ul className="helper-list">
                {overview.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="backend-grid">
        <article className="card">
          <div className="section-heading compact">
            <div>
              <h3>Raw HRV payload</h3>
              <p>Direct Fitbit payload from backend passthrough.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={onRefreshHrv}>
              Refresh HRV
            </button>
          </div>
          {hrvLoading && <p className="card-hint">Loading HRV...</p>}
          {hrvError && <p className="error-text">{hrvError}</p>}
          {!hrvLoading && !hrvError && (
            <div className="json-block">
              <p className="json-title">GET /api/fitbit/hrv</p>
              <pre className="json-pre">{jsonSnippet(compactHrv)}</pre>
            </div>
          )}
        </article>

        <article className="card">
          <div className="section-heading compact">
            <div>
              <h3>Fitbit live snapshot</h3>
              <p>Current Fitbit values aggregated by backend in one response.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={onRefreshFitbitData}>
              Refresh all-data
            </button>
          </div>
          {fitbitDataLoading && <p className="card-hint">Loading documents...</p>}
          {fitbitDataError && <p className="error-text">{fitbitDataError}</p>}
          {!fitbitDataLoading && !fitbitDataError && (
            <div className="json-block">
              <p className="json-title">GET /api/fitbit/all-data</p>
              <pre className="json-pre">{jsonSnippet(compactFitbitSnapshot)}</pre>
            </div>
          )}
        </article>
      </section>
    </section>
  )
}

export default BackendExplorer
