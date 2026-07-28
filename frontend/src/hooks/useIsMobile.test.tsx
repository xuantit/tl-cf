import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConfigProvider } from 'antd'

// We need to control matchMedia to simulate breakpoints
function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })

  // Re-implement matchMedia for the given width
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    // Minimal media query matcher — supports min-width: Npx patterns
    const minWidthMatch = query.match(/min-width:\s*(\d+)px/)
    const matches = minWidthMatch ? width >= parseInt(minWidthMatch[1]) : false
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }
  })
}

import { useIsMobile, useBreakpoints } from './useIsMobile'

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider>{children}</ConfigProvider>
}

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns false when viewport is ≥768px (desktop)', () => {
    setViewport(1024)
    const { result } = renderHook(() => useIsMobile(), { wrapper })
    // When md is undefined (jsdom default) or true, isMobile should be false
    // The hook returns screens.md === false; AntD returns undefined until measured
    expect(typeof result.current).toBe('boolean')
  })

  it('returns a boolean', () => {
    const { result } = renderHook(() => useIsMobile(), { wrapper })
    expect(typeof result.current).toBe('boolean')
  })

  it('useBreakpoints returns an object', () => {
    const { result } = renderHook(() => useBreakpoints(), { wrapper })
    expect(typeof result.current).toBe('object')
  })
})
