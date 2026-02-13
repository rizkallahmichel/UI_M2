import axios from 'axios';
import type {
  CollectSessionResponse,
  ModelTrainingResult,
  VerifyAttempt,
  VerifyComparison,
  EcgFeatureSet,
  EcgSessionRecord,
  SessionMetadata,
  SessionCapturePayload,
  ContinuousVerifyResponse,
  ContinuousVerifyOptions,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5104';

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
};

const coerceNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

const evaluateSignalQuality = (features: Partial<EcgFeatureSet>) => {
  const { peakCount = 0, std = 0, estimatedBpm = 0, signalQualityScore = 0, motionArtifactIndex = 0 } = features;
  if (signalQualityScore >= 0.75 && motionArtifactIndex <= 0.35) return 'good';
  if (signalQualityScore >= 0.5 && motionArtifactIndex <= 0.6) return 'medium';
  if (signalQualityScore >= 0.5) return 'medium';
  if (peakCount < 10 || std < 0.05 || estimatedBpm < 40 || estimatedBpm > 160) return 'poor';
  if (peakCount < 25 || std < 0.08) return 'medium';
  return 'good';
};

const normalizeFeatures = (payload: Record<string, unknown>, hrv?: number): EcgFeatureSet => {
  const rrMeanMs = coerceNumber(payload.RrMeanMs ?? payload.rrMeanMs);
  const rrStdMs = coerceNumber(payload.RrStdMs ?? payload.rrStdMs);
  const qrsWidthMs = coerceNumber(payload.QrsWidthMs ?? payload.qrsWidthMs);
  const lowFreqPowerRatio = coerceNumber(payload.LowFreqPowerRatio ?? payload.lowFreqPowerRatio);
  const midFreqPowerRatio = coerceNumber(payload.MidFreqPowerRatio ?? payload.midFreqPowerRatio);
  const highFreqPowerRatio = coerceNumber(payload.HighFreqPowerRatio ?? payload.highFreqPowerRatio);
  const veryLowFreqPowerRatio = coerceNumber(payload.VeryLowFreqPowerRatio ?? payload.veryLowFreqPowerRatio);
  const spectralCentroidHz = coerceNumber(payload.SpectralCentroidHz ?? payload.spectralCentroidHz);
  const spectralEntropy = coerceNumber(payload.SpectralEntropy ?? payload.spectralEntropy);
  const motionArtifactIndex = coerceNumber(payload.MotionArtifactIndex ?? payload.motionArtifactIndex);
  const baselineDriftRatio = coerceNumber(payload.BaselineDriftRatio ?? payload.baselineDriftRatio);
  const rawSignalQualityScore = coerceNumber(payload.SignalQualityScore ?? payload.signalQualityScore);
  const signalQualityScore = rawSignalQualityScore > 0 ? rawSignalQualityScore : Math.max(0, 1 - motionArtifactIndex);

  const normalized: EcgFeatureSet = {
    estimatedBpm: coerceNumber(payload.EstimatedBpm ?? payload.estimatedBpm),
    peakCount: coerceNumber(payload.PeakCount ?? payload.peakCount),
    mean: coerceNumber(payload.Mean ?? payload.mean),
    std: coerceNumber(payload.Std ?? payload.std),
    rms: coerceNumber(payload.Rms ?? payload.rms),
    min: coerceNumber(payload.Min ?? payload.min),
    max: coerceNumber(payload.Max ?? payload.max),
    skewness: coerceNumber(payload.Skewness ?? payload.skewness),
    kurtosis: coerceNumber(payload.Kurtosis ?? payload.kurtosis),
    rrMeanMs,
    rrStdMs,
    qrsWidthMs,
    lowFreqPowerRatio,
    midFreqPowerRatio,
    highFreqPowerRatio,
    spectralCentroidHz,
    spectralEntropy,
    veryLowFreqPowerRatio,
    motionArtifactIndex,
    baselineDriftRatio,
    signalQualityScore,
    hrvDailyRmssd: hrv ?? coerceNumber(payload.HrvDailyRmssd ?? payload.hrvDailyRmssd),
    signalQuality: 'good',
  };

  return {
    ...normalized,
    signalQuality: evaluateSignalQuality(normalized),
  };
};

interface ServerSessionMetadata {
  activityLabel?: string | null;
  stressLevel?: string | null;
  sensorPlacement?: string | null;
  deviceModel?: string | null;
}

interface CollectSessionApiResponse {
  documentId: string;
  fitbitUserId: string;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  features: Record<string, unknown>;
  metadata?: ServerSessionMetadata | null;
  waveformPreview?: number[] | null;
  signalQualityScore?: number;
  motionArtifactIndex?: number;
  baselineDriftRatio?: number;
  samplingHz?: number;
  scalingFactor?: number;
  tags?: Array<string | null>;
  notes?: string | null;
}

interface VerifyApiResponse {
  fitbitUserId: string;
  authenticated: boolean;
  score: number;
  threshold: number;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  comparisonScores: number[];
}

interface ContinuousVerifyApiResponse {
  authenticated: boolean;
  rollingMeanScore: number;
  rollingWorstScore: number;
  samples: Array<{
    windowStartUtc: string;
    windowEndUtc: string;
    score: number;
    passes: boolean;
  }>;
}

const adaptVerifyComparisons = (scores: number[]): VerifyComparison[] =>
  scores.map((probability, idx) => ({
    id: `baseline-${idx + 1}`,
    sessionLabel: `Session ${idx + 1}`,
    timestampLabel: `Baseline #${idx + 1}`,
    probability,
  }));

