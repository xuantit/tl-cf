/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tagSource from '../components/ui/Tag.tsx?raw'

// Read source tokens, not Tailwind's transformed/merged CSS rules.
const css = readFileSync(resolve('src/index.css'), 'utf8')
const variables = (selector: ':root' | '.dark') => {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]+);/gi)].map((m) => [m[1], m[2]]))
}
const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
const luminance = (channels: number[]) => channels.map((v) => v / 255)
  .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
const contrast = (a: number[], b: number[]) =>
  (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)

describe.each([false, true])('semantic colors (dark=%s)', (dark) => {
  const v = { ...variables(':root'), ...(dark ? variables('.dark') : {}) }
  it('keeps each status label readable against its actual 9% tint', () => {
    for (const name of ['--ok', '--warn', '--danger', '--info']) {
      expect(tagSource).toContain(`var(${name})_9%,var(--bg)`)
      const fg = rgb(v[name]), bg = rgb(v['--bg'])
      const tint = fg.map((channel, i) => channel * .09 + bg[i] * .91)
      expect(contrast(fg, tint), name).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps hero text readable even against the lightest gradient stop', () => {
    for (const text of ['--hero-fg', '--hero-muted', '--hero-accent']) {
      for (const surface of ['--hero-bg', '--hero-bg-end', '--hero-glow']) {
        expect(contrast(rgb(v[text]), rgb(v[surface])), `${text} / ${surface}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('keeps auth/bulk primary labels readable in both states', () => {
    for (const surface of ['--accent', '--accent-hover']) {
      expect(contrast(rgb(v['--on-primary']), rgb(v[surface]))).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(rgb(v['--accent-solid']), rgb(v['--bar']))).toBeGreaterThanOrEqual(4.5)
  })
})