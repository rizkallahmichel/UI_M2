import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import VerificationPanel from '../VerificationPanel'
import type { Participant, VerifyAttempt } from '../../types'

const participants: Participant[] = [
  { id: 'user-1', alias: 'Alice', sessionCount: 12 },
  { id: 'user-2', alias: 'Bob', sessionCount: 4 },
]

const baseAttempt: VerifyAttempt = {
  id: 'attempt-1',
  participantId: 'user-1',
  alias: 'Alice',
  timestamp: '2026-02-24T12:00:00.000Z',
  score: 0.92,
  threshold: 0.85,
  passed: true,
  comparisons: [
    { id: 'baseline-1', sessionLabel: 'Baseline 1', timestampLabel: 'Today', probability: 0.92 },
    { id: 'baseline-2', sessionLabel: 'Baseline 2', timestampLabel: 'Today', probability: 0.83 },
  ],
}

describe('VerificationPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-24T13:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const renderPanel = (overrides?: Partial<ComponentProps<typeof VerificationPanel>>) => {
    const onVerify = vi.fn()
    const onLabelUpdate = vi.fn()

    const props: ComponentProps<typeof VerificationPanel> = {
      participants,
      selectedParticipantId: 'user-1',
      onSelectParticipant: vi.fn(),
      onVerify,
      isVerifying: false,
      latestResult: baseAttempt,
      onLabelUpdate,
      attempts: [baseAttempt],
      ...overrides,
    }

    render(<VerificationPanel {...props} />)

    return { onVerify, onLabelUpdate }
  }

  it('invokes onVerify with current threshold, label, and notes', () => {
    const { onVerify } = renderPanel()

    const thresholdSlider = screen.getByRole('slider', { name: /Threshold:/i })
    fireEvent.change(thresholdSlider, { target: { value: 0.75 } })
    fireEvent.click(screen.getByLabelText('Impostor mode'))
    fireEvent.change(screen.getByLabelText('Attempt notes'), { target: { value: 'motion test' } })
    fireEvent.click(screen.getByRole('button', { name: /Verify now/i }))

    expect(onVerify).toHaveBeenCalledWith(0.75, 'impostor', 'motion test')
  })

  it('surfaces comparison results and allows relabeling attempts', () => {
    const { onLabelUpdate } = renderPanel()

    expect(screen.getByText('Baseline 1')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Genuine' }))
    expect(onLabelUpdate).toHaveBeenCalledWith(baseAttempt.id, 'genuine', undefined)
  })
})
