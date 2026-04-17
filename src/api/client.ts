import axios from 'axios';
import type {
  CollectSessionResponse,
  CurrentFitbitUser,
  ModelTrainingResult,
  VerifyAttempt,
  VerifyComparison,
  EcgFeatureSet,
  EcgSessionRecord,
  SessionMetadata,
  SessionCapturePayload,
  ContinuousVerifyResponse,
  ContinuousVerifyOptions,
  ConfidenceSnapshot,
  EcgBenchmarkRequest,
  EcgBenchmarkResponse,
  EcgDataOverviewResponse,
  VerificationLogEntry,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5104';

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const extractErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Unexpected API error.';
  }

  if (error.code === 'ECONNABORTED') {
    return 'Request timeout. The backend took too long to respond. Please retry.';
  }

  if (!error.response) {
    return 'Network error. Unable to reach the backend service.';
  }

  const payload = error.response?.data;

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidates = [record.message, record.error, record.title, record.detail];
    const firstString = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof firstString === 'string') {
      return firstString.trim();
    }
  }

  return error.message || 'Unexpected API error.';
};

const withApiError = async <T>(request: Promise<T>): Promise<T> => {
  try {
    return await request;
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
};

const coerceNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

const coerceBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (normalized === '1') return true;
    if (normalized === '0') return false;
  }
  return Boolean(value);
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

interface ConfidenceApiResponse {
  userId?: string;
  sampleCount?: number;
  rollingMean?: number;
  rollingStdDev?: number;
  exponentialMovingAverage?: number;
  drift?: number;
  confidenceLevel?: number;
  consecutivePasses?: number;
  consecutiveFailures?: number;
  updatedAtUtc?: string;
}

interface CurrentFitbitUserApiResponse {
  fitbitUserId: string;
  displayName?: string | null;
}

interface VerificationLogApiResponse {
  id?: string;
  fitbitUserId?: string | null;
  alias?: string | null;
  attemptedAtUtc?: string | null;
  ecgStartTimeUtc?: string | null;
  score?: number;
  threshold?: number;
  authenticated?: boolean | string | number | null;
  consensusScore?: number;
  votesPassing?: number;
  comparisonCount?: number;
  confidenceLevel?: number;
  confidenceDrift?: number;
  confidenceSamples?: number;
  label?: string | null;
  notes?: string | null;
}

interface VerifyApiResponse {
  fitbitUserId: string;
  authenticated?: boolean | string | number | null;
  score: number;
  threshold: number;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  comparisonScores?: number[];
  consensusScore?: number;
  passingVotes?: number;
  confidence?: ConfidenceApiResponse | null;
}

interface ContinuousVerifyApiResponse {
  authenticated?: boolean | string | number | null;
  rollingMeanScore: number;
  rollingWorstScore: number;
  samples: Array<{
    windowStartUtc: string;
    windowEndUtc: string;
    score: number;
    passes: boolean;
  }>;
}

interface EcgDataOverviewApiResponse {
  collections?: Array<{
    name?: string;
    documentCount?: number;
    lastUpdatedUtc?: string | null;
    summary?: string;
  }>;
  participants?: Array<{
    fitbitUserId?: string;
    sessionCount?: number;
    lastSessionAtUtc?: string | null;
  }>;
  recentSessions?: Array<{
    documentId?: string;
    fitbitUserId?: string;
    dataSource?: string;
    ecgStartTimeUtc?: string | null;
    signalQualityScore?: number;
    tags?: Array<string | null>;
  }>;
  recentVerificationLogs?: Array<{
    fitbitUserId?: string;
    attemptedAtUtc?: string | null;
    authenticated?: boolean | string | number | null;
    score?: number;
    threshold?: number;
    confidenceLevel?: number;
  }>;
  modelState?: {
    lastTrainedUtc?: string | null;
    sessionCount?: number;
    sessionCountAtLastTrain?: number;
    retrainPending?: boolean | string | number | null;
    retrainReason?: string | null;
    lastAccuracy?: number | null;
    lastAreaUnderRocCurve?: number | null;
    lastF1Score?: number | null;
  } | null;
  notes?: Array<string | null>;
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

const adaptConfidenceSnapshot = (confidence?: ConfidenceApiResponse | null): ConfidenceSnapshot | undefined => {
  if (!confidence) return undefined;
  const updatedAt = sanitizeString(confidence.updatedAtUtc) ?? new Date().toISOString();
  return {
    userId: confidence.userId ?? 'unknown',
    sampleCount: Math.max(0, Math.round(coerceNumber(confidence.sampleCount))),
    rollingMean: coerceNumber(confidence.rollingMean),
    rollingStdDev: coerceNumber(confidence.rollingStdDev),
    exponentialMovingAverage: coerceNumber(confidence.exponentialMovingAverage),
    drift: coerceNumber(confidence.drift),
    confidenceLevel: coerceNumber(confidence.confidenceLevel),
    consecutivePasses: Math.max(0, Math.round(coerceNumber(confidence.consecutivePasses))),
    consecutiveFailures: Math.max(0, Math.round(coerceNumber(confidence.consecutiveFailures))),
    updatedAtUtc: updatedAt,
  };
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
    rawPayload: data as unknown as Record<string, unknown>,
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
    passed: coerceBoolean(response.authenticated),
    hrv: response.hrvDailyRmssd,
    comparisons: adaptVerifyComparisons(response.comparisonScores ?? []),
    consensusScore: typeof response.consensusScore === 'number' ? response.consensusScore : undefined,
    passingVotes: typeof response.passingVotes === 'number' ? response.passingVotes : undefined,
    confidence: adaptConfidenceSnapshot(response.confidence),
    rawPayload: response as unknown as Record<string, unknown>,
  };
};