const sanitizeString = (value?: string | null) => {
  if (value == null) return undefined;
  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const adaptMetadata = (metadata?: ServerSessionMetadata | null): SessionMetadata | undefined => {
  if (!metadata) return undefined;
  const normalized: SessionMetadata = {
    activityLabel: sanitizeString(metadata.activityLabel),
    stressLevel: sanitizeString(metadata.stressLevel),
    sensorPlacement: sanitizeString(metadata.sensorPlacement),
    deviceModel: sanitizeString(metadata.deviceModel),
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
};

const adaptWaveformPreview = (preview?: number[] | null): number[] => {
  if (!Array.isArray(preview)) return [];
  return preview.map((value) => coerceNumber(value));
};

const adaptTags = (tags?: Array<string | null>): string[] => {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => sanitizeString(tag))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
};

const adaptCollectResponse = (data: CollectSessionApiResponse): CollectSessionResponse => {
  const features = normalizeFeatures(data.features ?? {}, data.hrvDailyRmssd);
  const signalQualityScore = coerceNumber(data.signalQualityScore);
  const motionArtifactIndex = coerceNumber(data.motionArtifactIndex);
  const baselineDriftRatio = coerceNumber(data.baselineDriftRatio);
  return {
    documentId: data.documentId,
    fitbitUserId: data.fitbitUserId,
    ecgStartTime: data.ecgStartTime,
    hrvDailyRmssd: data.hrvDailyRmssd,
    features,
    metadata: adaptMetadata(data.metadata),
    waveformPreview: adaptWaveformPreview(data.waveformPreview),
    signalQualityScore: signalQualityScore || features.signalQualityScore,
    motionArtifactIndex: motionArtifactIndex || features.motionArtifactIndex,
    baselineDriftRatio: baselineDriftRatio || features.baselineDriftRatio,
    samplingHz: coerceNumber(data.samplingHz),
    scalingFactor: coerceNumber(data.scalingFactor),
    tags: adaptTags(data.tags),
    notes: sanitizeString(data.notes),
  };
};

const adaptVerifyResponse = (response: VerifyApiResponse): VerifyAttempt => {
  const timestamp = response.ecgStartTime ?? new Date().toISOString();
  return {
    id: randomId(),
    participantId: response.fitbitUserId,
    timestamp,
    score: response.score,
    threshold: response.threshold,
    passed: response.authenticated,
    hrv: response.hrvDailyRmssd,
    comparisons: adaptVerifyComparisons(response.comparisonScores ?? []),
  };
};

const adaptSessionRecord = (record: CollectSessionApiResponse): EcgSessionRecord => adaptCollectResponse(record);

const adaptContinuousSamples = (samples: ContinuousVerifyApiResponse['samples']) =>
  samples
    .map((sample) => ({
      windowStartUtc: sample.windowStartUtc,
      windowEndUtc: sample.windowEndUtc,
      score: coerceNumber(sample.score),
      passes: Boolean(sample.passes),
    }))
    .sort((a, b) => new Date(a.windowStartUtc).getTime() - new Date(b.windowStartUtc).getTime());

const adaptContinuousResponse = (response: ContinuousVerifyApiResponse): ContinuousVerifyResponse => ({
  authenticated: Boolean(response.authenticated),
  rollingMeanScore: coerceNumber(response.rollingMeanScore),
  rollingWorstScore: coerceNumber(response.rollingWorstScore),
  samples: adaptContinuousSamples(response.samples ?? []),
});

export const fetchSessions = async (): Promise<EcgSessionRecord[]> => {
  const { data } = await http.get<CollectSessionApiResponse[]>('/api/ecg-auth/sessions');
  return data.map((record) => adaptSessionRecord(record));
};

export const collectSession = async (payload?: SessionCapturePayload): Promise<CollectSessionResponse> => {
  const body = payload ?? {};
  const { data } = await http.post<CollectSessionApiResponse>('/api/ecg-auth/collect-session', body);
  return adaptCollectResponse(data);
};

export const trainModel = async (maxPairsPerUser: number): Promise<ModelTrainingResult> => {
  const { data } = await http.post<ModelTrainingResult>(`/api/ecg-auth/train?maxPairsPerUser=${maxPairsPerUser}`);
  return data;
};

interface VerifyOptions {
  threshold: number;
  label?: 'genuine' | 'impostor';
  notes?: string;
  alias?: string;
}

export const verifyAttempt = async (options: VerifyOptions): Promise<VerifyAttempt> => {
  const { data } = await http.post<VerifyApiResponse>(`/api/ecg-auth/verify?threshold=${options.threshold}`);
  const attempt = adaptVerifyResponse(data);
  return {
    ...attempt,
    label: options.label,
    notes: options.notes,
    alias: options.alias,
  };
};

export const runContinuousVerify = async (
  options: Partial<ContinuousVerifyOptions>,
): Promise<ContinuousVerifyResponse> => {
  const payload: Record<string, unknown> = {};
  if (typeof options.threshold === 'number') payload.threshold = options.threshold;
  if (typeof options.windowMinutes === 'number') payload.windowMinutes = options.windowMinutes;
  if (typeof options.strideMinutes === 'number') payload.strideMinutes = options.strideMinutes;

  const { data } = await http.post<ContinuousVerifyApiResponse>('/api/ecg-auth/continuous-verify', payload);
  return adaptContinuousResponse(data);
};
