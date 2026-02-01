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
  hrvDailyRmssd: number;
  signalQuality: SignalQuality;
}

export interface CollectSessionResponse {
  documentId: string;
  fitbitUserId: string;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  features: EcgFeatureSet;
}

export type EcgSessionRecord = CollectSessionResponse;

export interface ModelTrainingResult {
  modelPath: string;
  accuracy: number;
  areaUnderRocCurve: number;
  f1Score: number;
  sessionCount: number;
  pairCount: number;
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
}

export interface AnalyticsSnapshot {
  attempts: VerifyAttempt[];
  far: number;
  frr: number;
  eerEstimate: number;
  lastUpdated: string;
}
