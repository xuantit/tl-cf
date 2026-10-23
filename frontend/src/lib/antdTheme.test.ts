import { theme } from 'antd'
import { describe, expect, it } from 'vitest'
import { getAppTheme } from './antdTheme'

// WCAG relative luminance for the opaque hex tokens asserted below. Reject
// alpha/unsupported colors rather than silently ignoring surface compositing.
function luminance(color: string): number {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) {
    throw new Error(`Expected an opaque hex color, received ${color}`)
  }
  const hex = color.length === 4
    ? [...color.slice(1)].map((digit) => digit + digit).join('')
    : color.slice(1)
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const primaryStates = ['colorPrimary', 'colorPrimaryHover', 'colorPrimaryActive'] as const
const surfaces = ['colorBgLayout', 'colorBgContainer', 'colorBgElevated'] as const

it('calculates contrast without rounding or ignoring alpha', () => {
  expect(contrast('#000', '#fff')).toBe(21)
  expect(contrast('#fff', '#ffffff')).toBe(1)
  expect(contrast('#785100', '#fff')).toBe(contrast('#fff', '#785100'))
  expect(() => contrast('#ffffff80', '#000')).toThrow('opaque hex')
})

describe.each([
  { mode: 'dark', dark: true, onPrimary: '#202433', fills: ['#f4d675', '#ffe5a0', '#dab854'] },
  { mode: 'light', dark: false, onPrimary: '#ffffff', fills: ['#946500', '#785100', '#654400'] },
])('$mode theme', ({ dark, onPrimary, fills }) => {
  const config = getAppTheme(dark)
  const tokens = theme.getDesignToken(config)

  it('resolves the exact brand aliases after running the algorithm', () => {
    expect(primaryStates.map((state) => tokens[state])).toEqual(fills)
    expect(primaryStates.map((state) => config.token?.[state])).toEqual(fills)
    expect(config.components?.Menu?.itemSelectedColor).toBe(tokens.colorPrimary)
  })

  it.each(primaryStates)('keeps primary button text at least 4.5:1 on %s', (state) => {
    const foreground = config.components?.Button?.primaryColor ?? tokens.colorTextLightSolid
    expect(foreground).toBe(onPrimary)
    expect(contrast(foreground, tokens[state])).toBeGreaterThanOrEqual(4.5)
  })

  it.each(primaryStates)('keeps %s used as text at least 4.5:1 on app surfaces', (state) => {
    for (const surface of surfaces) {
      expect(contrast(tokens[state], tokens[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(surfaces)('keeps primary/secondary text at least 4.5:1 on %s', (surface) => {
    for (const foreground of [tokens.colorText, tokens.colorTextSecondary]) {
      expect(contrast(foreground, tokens[surface])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps tertiary text at least 4.5:1 on container and elevated surfaces', () => {
    for (const surface of [tokens.colorBgContainer, tokens.colorBgElevated]) {
      expect(contrast(tokens.colorTextTertiary, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  // getDesignToken resolves global aliases, not component overrides. These
  // controls inherit those aliases with the explicit local overrides below;
  // this is token-level coverage, not a jsdom/computed-CSS accessibility claim.
  it.each(primaryStates)('keeps checkbox/radio marks and switch handles at least 3:1 on %s', (state) => {
    const checkbox = { ...tokens, ...config.components?.Checkbox }
    const radio = { ...tokens, ...config.components?.Radio }
    const handle = config.components?.Switch?.handleBg ?? tokens.colorWhite
    expect(config.components?.Checkbox?.algorithm).toBeUndefined()
    expect(config.components?.Radio?.algorithm).toBeUndefined()
    expect(config.components?.Switch?.algorithm).toBeUndefined()
    for (const [foreground, background] of [
      [checkbox.colorWhite, checkbox[state]],
      [radio.colorWhite, radio[state]],
      [handle, tokens[state]],
    ]) {
      expect(foreground).toBe(onPrimary)
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3)
    }
    const radioLabel = config.components?.Radio?.buttonSolidCheckedColor ?? tokens.colorTextLightSolid
    expect(radioLabel).toBe(onPrimary)
    expect(contrast(radioLabel, radio[state])).toBeGreaterThanOrEqual(4.5)
  })

  it('does not leak local ink overrides into the white danger text alias', () => {
    expect(config.token).not.toHaveProperty('colorWhite')
    expect(config.token).not.toHaveProperty('colorTextLightSolid')
    expect(config.components?.Button).not.toHaveProperty('colorWhite')
    expect(config.components?.Button).not.toHaveProperty('colorTextLightSolid')
    expect(config.components?.Button).not.toHaveProperty('dangerColor')
    expect(luminance(tokens.colorWhite)).toBe(1)
    expect(luminance(tokens.colorTextLightSolid)).toBe(1)
  })

  it('preserves the existing geometry and typography', () => {
    expect(tokens).toMatchObject({
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 6,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 14,
      controlHeight: 36,
      boxShadow: 'none',
      boxShadowSecondary:
        '0 1px 1px rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)',
    })
    expect(config.components).toMatchObject({
      Card: { boxShadowTertiary: 'none', borderRadiusLG: 16, paddingLG: 24 },
      Modal: { borderRadiusLG: 18 },
      Drawer: { borderRadiusLG: 16 },
      Table: { cellPaddingBlock: 10, cellPaddingInline: 14, fontSize: 13 },
      Menu: { itemBorderRadius: 10, itemMarginInline: 8 },
      Button: { fontWeight: 600, fontSize: 13 },
      Tabs: { horizontalMargin: '0 0 12px 0' },
      Form: { verticalLabelPadding: '0 0 6px' },
    })
  })
})

it('darkens light primary hover/active fills to preserve white text contrast', () => {
  const tokens = theme.getDesignToken(getAppTheme(false))
  expect(luminance(tokens.colorPrimaryHover)).toBeLessThan(luminance(tokens.colorPrimary))
  expect(luminance(tokens.colorPrimaryActive)).toBeLessThan(luminance(tokens.colorPrimaryHover))
})

it('uses readable light semantic colors without changing their status roles', () => {
  const tokens = theme.getDesignToken(getAppTheme(false))
  expect(tokens).toMatchObject({
    colorSuccess: '#16733e',
    colorError: '#b42335',
    colorWarning: '#885800',
    colorInfo: '#175cbd',
  })
  for (const status of ['colorSuccess', 'colorError', 'colorWarning', 'colorInfo'] as const) {
    for (const surface of surfaces) {
      expect(contrast(tokens[status], tokens[surface])).toBeGreaterThanOrEqual(4.5)
    }
  }
  expect(contrast(tokens.colorTextLightSolid, tokens.colorError)).toBeGreaterThanOrEqual(4.5)
})

it('preserves dark danger fills and white text rather than claiming a new AA pass', () => {
  const config = getAppTheme(true)
  const tokens = theme.getDesignToken(config)
  const baseline = theme.getDesignToken({ ...config, algorithm: theme.darkAlgorithm })
  expect(tokens.colorTextLightSolid).toBe(baseline.colorTextLightSolid)
  for (const state of ['colorError', 'colorErrorHover', 'colorErrorActive'] as const) {
    expect(tokens[state]).toBe(baseline[state])
    expect(contrast(tokens.colorTextLightSolid, tokens[state])).toBe(
      contrast(baseline.colorTextLightSolid, baseline[state]),
    )
  }
})