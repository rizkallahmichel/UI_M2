import { useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ContinuousVerifyOptions, ContinuousVerifyResponse } from '../types';

type ContinuousMonitorProps = {
  latestResult: ContinuousVerifyResponse | null;
  isRunning: boolean;
  onRun: (options: ContinuousVerifyOptions) => void;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const ContinuousMonitor = ({ latestResult, isRunning, onRun }: ContinuousMonitorProps) => {
  const [threshold, setThreshold] = useState(0.85);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [strideMinutes, setStrideMinutes] = useState(5);
  const [lastRun, setLastRun] = useState<ContinuousVerifyOptions | null>(null);

  const chartData = useMemo(() => {
    if (!latestResult?.samples) return [];
    return latestResult.samples.map((sample) => ({
      time: format(new Date(sample.windowStartUtc), 'MMM d HH:mm'),
      startUtc: sample.windowStartUtc,
      endUtc: sample.windowEndUtc,
      score: Number(sample.score.toFixed(3)),
      passes: sample.passes,
    }));
  }, [latestResult]);

  const logEntries = useMemo(() => {
    if (!latestResult?.samples) return [];

    return [...latestResult.samples]
      .sort((a, b) => new Date(b.windowStartUtc).getTime() - new Date(a.windowStartUtc).getTime())
      .map((sample) => {
        const start = new Date(sample.windowStartUtc);
        const end = new Date(sample.windowEndUtc);
        return {
          id: sample.windowStartUtc,
          passes: sample.passes,
          timeAgo: formatDistanceToNowStrict(end, { addSuffix: true }),
          windowLabel: `${format(start, 'MMM d HH:mm')} - ${format(end, 'HH:mm')}`,
          scoreLabel: sample.score.toFixed(3),
        };
      });
  }, [latestResult]);

  const summary = useMemo(() => {
    const samples = latestResult?.samples ?? [];
    const count = samples.length;
    const passCount = samples.filter((sample) => sample.passes).length;
    const failCount = count - passCount;
    return {
      count,
      passCount,
      failCount,
      passRate: count > 0 ? passCount / count : 0,
      windowRange:
        count > 0
          ? `${format(new Date(samples[0].windowStartUtc), 'MMM d HH:mm')} - ${format(
              new Date(samples[samples.length - 1].windowEndUtc),
              'MMM d HH:mm',
            )}`
          : null,
    };
  }, [latestResult]);

  const handleRun = () => {
    const payload: ContinuousVerifyOptions = { threshold, windowMinutes, strideMinutes };
    setLastRun(payload);
    onRun(payload);
  };

  const appliedThreshold = lastRun?.threshold ?? threshold;

  return (
    <div className="panel continuous-panel">
      <header className="panel-header">
        <div>
          <h2>Continuous monitor</h2>
          <p>Fetch the latest Fitbit ECG windows, score each slice, and keep a rolling quality log.</p>
        </div>
        {latestResult && (
          <div className="status-stack">
            <span className={clsx('status-pill', latestResult.authenticated ? 'online' : 'offline')}>
              {latestResult.authenticated ? 'All windows pass' : 'At least one window failed'}
            </span>
            <p className="status-meta">
              Rolling mean {latestResult.rollingMeanScore.toFixed(2)} | worst {latestResult.rollingWorstScore.toFixed(2)}
            </p>
          </div>
        )}
      </header>

      <section className="continuous-controls">
        <label>
          <span>Threshold ({threshold.toFixed(2)})</span>
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Window minutes</span>
          <input
            type="number"
            min={5}
            max={120}
            value={windowMinutes}
            onChange={(event) => setWindowMinutes(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Stride minutes</span>
          <input
            type="number"
            min={1}
            max={windowMinutes}
            value={strideMinutes}
            onChange={(event) => setStrideMinutes(Number(event.target.value))}
          />
        </label>
        <button className="primary" onClick={handleRun} disabled={isRunning}>
          {isRunning ? 'Running...' : `Run ${windowMinutes} min sweep`}
        </button>
      </section>

      {latestResult ? (
        <>
          <section className="cards-grid">
            <article className="card">
              <p className="card-title">Samples analyzed</p>
              <p className="card-value">{summary.count}</p>
              <p className="card-hint">{summary.windowRange ?? 'Most recent ECG windows'}</p>
            </article>
            <article className="card">
              <p className="card-title">Pass rate</p>
              <p className="card-value">{formatPercent(summary.passRate)}</p>
              <p className="card-hint">
                {summary.passCount} pass | {summary.failCount} fail
              </p>
            </article>
            <article className="card">
              <p className="card-title">Rolling mean</p>
              <p className="card-value">{latestResult.rollingMeanScore.toFixed(2)}</p>
              <p className="card-hint">Worst {latestResult.rollingWorstScore.toFixed(2)}</p>
            </article>
            <article className="card">
              <p className="card-title">Applied threshold</p>
              <p className="card-value">{appliedThreshold.toFixed(2)}</p>
              <p className="card-hint">
                Window {lastRun?.windowMinutes ?? windowMinutes} min | stride {lastRun?.strideMinutes ?? strideMinutes} min
              </p>
            </article>
          </section>

          <section className="chart-section">
            <header>
              <h3>Sliding window scores</h3>
              <p>Every marker shows a scored ECG window. Hover to inspect the time slice.</p>
            </header>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <ReferenceLine y={appliedThreshold} stroke="#f97316" strokeDasharray="5 5" label="Threshold" />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#0ea5e9"
                    fill="rgba(14,165,233,0.25)"
                    strokeWidth={2}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="continuous-log">
            <header>
              <h3>Sample log</h3>
              <p>Latest Fitbit ECG slices ordered by completion time.</p>
            </header>
            <ul>
              {logEntries.map((entry) => (
                <li key={entry.id} className={clsx({ pass: entry.passes, fail: !entry.passes })}>
                  <div>
                    <p className="log-title">{entry.passes ? 'PASS' : 'FAIL'}</p>
                    <p className="log-meta">{entry.windowLabel}</p>
                  </div>
                  <div>
                    <p className="log-score">Score {entry.scoreLabel}</p>
                    <p className="log-time">{entry.timeAgo}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="empty-state">Run a sweep to populate rolling ECG metrics.</p>
      )}
    </div>
  );
};

export default ContinuousMonitor;
