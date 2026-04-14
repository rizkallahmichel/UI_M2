import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post } = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post,
    }),
    isAxiosError: vi.fn(() => false),
  },
}))

import { verifyAttempt } from './client'

describe('api client verifyAttempt', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('treats string false from the backend as a failed authentication', async () => {
    post.mockResolvedValue({
      data: {
        fitbitUserId: 'user-42',
        authenticated: 'false',
        score: 0.41,
        threshold: 0.85,
      },
    })

    const result = await verifyAttempt({ threshold: 0.85 })

    expect(post).toHaveBeenCalledWith('/api/ecg-auth/verify?threshold=0.85')
    expect(result.participantId).toBe('user-42')
    expect(result.passed).toBe(false)
  })
})
