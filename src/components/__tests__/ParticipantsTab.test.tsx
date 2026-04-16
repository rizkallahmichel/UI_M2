import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ParticipantsTab from '../ParticipantsTab'
import type { Participant } from '../../types'

const participants: Participant[] = [
  { id: 'user-1', alias: 'Alice', sessionCount: 12, enrollmentProgress: 1 },
  { id: 'user-2', alias: 'Bob', sessionCount: 5, enrollmentProgress: 0.4 },
]

const renderTab = (overrides?: Partial<ComponentProps<typeof ParticipantsTab>>) => {
  const props: ComponentProps<typeof ParticipantsTab> = {
    participants,
    loading: false,
    selectedParticipantId: 'user-1',
    onSelectParticipant: vi.fn(),
    onAliasChange: vi.fn(),
    onGoToEnrollment: vi.fn(),
    onGoToVerification: vi.fn(),
    onTrainModel: vi.fn(),
    training: false,
    lastTrainingResult: null,
    ...overrides,
  }
  render(<ParticipantsTab {...props} />)
  return props
}

describe('ParticipantsTab', () => {
  it('triggers train with selected pair limit', () => {
    const props = renderTab()
    fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '700' } })
    fireEvent.click(screen.getByRole('button', { name: 'Train now' }))
    expect(props.onTrainModel).toHaveBeenCalledWith(700)
  })

  it('commits alias change on blur', () => {
    const props = renderTab()
    const aliasInput = screen.getByDisplayValue('Bob')
    fireEvent.change(aliasInput, { target: { value: 'Bobby' } })
    fireEvent.blur(aliasInput)
    expect(props.onAliasChange).toHaveBeenCalledWith('user-2', 'Bobby')
  })
})
