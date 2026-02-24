import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns default value when storage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'fallback'))

    expect(result.current[0]).toBe('fallback')
  })

  it('reads existing value from storage', () => {
    window.localStorage.setItem('key', JSON.stringify('from-storage'))
    const { result } = renderHook(() => useLocalStorage('key', 'fallback'))

    expect(result.current[0]).toBe('from-storage')
  })

  it('writes updates back to storage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 0))

    act(() => {
      result.current[1](42)
    })

    expect(window.localStorage.getItem('key')).toBe('42')
  })
})
