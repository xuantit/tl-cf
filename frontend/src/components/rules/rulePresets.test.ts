import { describe, expect, it } from 'vitest'

import { fieldsToParams, type RuleKind } from './ruleFields'
import { RULE_PRESETS, presetsForKind } from './rulePresets'

describe('rule presets', () => {
  it('has suggestions for every rule kind', () => {
    for (const kind of ['redirect', 'cache', 'configuration', 'security'] as RuleKind[]) {
      expect(presetsForKind(kind).length).toBeGreaterThan(0)
    }
  })

  it('uses unique keys', () => {
    const keys = RULE_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every preset produces a non-empty expression and action parameters', () => {
    for (const preset of RULE_PRESETS) {
      const built = preset.build('example.com')
      expect(built.expression.length, preset.key).toBeGreaterThan(0)
      expect(built.description.length, preset.key).toBeGreaterThan(0)

      if (preset.kind === 'security') {
        // WAF custom rules: action nằm ở cấp rule, action_parameters có thể rỗng.
        expect(built.values.security_action, preset.key).toBeTruthy()
        continue
      }
      const params = fieldsToParams(preset.kind, built.values, built.advanced)
      expect(params, preset.key).toBeDefined()
      expect(Object.keys(params ?? {}).length, preset.key).toBeGreaterThan(0)
    }
  })

  it('expressions have balanced parentheses', () => {
    for (const preset of RULE_PRESETS) {
      const expression = preset.build('example.com').expression
      const open = (expression.match(/\(/g) ?? []).length
      const close = (expression.match(/\)/g) ?? []).length
      expect(open, preset.key).toBe(close)
    }
  })

  it('substitutes the zone name into expressions and targets', () => {
    const wwwToRoot = RULE_PRESETS.find((p) => p.key === 'redirect-www-to-root')!.build('mysite.dev')
    expect(wwwToRoot.expression).toContain('www.mysite.dev')

    expect(fieldsToParams('redirect', wwwToRoot.values)).toEqual({
      from_value: {
        target_url: { expression: 'concat("https://mysite.dev", http.request.uri.path)' },
        status_code: 301,
        preserve_query_string: true,
      },
    })
  })

  it('uses regex_replace for prefix redirects, as documented by Cloudflare', () => {
    const preset = RULE_PRESETS.find((p) => p.key === 'redirect-old-prefix')!.build('example.com')
    expect(preset.values.target_url_expression).toBe(
      'concat("https://example.com", regex_replace(http.request.uri.path, "^/blog/(.*)", "/news/${1}"))',
    )
  })

  it('builds the documented ignore-query-strings cache key', () => {
    const preset = RULE_PRESETS.find((p) => p.key === 'cache-ignore-query-strings')!.build('example.com')
    expect(fieldsToParams('cache', preset.values, preset.advanced)).toEqual({
      cache: true,
      cache_key: { custom_key: { query_string: { exclude: '*' } } },
    })
  })

  it('bypasses cache without sending unrelated settings', () => {
    const preset = RULE_PRESETS.find((p) => p.key === 'cache-bypass-on-cookie')!.build('example.com')
    expect(fieldsToParams('cache', preset.values, preset.advanced)).toEqual({ cache: false })
    expect(preset.expression).toContain('wordpress_logged_in_')
  })

  it('matches the Cloudflare API-friendly configuration example', () => {
    const preset = RULE_PRESETS.find((p) => p.key === 'config-api-friendly')!.build('example.com')
    expect(fieldsToParams('configuration', preset.values)).toEqual({
      email_obfuscation: false,
      bic: false,
    })
  })

  it('only uses security_level values allowed in configuration rules', () => {
    const allowed = ['off', 'essentially_off', 'under_attack']
    for (const preset of presetsForKind('configuration')) {
      const level = preset.build('example.com').values.security_level
      if (level !== undefined) expect(allowed, preset.key).toContain(level)
    }
  })
})
