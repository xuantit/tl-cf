import { describe, expect, it } from 'vitest'

import { fieldsToParams, paramsToFields } from './ruleFields'

describe('cache rules action parameters', () => {
  it('builds the documented set_cache_settings shape', () => {
    const params = fieldsToParams('cache', {
      cache: 'true',
      edge_ttl_mode: 'override_origin',
      edge_ttl_default: 86400,
      browser_ttl_mode: 'respect_origin',
      cache_key_ignore_query_strings_order: 'true',
      cache_key_cache_deception_armor: 'true',
      cache_reserve_eligible: 'true',
      cache_reserve_minimum_file_size: 100000,
      serve_stale_disable_stale_while_updating: 'false',
      respect_strong_etags: 'true',
      additional_cacheable_ports: '8080, 8443',
      read_timeout: 900,
    })

    expect(params).toEqual({
      cache: true,
      edge_ttl: { mode: 'override_origin', default: 86400 },
      browser_ttl: { mode: 'respect_origin' },
      cache_key: { ignore_query_strings_order: true, cache_deception_armor: true },
      cache_reserve: { eligible: true, minimum_file_size: 100000 },
      serve_stale: { disable_stale_while_updating: false },
      respect_strong_etags: true,
      additional_cacheable_ports: [8080, 8443],
      read_timeout: 900,
    })
  })

  it('omits the TTL value when the mode is not override_origin', () => {
    const params = fieldsToParams('cache', {
      cache: 'true',
      edge_ttl_mode: 'respect_origin',
      edge_ttl_default: 500,
    })
    expect(params).toEqual({ cache: true, edge_ttl: { mode: 'respect_origin' } })
  })

  it('round-trips and keeps unsupported settings in the advanced bucket', () => {
    const original = {
      cache: true,
      edge_ttl: {
        mode: 'override_origin',
        default: 60,
        status_code_ttl: [{ status_code_range: { from: 500 }, value: -1 }],
      },
      vary: { default: { action: 'bypass' } },
    }

    const { values, advanced } = paramsToFields('cache', original)
    expect(advanced).toEqual({
      vary: { default: { action: 'bypass' } },
      edge_ttl: { status_code_ttl: [{ status_code_range: { from: 500 }, value: -1 }] },
    })

    expect(fieldsToParams('cache', values, advanced)).toEqual(original)
  })
})

describe('configuration rules action parameters', () => {
  it('only sends settings that were explicitly set', () => {
    const params = fieldsToParams('configuration', {
      ssl: 'strict',
      security_level: 'under_attack',
      polish: 'webp',
      request_body_buffering: 'full',
      response_body_buffering: '',
      automatic_https_rewrites: 'true',
      bic: 'false',
      rocket_loader: '',
      email_obfuscation: '',
      hotlink_protection: '',
      opportunistic_encryption: '',
      fonts: '',
      disable_rum: '',
      disable_zaraz: '',
      content_converter: 'true',
    })

    expect(params).toEqual({
      ssl: 'strict',
      security_level: 'under_attack',
      polish: 'webp',
      request_body_buffering: 'full',
      automatic_https_rewrites: true,
      bic: false,
      content_converter: true,
    })
  })

  it('reads existing configuration rules back into the form', () => {
    const { values } = paramsToFields('configuration', { ssl: 'flexible', rocket_loader: false })
    expect(values.ssl).toBe('flexible')
    expect(values.rocket_loader).toBe('false')
    expect(values.polish).toBe('')
  })
})

describe('redirect rules action parameters', () => {
  it('builds a static redirect', () => {
    expect(
      fieldsToParams('redirect', {
        redirect_kind: 'static',
        target_url_value: 'https://example.com/contact-us/',
        status_code: '308',
        preserve_query_string: '',
      }),
    ).toEqual({
      from_value: {
        target_url: { value: 'https://example.com/contact-us/' },
        status_code: 308,
      },
    })
  })

  it('builds a dynamic redirect with preserve_query_string', () => {
    expect(
      fieldsToParams('redirect', {
        redirect_kind: 'dynamic',
        target_url_expression: 'concat("https://example.com", http.request.uri.path)',
        status_code: '307',
        preserve_query_string: 'true',
      }),
    ).toEqual({
      from_value: {
        target_url: { expression: 'concat("https://example.com", http.request.uri.path)' },
        status_code: 307,
        preserve_query_string: true,
      },
    })
  })

  it('detects the dynamic mode when reading an existing rule', () => {
    const { values } = paramsToFields('redirect', {
      from_value: { target_url: { expression: 'lower(http.host)' }, status_code: 301 },
    })
    expect(values.redirect_kind).toBe('dynamic')
    expect(values.target_url_expression).toBe('lower(http.host)')
    expect(values.status_code).toBe('301')
  })
})
