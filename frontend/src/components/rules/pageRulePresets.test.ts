import { describe, expect, it } from 'vitest'

import { PAGE_RULE_PRESETS } from './pageRulePresets'

describe('PAGE_RULE_PRESETS', () => {
  it('contains common Cloudflare free-plan presets', () => {
    const keys = PAGE_RULE_PRESETS.map((preset) => preset.key)

    expect(keys).toContain('redirect-http-to-https')
    expect(keys).toContain('cache-everything')
    expect(keys).toContain('bypass-cache-everything')
    expect(keys).toContain('set-edge-cache-time')
  })

  it('builds redirect-www-to-root rule with forwarding action', () => {
    const preset = PAGE_RULE_PRESETS.find((item) => item.key === 'redirect-www-to-root')
    expect(preset).toBeDefined()

    const result = preset!.build('example.com')
    expect(result.targets[0].constraint.value).toBe('www.example.com/*')
    expect(result.actions[0].id).toBe('forwarding_url')
  })
})
