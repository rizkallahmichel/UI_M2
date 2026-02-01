type ScoreMeterProps = {
  score: number
  threshold: number
}

const ScoreMeter = ({ score, threshold }: ScoreMeterProps) => {
  const scorePercent = Math.min(100, Math.max(0, score * 100))
  const thresholdPercent = Math.min(100, Math.max(0, threshold * 100))
  const pass = score >= threshold

  return (
    <div className="score-meter">
      <div className="score-meter-track">
        <div className="score-meter-value" style={{ width: `${scorePercent}%` }} />
        <div className="threshold-marker" style={{ left: `${thresholdPercent}%` }} />
      </div>
      <div className="score-meter-labels">
        <span>0</span>
        <span>0.5</span>
        <span>1.0</span>
      </div>
      <p className={pass ? 'pass-text' : 'fail-text'}>
        {pass ? 'PASS' : 'FAIL'} — Score {score.toFixed(2)} vs threshold {threshold.toFixed(2)}
      </p>
    </div>
  )
}

export default ScoreMeter
