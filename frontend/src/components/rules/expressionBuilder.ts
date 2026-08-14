/**
 * Expression Builder — dựng biểu thức Ruleset Engine từ các dòng Field/Operator/Value,
 * bám theo Expression Builder của dashboard Cloudflare.
 *
 * Nguồn (kiểm tra 2026-08-13):
 *  - Fields & operators: https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
 *  - Rules language: https://developers.cloudflare.com/ruleset-engine/rules-language/
 */

export type FieldValueType = 'string' | 'number' | 'boolean'

export interface ExpressionField {
  /** Tên field trong rules language, ví dụ http.request.uri.path */
  value: string
  label: string
  type: FieldValueType
  /** Gợi ý nhập cho ô Value. */
  placeholder?: string
}

export const EXPRESSION_FIELDS: ExpressionField[] = [
  { value: 'http.host', label: 'Hostname', type: 'string', placeholder: 'example.com' },
  { value: 'http.request.full_uri', label: 'URI Full', type: 'string', placeholder: 'https://example.com/files/*' },
  { value: 'http.request.uri', label: 'URI', type: 'string', placeholder: '/path?query=1' },
  { value: 'http.request.uri.path', label: 'URI Path', type: 'string', placeholder: '/wp-admin' },
  { value: 'http.request.uri.query', label: 'URI Query String', type: 'string', placeholder: 'utm_source=news' },
  {
    value: 'http.request.uri.path.extension',
    label: 'File extension',
    type: 'string',
    placeholder: 'jpg, png, css',
  },
  { value: 'http.cookie', label: 'Cookie', type: 'string', placeholder: 'wordpress_logged_in_' },
  { value: 'http.referer', label: 'Referer', type: 'string' },
  { value: 'http.user_agent', label: 'User Agent', type: 'string' },
  { value: 'http.request.method', label: 'Request Method', type: 'string', placeholder: 'GET, POST' },
  { value: 'http.x_forwarded_for', label: 'X-Forwarded-For', type: 'string' },
  { value: 'ip.src', label: 'IP Source Address', type: 'string', placeholder: '203.0.113.1' },
  { value: 'ip.src.country', label: 'Country', type: 'string', placeholder: 'VN, US' },
  { value: 'ip.src.asnum', label: 'AS Num', type: 'number', placeholder: '13335' },
  { value: 'ssl', label: 'SSL/HTTPS', type: 'boolean' },
]

export interface ExpressionOperator {
  value: string
  label: string
  /** Toán tử nhận nhiều giá trị (danh sách trong {}). */
  list?: boolean
  /** Chỉ dùng được với field kiểu chuỗi. */
  stringOnly?: boolean
}

export const EXPRESSION_OPERATORS: ExpressionOperator[] = [
  { value: 'eq', label: 'equals' },
  { value: 'ne', label: 'does not equal' },
  { value: 'contains', label: 'contains', stringOnly: true },
  { value: 'not_contains', label: 'does not contain', stringOnly: true },
  { value: 'starts_with', label: 'starts with', stringOnly: true },
  { value: 'not_starts_with', label: 'does not start with', stringOnly: true },
  { value: 'ends_with', label: 'ends with', stringOnly: true },
  { value: 'not_ends_with', label: 'does not end with', stringOnly: true },
  { value: 'wildcard', label: 'wildcard', stringOnly: true },
  { value: 'strict_wildcard', label: 'strict wildcard', stringOnly: true },
  { value: 'matches', label: 'matches regex', stringOnly: true },
  { value: 'not_matches', label: 'does not match regex', stringOnly: true },
  { value: 'in', label: 'is in', list: true },
  { value: 'not_in', label: 'is not in', list: true },
]

export interface ExpressionRow {
  id: string
  field: string
  operator: string
  value: string
  /** Toán tử logic nối với dòng phía trên (bỏ qua ở dòng đầu). */
  join: 'and' | 'or'
}

export function fieldByName(name: string): ExpressionField | undefined {
  return EXPRESSION_FIELDS.find((f) => f.value === name)
}

export function operatorsForField(name: string): ExpressionOperator[] {
  const type = fieldByName(name)?.type ?? 'string'
  if (type === 'boolean') return EXPRESSION_OPERATORS.filter((o) => o.value === 'eq' || o.value === 'ne')
  if (type === 'number') return EXPRESSION_OPERATORS.filter((o) => !o.stringOnly)
  return EXPRESSION_OPERATORS
}

/** Escape dấu " và \ để chuỗi literal không làm hỏng biểu thức. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function literal(raw: string, type: FieldValueType): string {
  const trimmed = raw.trim()
  if (type === 'number') return trimmed
  if (type === 'boolean') return trimmed === 'false' ? 'false' : 'true'
  return quote(trimmed)
}

/** Một dòng builder → mệnh đề rules language. */
export function rowToClause(row: ExpressionRow): string | null {
  const field = fieldByName(row.field)
  if (!field) return null
  const type = field.type
  const raw = row.value.trim()
  if (type !== 'boolean' && raw === '') return null

  switch (row.operator) {
    case 'eq':
    case 'ne':
      return `${row.field} ${row.operator} ${literal(raw, type)}`
    case 'contains':
      return `${row.field} contains ${quote(raw)}`
    case 'not_contains':
      return `not ${row.field} contains ${quote(raw)}`
    case 'matches':
      return `${row.field} matches ${quote(raw)}`
    case 'not_matches':
      return `not ${row.field} matches ${quote(raw)}`
    case 'wildcard':
      return `${row.field} wildcard r${quote(raw)}`
    case 'strict_wildcard':
      return `${row.field} strict wildcard r${quote(raw)}`
    case 'starts_with':
      return `starts_with(${row.field}, ${quote(raw)})`
    case 'not_starts_with':
      return `not starts_with(${row.field}, ${quote(raw)})`
    case 'ends_with':
      return `ends_with(${row.field}, ${quote(raw)})`
    case 'not_ends_with':
      return `not ends_with(${row.field}, ${quote(raw)})`
    case 'in':
    case 'not_in': {
      const items = splitList(raw)
      if (items.length === 0) return null
      const set = `{${items.map((item) => literal(item, type)).join(' ')}}`
      return row.operator === 'in' ? `${row.field} in ${set}` : `not ${row.field} in ${set}`
    }
    default:
      return null
  }
}

/**
 * Ghép các dòng thành biểu thức hoàn chỉnh.
 * Dòng nối bằng `or` được gom trong ngoặc để không bị `and` cướp độ ưu tiên.
 */
export function buildExpression(rows: ExpressionRow[]): string {
  const groups: string[][] = []
  for (const row of rows) {
    const clause = rowToClause(row)
    if (!clause) continue
    if (groups.length === 0 || row.join === 'and') groups.push([clause])
    else groups[groups.length - 1].push(clause)
  }
  if (groups.length === 0) return ''

  const parts = groups.map((group) => (group.length === 1 ? group[0] : `(${group.join(' or ')})`))
  return `(${parts.join(' and ')})`
}

export const MATCH_ALL_EXPRESSION = 'true'

export function createRow(join: 'and' | 'or' = 'and'): ExpressionRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    field: 'http.request.uri.path',
    operator: 'eq',
    value: '',
    join,
  }
}
