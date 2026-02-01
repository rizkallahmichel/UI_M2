import axios from 'axios';
import type { CollectSessionResponse, ModelTrainingResult, VerifyAttempt, VerifyComparison, EcgFeatureSet, EcgSessionRecord } from '../types';

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
  const { peakCount = 0, std = 0, estimatedBpm = 0 } = features;
  if (peakCount < 10 || std < 0.05 || estimatedBpm < 40 || estimatedBpm > 160) return 'poor';
  if (peakCount < 25 || std < 0.08) return 'medium';
  return 'good';
};

const normalizeFeatures = (payload: Record<string, unknown>, hrv?: number): EcgFeatureSet => {
  const normalized = {
    estimatedBpm: coerceNumber(payload.EstimatedBpm ?? payload.estimatedBpm),
    peakCount: coerceNumber(payload.PeakCount ?? payload.peakCount),
    mean: coerceNumber(payload.Mean ?? payload.mean),
    std: coerceNumber(payload.Std ?? payload.std),
    rms: coerceNumber(payload.Rms ?? payload.rms),
    min: coerceNumber(payload.Min ?? payload.min),
    max: coerceNumber(payload.Max ?? payload.max),
    skewness: coerceNumber(payload.Skewness ?? payload.skewness),
    kurtosis: coerceNumber(payload.Kurtosis ?? payload.kurtosis),
    hrvDailyRmssd: hrv ?? coerceNumber(payload.HrvDailyRmssd ?? payload.hrvDailyRmssd),
  };

  return {
    ...normalized,
    signalQuality: evaluateSignalQuality(normalized),
  };
};

interface CollectSessionApiResponse {
  documentId: string;
  fitbitUserId: string;
  ecgStartTime?: string;
  hrvDailyRmssd?: number;
  features: Record<string, unknown>;
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

const adaptVerifyComparisons = (scores: number[]): VerifyComparison[] =>
  scores.map((probability, idx) => ({
    id: `baseline-${idx + 1}`,
    sessionLabel: `Session ${idx + 1}`,
    timestampLabel: `Baseline #${idx + 1}`,
    probability,
  }));

const adaptCollectResponse = (data: CollectSessionApiResponse): CollectSessionResponse => ({
  documentId: data.documentId,
  fitbitUserId: data.fitbitUserId,
  ecgStartTime: data.ecgStartTime,
  hrvDailyRmssd: data.hrvDailyRmssd,
  features: normalizeFeatures(data.features ?? {}, data.hrvDailyRmssd),
});

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

export const fetchSessions = async (): Promise<EcgSessionRecord[]> => {
  const { data } = await http.get<CollectSessionApiResponse[]>('/api/ecg-auth/sessions');
  return data.map((record) => adaptSessionRecord(record));
};

export const collectSession = async (): Promise<CollectSessionResponse> => {
  const { data } = await http.post<CollectSessionApiResponse>('/api/ecg-auth/collect-session');
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