const adaptSessionRecord = (record: CollectSessionApiResponse): EcgSessionRecord => adaptCollectResponse(record);
const adaptVerificationLog = (record: VerificationLogApiResponse): VerificationLogEntry => ({
  id: sanitizeString(record.id) ?? randomId(),
  fitbitUserId: sanitizeString(record.fitbitUserId) ?? 'unknown',
  alias: sanitizeString(record.alias),
  attemptedAtUtc: sanitizeString(record.attemptedAtUtc),
  ecgStartTimeUtc: sanitizeString(record.ecgStartTimeUtc),
  score: coerceNumber(record.score),
  threshold: coerceNumber(record.threshold),
  authenticated: coerceBoolean(record.authenticated),
  consensusScore: coerceNumber(record.consensusScore),
  votesPassing: Math.max(0, Math.round(coerceNumber(record.votesPassing))),
  comparisonCount: Math.max(0, Math.round(coerceNumber(record.comparisonCount))),
  confidenceLevel: coerceNumber(record.confidenceLevel),
  confidenceDrift: coerceNumber(record.confidenceDrift),
  confidenceSamples: Math.max(0, Math.round(coerceNumber(record.confidenceSamples))),
  label: sanitizeString(record.label),
  notes: sanitizeString(record.notes),
});

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
  authenticated: coerceBoolean(response.authenticated),
  rollingMeanScore: coerceNumber(response.rollingMeanScore),
  rollingWorstScore: coerceNumber(response.rollingWorstScore),
  samples: adaptContinuousSamples(response.samples ?? []),
});

const adaptDataOverviewResponse = (response: EcgDataOverviewApiResponse): EcgDataOverviewResponse => ({
  collections: (response.collections ?? []).map((item) => ({
    name: sanitizeString(item.name) ?? 'unknown',
    documentCount: Math.max(0, Math.round(coerceNumber(item.documentCount))),
    lastUpdatedUtc: sanitizeString(item.lastUpdatedUtc),
    summary: sanitizeString(item.summary) ?? '',
  })),
  participants: (response.participants ?? []).map((item) => ({
    fitbitUserId: sanitizeString(item.fitbitUserId) ?? 'unknown',
    sessionCount: Math.max(0, Math.round(coerceNumber(item.sessionCount))),
    lastSessionAtUtc: sanitizeString(item.lastSessionAtUtc),
  })),
  recentSessions: (response.recentSessions ?? []).map((item) => ({
    documentId: sanitizeString(item.documentId) ?? randomId(),
    fitbitUserId: sanitizeString(item.fitbitUserId) ?? 'unknown',
    dataSource: sanitizeString(item.dataSource) ?? 'unknown',
    ecgStartTimeUtc: sanitizeString(item.ecgStartTimeUtc),
    signalQualityScore: coerceNumber(item.signalQualityScore),
    tags: adaptTags(item.tags),
  })),
  recentVerificationLogs: (response.recentVerificationLogs ?? []).map((item) => ({
    fitbitUserId: sanitizeString(item.fitbitUserId) ?? 'unknown',
    attemptedAtUtc: sanitizeString(item.attemptedAtUtc),
    authenticated: coerceBoolean(item.authenticated),
    score: coerceNumber(item.score),
    threshold: coerceNumber(item.threshold),
    confidenceLevel: coerceNumber(item.confidenceLevel),
  })),
  modelState: response.modelState
    ? {
        lastTrainedUtc: sanitizeString(response.modelState.lastTrainedUtc),
        sessionCount: Math.max(0, Math.round(coerceNumber(response.modelState.sessionCount))),
        sessionCountAtLastTrain: Math.max(0, Math.round(coerceNumber(response.modelState.sessionCountAtLastTrain))),
        retrainPending: coerceBoolean(response.modelState.retrainPending),
        retrainReason: sanitizeString(response.modelState.retrainReason),
        lastAccuracy:
          response.modelState.lastAccuracy == null ? undefined : coerceNumber(response.modelState.lastAccuracy),
        lastAreaUnderRocCurve:
          response.modelState.lastAreaUnderRocCurve == null
            ? undefined
            : coerceNumber(response.modelState.lastAreaUnderRocCurve),
        lastF1Score: response.modelState.lastF1Score == null ? undefined : coerceNumber(response.modelState.lastF1Score),
      }
    : undefined,
  notes: (response.notes ?? [])
    .map((item) => sanitizeString(item))
    .filter((item): item is string => Boolean(item)),
});

