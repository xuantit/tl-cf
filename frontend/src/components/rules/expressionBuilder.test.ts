import { describe, expect, it } from 'vitest'

import {
  buildExpression,
  operatorsForField,
  rowToClause,
  type ExpressionRow,
} from './expressionBuilder'

function row(partial: Partial<ExpressionRow>): ExpressionRow {
  return {
    id: partial.id ?? 'x',
    field: partial.field ?? 'http.request.uri.path',
    operator: partial.operator ?? 'eq',
    value: partial.value ?? '',
    join: partial.join ?? 'and',
  }
}

describe('rowToClause', () => {
  it('builds comparison operators', () => {
    expect(rowToClause(row({ field: 'http.host', operator: 'eq', value: 'example.com' }))).toBe(
      'http.host eq "example.com"',
    )
    expect(rowToClause(row({ operator: 'ne', value: '/a' }))).toBe('http.request.uri.path ne "/a"')
    expect(rowToClause(row({ operator: 'contains', value: '/wp-admin' }))).toBe(
      'http.request.uri.path contains "/wp-admin"',
    )
    expect(rowToClause(row({ operator: 'not_contains', value: '/wp-admin' }))).toBe(
      'not http.request.uri.path contains "/wp-admin"',
    )
  })

  it('builds function-style operators', () => {
    expect(rowToClause(row({ operator: 'starts_with', value: '/blog/' }))).toBe(
      'starts_with(http.request.uri.path, "/blog/")',
    )
    expect(rowToClause(row({ operator: 'not_ends_with', value: '.php' }))).toBe(
      'not ends_with(http.request.uri.path, ".php")',
    )
  })

  it('builds wildcard and regex operators', () => {
    expect(
      rowToClause(
        row({ field: 'http.request.full_uri', operator: 'wildcard', value: 'https://*.example.com/files/*' }),
      ),
    ).toBe('http.request.full_uri wildcard r"https://*.example.com/files/*"')
    expect(rowToClause(row({ operator: 'matches', value: '^/api/v[0-9]+' }))).toBe(
      'http.request.uri.path matches "^/api/v[0-9]+"',
    )
  })

  it('builds list operators from comma separated values', () => {
    expect(
      rowToClause(row({ field: 'http.request.uri.path.extension', operator: 'in', value: 'jpg, png, webp' })),
    ).toBe('http.request.uri.path.extension in {"jpg" "png" "webp"}')
    expect(rowToClause(row({ field: 'ip.src.country', operator: 'not_in', value: 'VN,US' }))).toBe(
      'not ip.src.country in {"VN" "US"}',
    )
  })

  it('does not quote numbers and booleans', () => {
    expect(rowToClause(row({ field: 'ip.src.asnum', operator: 'eq', value: '13335' }))).toBe(
      'ip.src.asnum eq 13335',
    )
    expect(rowToClause(row({ field: 'ssl', operator: 'eq', value: 'false' }))).toBe('ssl eq false')
  })

  it('escapes quotes in values', () => {
    expect(rowToClause(row({ operator: 'eq', value: 'a"b' }))).toBe('http.request.uri.path eq "a\\"b"')
  })

  it('ignores rows without a value', () => {
    expect(rowToClause(row({ operator: 'eq', value: '  ' }))).toBeNull()
  })
})

describe('buildExpression', () => {
  it('returns an empty string when nothing is filled in', () => {
    expect(buildExpression([row({ value: '' })])).toBe('')
  })

  it('joins rows with and', () => {
    expect(
      buildExpression([
        row({ id: '1', field: 'http.host', operator: 'eq', value: 'example.com' }),
        row({ id: '2', operator: 'starts_with', value: '/blog/', join: 'and' }),
      ]),
    ).toBe('(http.host eq "example.com" and starts_with(http.request.uri.path, "/blog/"))')
  })

  it('groups or-chained rows so and keeps precedence', () => {
    expect(
      buildExpression([
        row({ id: '1', field: 'http.host', operator: 'eq', value: 'example.com' }),
        row({ id: '2', operator: 'contains', value: '/cart', join: 'and' }),
        row({ id: '3', operator: 'contains', value: '/checkout', join: 'or' }),
      ]),
    ).toBe(
      '(http.host eq "example.com" and (http.request.uri.path contains "/cart" or http.request.uri.path contains "/checkout"))',
    )
  })

  it('skips incomplete rows', () => {
    expect(
      buildExpression([
        row({ id: '1', field: 'http.host', operator: 'eq', value: 'example.com' }),
        row({ id: '2', operator: 'eq', value: '', join: 'and' }),
      ]),
    ).toBe('(http.host eq "example.com")')
  })
})

describe('operatorsForField', () => {
  it('limits boolean fields to equality operators', () => {
    expect(operatorsForField('ssl').map((o) => o.value)).toEqual(['eq', 'ne'])
  })

  it('hides string-only operators for numeric fields', () => {
    expect(operatorsForField('ip.src.asnum').map((o) => o.value)).not.toContain('contains')
  })

  it('offers the full set for string fields', () => {
    expect(operatorsForField('http.host').map((o) => o.value)).toContain('wildcard')
  })
})
