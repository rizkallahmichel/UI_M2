import type { Page, Route } from '@playwright/test'

const sessionsResponse = JSON.stringify([
  {
    documentId: 'session-1',
    fitbitUserId: 'BTNYKG',
    ecgStartTime: '2026-04-16T08:00:00.000Z',
    hrvDailyRmssd: 42.2,
    features: {
      Mean: 0.01,
      Std: 0.12,
      Rms: 0.13,
      Min: -0.5,
      Max: 0.6,
      Skewness: 0.1,
      Kurtosis: 2.2,
      EstimatedBpm: 67,
      PeakCount: 28,
      RrMeanMs: 902,
      RrStdMs: 41,
      QrsWidthMs: 90,
      LowFreqPowerRatio: 0.31,
      MidFreqPowerRatio: 0.23,
      HighFreqPowerRatio: 0.29,
      SpectralCentroidHz: 2.3,
      SpectralEntropy: 0.72,
      VeryLowFreqPowerRatio: 0.17,
      SignalQualityScore: 0.88,
      MotionArtifactIndex: 0.22,
      BaselineDriftRatio: 0.14,
    },
    tags: ['baseline'],
    notes: 'mocked-e2e-session',
  },
])

export async function mockBackend(page: Page): Promise<void> {
  await page.route('http://localhost:5104/**', async (route: Route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.endsWith('/api/ecg-auth/sessions') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: sessionsResponse })
      return
    }

    if (url.endsWith('/api/ecg-auth/current-user') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fitbitUserId: 'BTNYKG',
          displayName: 'Michel',
        }),
      })
      return
    }

    if (url.includes('/api/ecg-auth/train') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          modelPath: 'ecg_auth_model.zip',
          correctionModelPath: 'ecg_auth_model_correction.zip',
          accuracy: 0.92,
          areaUnderRocCurve: 0.94,
          f1Score: 0.9,
          pairCount: 140,
          sessionCount: 24,
        }),
      })
      return
    }

    if (url.includes('/api/ecg-auth/verify') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fitbitUserId: 'BTNYKG',
          authenticated: true,
          score: 0.91,
          threshold: 0.85,
          ecgStartTime: '2026-04-16T08:05:00.000Z',
          comparisonScores: [0.9, 0.89, 0.94],
          confidence: {
            userId: 'BTNYKG',
            sampleCount: 20,
            rollingMean: 0.89,
            rollingStdDev: 0.05,
            exponentialMovingAverage: 0.9,
            drift: 0.02,
            confidenceLevel: 0.93,
            consecutivePasses: 5,
            consecutiveFailures: 0,
            updatedAtUtc: '2026-04-16T08:05:00.000Z',
          },
        }),
      })
      return
    }

    if (url.endsWith('/api/ecg-auth/collect-session') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentId: 'session-2',
          fitbitUserId: 'BTNYKG',
          ecgStartTime: '2026-04-16T08:10:00.000Z',
          hrvDailyRmssd: 43.1,
          features: {
            Mean: 0.01,
            Std: 0.12,
            Rms: 0.13,
            Min: -0.5,
            Max: 0.6,
            Skewness: 0.1,
            Kurtosis: 2.2,
            EstimatedBpm: 67,
            PeakCount: 28,
            RrMeanMs: 902,
            RrStdMs: 41,
            QrsWidthMs: 90,
            LowFreqPowerRatio: 0.31,
            MidFreqPowerRatio: 0.23,
            HighFreqPowerRatio: 0.29,
            SpectralCentroidHz: 2.3,
            SpectralEntropy: 0.72,
            VeryLowFreqPowerRatio: 0.17,
            SignalQualityScore: 0.88,
            MotionArtifactIndex: 0.22,
            BaselineDriftRatio: 0.14,
          },
          tags: ['baseline'],
          notes: 'mocked-collected-session',
        }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}