export const fetchSessions = async (): Promise<EcgSessionRecord[]> => {
  const { data } = await withApiError(http.get<CollectSessionApiResponse[]>('/api/ecg-auth/sessions'));
  return data.map((record) => adaptSessionRecord(record));
};

export const fetchCurrentFitbitUser = async (): Promise<CurrentFitbitUser> => {
  const { data } = await withApiError(http.get<CurrentFitbitUserApiResponse>('/api/ecg-auth/current-user'));
  return {
    fitbitUserId: data.fitbitUserId,
    displayName: sanitizeString(data.displayName),
  };
};

export const fetchVerificationLogs = async (
  options?: { fitbitUserId?: string; limit?: number },
): Promise<VerificationLogEntry[]> => {
  const params: Record<string, string | number> = {};
  if (options?.fitbitUserId) params.fitbitUserId = options.fitbitUserId;
  if (typeof options?.limit === 'number') params.limit = options.limit;

  const { data } = await withApiError(http.get<VerificationLogApiResponse[]>('/api/ecg-auth/logs', { params }));
  return data.map((record) => adaptVerificationLog(record));
};

export const collectSession = async (payload?: SessionCapturePayload): Promise<CollectSessionResponse> => {
  const body = payload ?? {};
  const { data } = await withApiError(http.post<CollectSessionApiResponse>('/api/ecg-auth/collect-session', body));
  return adaptCollectResponse(data);
};

export const trainModel = async (maxPairsPerUser: number): Promise<ModelTrainingResult> => {
  const { data } = await withApiError(
    http.post<ModelTrainingResult>(`/api/ecg-auth/train?maxPairsPerUser=${maxPairsPerUser}`, undefined, { timeout: 180000 }),
  );
  return {
    ...data,
    rawPayload: data as unknown as Record<string, unknown>,
  };
};

interface VerifyOptions {
  threshold: number;
  label?: 'genuine' | 'impostor';
  notes?: string;
  alias?: string;
  claimedFitbitUserId?: string;
  impostorAttempt?: boolean;
}

export const verifyAttempt = async (options: VerifyOptions): Promise<VerifyAttempt> => {
  const headers: Record<string, string> = {};
  if (options.claimedFitbitUserId?.trim()) headers['X-Claimed-Fitbit-UserId'] = options.claimedFitbitUserId.trim();
  if (options.impostorAttempt) headers['X-Impostor-Attempt'] = 'true';
  const { data } = await withApiError(
    http.post<VerifyApiResponse>(`/api/ecg-auth/verify?threshold=${options.threshold}`, undefined, { headers }),
  );
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

  const { data } = await withApiError(http.post<ContinuousVerifyApiResponse>('/api/ecg-auth/continuous-verify', payload));
  return adaptContinuousResponse(data);
};

export const benchmarkEcgId = async (
  options?: EcgBenchmarkRequest,
): Promise<EcgBenchmarkResponse> => {
  const payload: Record<string, unknown> = {};
  if (typeof options?.maxPairsPerUser === 'number') payload.maxPairsPerUser = options.maxPairsPerUser;
  if (typeof options?.testFraction === 'number') payload.testFraction = options.testFraction;

  const { data } = await withApiError(
    http.post<EcgBenchmarkResponse>('/api/ecg-auth/benchmark-ecg-id', payload, { timeout: 180000 }),
  );
  return data;
};

export const fetchDataOverview = async (): Promise<EcgDataOverviewResponse> => {
  const { data } = await withApiError(http.get<EcgDataOverviewApiResponse>('/api/ecg-auth/data-overview'));
  return adaptDataOverviewResponse(data);
};

export const fetchFitbitHrv = async (): Promise<Record<string, unknown>> => {
  const { data } = await withApiError(http.get('/api/fitbit/hrv'));
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return { raw: data };
    }
  }
  return (data ?? {}) as Record<string, unknown>;
};

export const fetchAllFitbitData = async (): Promise<Array<Record<string, unknown>>> => {
  const { data } = await withApiError(http.get('/api/fitbit/all-data'));
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Array<Record<string, unknown>>;
    } catch {
      return [{ raw: data }];
    }
  }

  if (Array.isArray(data)) {
    return data as Array<Record<string, unknown>>;
  }

  return [((data ?? {}) as Record<string, unknown>)];
};
