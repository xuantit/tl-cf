import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest globals are disabled, so RTL's automatic cleanup never registers — do it explicitly.
afterEach(cleanup)

// jsdom does not implement matchMedia; AntD's responsive hooks require it.
// Simulate a 1200px-wide desktop viewport so responsive table columns (md/lg) render.
const SIMULATED_VIEWPORT_WIDTH = 1200
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    let matches = false
    const minWidth = /\(min-width:\s*([\d.]+)px\)/.exec(query)
    const maxWidth = /\(max-width:\s*([\d.]+)px\)/.exec(query)
    if (minWidth || maxWidth) {
      matches =
        (!minWidth || SIMULATED_VIEWPORT_WIDTH >= parseFloat(minWidth[1])) &&
        (!maxWidth || SIMULATED_VIEWPORT_WIDTH <= parseFloat(maxWidth[1]))
    }
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

// jsdom does not implement ResizeObserver; AntD Table/Grid rely on it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
