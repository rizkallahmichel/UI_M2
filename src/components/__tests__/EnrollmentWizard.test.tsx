import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EnrollmentWizard from '../EnrollmentWizard'
import type { CollectSessionResponse, Participant } from '../../types'

const participants: Participant[] = [{ id: 'user-1', alias: 'Alice', sessionCount: 12 }]

const capturedSession: CollectSessionResponse = {
  documentId: 'session-1',
  fitbitUserId: 'user-1',
  ecgStartTime: '2026-02-24T12:00:00.000Z',
  hrvDailyRmssd: 32,
  features: {
    estimatedBpm: 72,
    peakCount: 63,
    mean: 0.1,
    std: 0.1,
    rms: 0.1,
    min: -0.2,
    max: 0.2,
    skewness: 0,
    kurtosis: 0,
    rrMeanMs: 820,
    rrStdMs: 42,
    qrsWidthMs: 96,
    lowFreqPowerRatio: 0.1,
    midFreqPowerRatio: 0.1,
    highFreqPowerRatio: 0.1,
    spectralCentroidHz: 1,
    spectralEntropy: 1,
    veryLowFreqPowerRatio: 0.1,
    motionArtifactIndex: 0.15,
    baselineDriftRatio: 0.1,
    signalQualityScore: 0.9,
    hrvDailyRmssd: 32,
    signalQuality: 'good',
  },
  metadata: {},
  waveformPreview: [0, 1, 0, -1],
  signalQualityScore: 0.9,
  motionArtifactIndex: 0.15,
  baselineDriftRatio: 0.1,
  samplingHz: 250,
  scalingFactor: 1,
  tags: [],
}

const renderWizard = (overrides?: Partial<ComponentProps<typeof EnrollmentWizard>>) => {
  const onCapture = vi.fn().mockResolvedValue(capturedSession)

  const props: ComponentProps<typeof EnrollmentWizard> = {
    participant: participants[0],
    participants,
    onSelectParticipant: vi.fn(),
    onCapture,
    isCapturing: false,
    latestSession: null,
    ...overrides,
  }

  render(<EnrollmentWizard {...props} />)
  return { onCapture }
}

describe('EnrollmentWizard', () => {
  it('runs collection and shows summary', async () => {
    const { onCapture } = renderWizard()

    fireEvent.change(screen.getByPlaceholderText('resting, walking, post-run'), { target: { value: 'resting' } })
    fireEvent.change(screen.getByPlaceholderText('seated, post-exercise'), { target: { value: 'seated,morning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collect ECG sample' }))

    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ activityLabel: 'resting' }),
        tags: ['seated', 'morning'],
      }),
    )
    expect(await screen.findByText('Collected sample summary')).toBeVisible()
    expect(screen.getByText('session-1', { exact: false })).toBeVisible()
  })

  it('shows collection error banner when capture fails', async () => {
    const onCapture = vi.fn().mockRejectedValue(new Error('Backend timeout'))
    renderWizard({ onCapture })

    fireEvent.click(screen.getByRole('button', { name: 'Collect ECG sample' }))

    expect(await screen.findByText('Collection failed')).toBeVisible()
    expect(screen.getByText('Backend timeout')).toBeVisible()
  })
})
