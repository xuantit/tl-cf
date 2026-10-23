import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import bootstrap from '../../public/theme-init.js?raw'
import indexHtml from '../../index.html?raw'
import { initializeThemeSync, useThemeStore } from './useThemeStore'

let stop: (() => void) | undefined
beforeEach(() => {
  localStorage.clear()
  useThemeStore.setState({ dark: true })
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  document.body.classList.remove('dark')
  document.documentElement.removeAttribute('style')
})

function expectTheme(dark: boolean) {
  expect(document.documentElement.classList.contains('dark')).toBe(dark)
  expect(document.body.classList.contains('dark')).toBe(dark)
  expect(document.documentElement.style.colorScheme).toBe(dark ? 'dark' : 'light')
}

describe('theme state and DOM synchronization', () => {
  it('applies immediately and saves toggles without waiting for React effects', () => {
    stop = initializeThemeSync()
    expectTheme(true)
    useThemeStore.getState().toggle()
    expectTheme(false)
    expect(JSON.parse(localStorage.getItem('app-theme')!).state).toEqual({ dark: false })
    useThemeStore.getState().toggle()
    expectTheme(true)
  })

  it.each([true, false])('restores the persisted boolean %s on reload', async (dark) => {
    localStorage.setItem('app-theme', JSON.stringify({ state: { dark }, version: 0 }))
    await useThemeStore.persist.rehydrate()
    stop = initializeThemeSync()
    expectTheme(dark)
  })

  it('rejects malformed persisted values and preserves store methods', async () => {
    localStorage.setItem('app-theme', JSON.stringify({ state: { dark: 'false', toggle: 'invalid' }, version: 0 }))
    await useThemeStore.persist.rehydrate()
    expect(useThemeStore.getState().dark).toBe(true)
    expect(useThemeStore.getState().toggle).toBeTypeOf('function')
  })

  it('synchronizes another tab, ignores other keys and resets on storage clear', () => {
    stop = initializeThemeSync()
    window.dispatchEvent(new StorageEvent('storage', { key: 'app-theme', newValue: JSON.stringify({ state: { dark: false } }) }))
    expectTheme(false)
    window.dispatchEvent(new StorageEvent('storage', { key: 'another-key', newValue: '{}' }))
    expectTheme(false)
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }))
    expectTheme(true)
  })

  it('does not break when localStorage access is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    stop = initializeThemeSync()
    expect(() => useThemeStore.getState().setDark(false)).not.toThrow()
    expectTheme(false)
  })

  it('is idempotent and cleans listeners up', () => {
    stop = initializeThemeSync()
    expect(initializeThemeSync()).toBe(stop)
    stop()
    useThemeStore.getState().setDark(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    stop = initializeThemeSync()
    expectTheme(false)
  })
})

describe('pre-paint theme bootstrap', () => {
  it.each([
    [null, true],
    ['{"state":{"dark":false},"version":0}', false],
    ['{"state":{"dark":true},"version":0}', true],
    ['{"state":{"dark":"false"}}', true],
    ['broken JSON', true],
  ])('reads %s without rendering the wrong initial theme', (saved, dark) => {
    const run = new Function('localStorage', 'document', bootstrap)
    run({ getItem: () => saved }, document)
    expect(document.documentElement.classList.contains('dark')).toBe(dark)
    expect(document.documentElement.style.colorScheme).toBe(dark ? 'dark' : 'light')
  })

  it('runs before the application module and tolerates storage errors', () => {
    expect(indexHtml.indexOf('src="/theme-init.js"')).toBeLessThan(indexHtml.indexOf('src="/src/main.tsx"'))
    const run = new Function('localStorage', 'document', bootstrap)
    expect(() => run({ getItem: () => { throw new Error('Blocked') } }, document)).not.toThrow()
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})