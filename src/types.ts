export type SignalQuality = 'good' | 'medium' | 'poor';

export interface ParticipantModelStatus {
  trainedPairs: number;
  lastTrainedAt?: string;
  accuracy?: number;
  auc?: number;
  f1?: number;
}

export interface Participant {
  id: string;
  alias?: string;
  sessionCount: number;
  lastSessionAt?: string;
  enrollmentProgress?: number;
  modelStatus?: ParticipantModelStatus;
}

export interface SessionMetadata {
  activityLabel?: string;
  stressLevel?: string;
  sensorPlacement?: string;
  deviceModel?: string;
}

export interface SessionCapturePayload {
  metadata?: SessionMetadata;
  tags?: string[];
  notes?: string;
}

export interface EcgFeatureSet {
  estimatedBpm: number;
  peakCount: number;
  mean: number;
  std: number;
  rms: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  rrMeanMs: number;
  rrStdMs: number;
  qrsWidthMs: number;
  lowFreqPowerRatio: number;
  midFreqPowerRatio: number;
  highFreqPowerRatio: number;
  spectralCentroidHz: number;
  spectralEntropy: number;
  veryLowFreqPowerRatio: number;
  motionArtifactIndex: number;
  baselineDriftRatio: number;
  signalQualityScore: number;
  hrvDailyRmssd: number;
  signalQuality: SignalQuality;
}

export interface CollectSessionResponse {
  documentId: string;
  fitbitUserId: string;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  features: EcgFeatureSet;
  metadata?: SessionMetadata;
  waveformPreview: number[];
  signalQualityScore: number;
  motionArtifactIndex: number;
  baselineDriftRatio: number;
  samplingHz: number;
  scalingFactor: number;
  tags: string[];
  notes?: string;
}

export type EcgSessionRecord = CollectSessionResponse;

export interface ModelTrainingResult {
  modelPath: string;
  correctionModelPath?: string;
  accuracy: number;
  areaUnderRocCurve: number;
  f1Score: number;
  sessionCount: number;
  pairCount: number;
}

export interface EcgBenchmarkRequest {
  maxPairsPerUser?: number;
  testFraction?: number;
}

export interface EcgBenchmarkResponse {
  dataset: string;
  subjectCount: number;
  sessionCount: number;
  trainFraction: number;
  testFraction: number;
  metrics: ModelTrainingResult;
}

export interface ConfidenceSnapshot {
  userId: string;
  sampleCount: number;
  rollingMean: number;
  rollingStdDev: number;
  exponentialMovingAverage: number;
  drift: number;
  confidenceLevel: number;
  consecutivePasses: number;
  consecutiveFailures: number;
  updatedAtUtc: string;
}

export interface VerifyComparison {
  id: string;
  sessionLabel: string;
  timestampLabel: string;
  probability: number;
}

export interface VerifyAttempt {
  id: string;
  participantId: string;
  alias?: string;
  timestamp: string;
  score: number;
  threshold: number;
  passed: boolean;
  label?: 'genuine' | 'impostor';
  notes?: string;
  hrv?: number;
  comparisons: VerifyComparison[];
  consensusScore?: number;
  passingVotes?: number;
  confidence?: ConfidenceSnapshot;
}

export interface AnalyticsSnapshot {
  attempts: VerifyAttempt[];
  far: number;
  frr: number;
  eerEstimate: number;
  lastUpdated: string;
}

export interface ContinuousVerifySample {
  windowStartUtc: string;
  windowEndUtc: string;
  score: number;
  passes: boolean;
}

export interface ContinuousVerifyResponse {
  authenticated: boolean;
  rollingMeanScore: number;
  rollingWorstScore: number;
  samples: ContinuousVerifySample[];
}

export interface ContinuousVerifyOptions {
  threshold: number;
  windowMinutes: number;
  strideMinutes: number;
}
