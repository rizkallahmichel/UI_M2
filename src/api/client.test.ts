import { beforeEach, describe, expect, it, vi } from 'vitest'

const { post, isAxiosError } = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: vi.fn(() => false),
}))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      post,
    }),
    isAxiosError,
  },
}))

import { verifyAttempt } from './client'

describe('api client verifyAttempt', () => {
  beforeEach(() => {
    post.mockReset()
    isAxiosError.mockReset()
    isAxiosError.mockReturnValue(false)
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

    expect(post).toHaveBeenCalledWith('/api/ecg-auth/verify?threshold=0.85', undefined, { headers: {} })
    expect(result.participantId).toBe('user-42')
    expect(result.passed).toBe(false)
  })

  it('maps timeout failures to a clear retry message', async () => {
    isAxiosError.mockReturnValue(true)
    post.mockRejectedValue({
      code: 'ECONNABORTED',
      message: 'timeout of 15000ms exceeded',
    })

    await expect(verifyAttempt({ threshold: 0.85 })).rejects.toThrow(
      'Request timeout. The backend took too long to respond. Please retry.',
    )
  })

  it('maps network failures to a backend reachability message', async () => {
    isAxiosError.mockReturnValue(true)
    post.mockRejectedValue({
      code: 'ERR_NETWORK',
      message: 'Network Error',
      response: undefined,
    })

    await expect(verifyAttempt({ threshold: 0.85 })).rejects.toThrow(
      'Network error. Unable to reach the backend service.',
    )
  })
})
