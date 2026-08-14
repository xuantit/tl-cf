/**
 * Định nghĩa action parameters của Ruleset Engine theo tài liệu Cloudflare mới nhất.
 *
 * Nguồn (kiểm tra 2026-08-13):
 *  - Cache Rules:        https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
 *  - Configuration Rules: https://developers.cloudflare.com/rules/configuration-rules/settings/
 *  - Single Redirects:   https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/
 *
 * Form dùng key phẳng (vd `edge_ttl_mode`); `fieldsToParams` dựng lại đúng cấu
 * trúc lồng nhau mà API yêu cầu, `paramsToFields` làm chiều ngược lại. Mọi key
 * không nằm trong danh sách đã biết được giữ nguyên trong ô JSON nâng cao
 * (vd `vary`, `cache_key.custom_key`, `edge_ttl.status_code_ttl`).
 */

export type RuleKind = 'redirect' | 'cache' | 'configuration'

export const RULE_KINDS: RuleKind[] = ['redirect', 'cache', 'configuration']

export type FieldType = 'bool3' | 'select' | 'number' | 'text'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  help?: string
  /** Chỉ hiện khi điều kiện đúng (phụ thuộc field khác). */
  showIf?: (values: Record<string, unknown>) => boolean
  /** Cloudflare bắt buộc giá trị này cho loại rule tương ứng. */
  required?: boolean
  /** Gói/plan tối thiểu — chỉ để hiện nhãn cảnh báo. */
  planNote?: string
}

export type FormValues = Record<string, unknown>

const TTL_MODE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'respect_origin', label: 'Respect origin (cache-control header)' },
  { value: 'override_origin', label: 'Override origin (use this TTL)' },
  { value: 'bypass_by_default', label: 'Bypass cache if no cache-control' },
]

export const CACHE_FIELDS: FieldDef[] = [
  {
    name: 'cache',
    label: 'Cache eligibility',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Not set' },
      { value: 'true', label: 'Eligible for cache' },
      { value: 'false', label: 'Bypass cache' },
    ],
    help: 'action_parameters.cache',
  },
  { name: 'edge_ttl_mode', label: 'Edge TTL', type: 'select', options: TTL_MODE_OPTIONS },
  {
    name: 'edge_ttl_default',
    label: 'Edge TTL value (seconds)',
    type: 'number',
    showIf: (v) => v.edge_ttl_mode === 'override_origin',
    help: 'edge_ttl.default',
  },
  { name: 'browser_ttl_mode', label: 'Browser TTL', type: 'select', options: TTL_MODE_OPTIONS },
  {
    name: 'browser_ttl_default',
    label: 'Browser TTL value (seconds)',
    type: 'number',
    showIf: (v) => v.browser_ttl_mode === 'override_origin',
    help: 'browser_ttl.default',
  },
  {
    name: 'cache_key_ignore_query_strings_order',
    label: 'Sort query string',
    type: 'bool3',
    help: 'cache_key.ignore_query_strings_order',
  },
  {
    name: 'cache_key_cache_deception_armor',
    label: 'Cache deception armor',
    type: 'bool3',
    help: 'cache_key.cache_deception_armor',
  },
  {
    name: 'cache_key_cache_by_device_type',
    label: 'Cache by device type',
    type: 'bool3',
    help: 'cache_key.cache_by_device_type',
  },
  {
    name: 'cache_reserve_eligible',
    label: 'Cache Reserve eligibility',
    type: 'bool3',
    help: 'cache_reserve.eligible',
  },
  {
    name: 'cache_reserve_minimum_file_size',
    label: 'Cache Reserve minimum file size (bytes)',
    type: 'number',
    showIf: (v) => v.cache_reserve_eligible === 'true',
    help: 'cache_reserve.minimum_file_size',
  },
  {
    name: 'serve_stale_disable_stale_while_updating',
    label: 'Disable serve stale while updating',
    type: 'bool3',
    help: 'serve_stale.disable_stale_while_updating',
  },
  { name: 'respect_strong_etags', label: 'Respect strong ETags', type: 'bool3' },
  { name: 'origin_error_page_passthru', label: 'Origin error page pass-through', type: 'bool3' },
  {
    name: 'origin_cache_control',
    label: 'Origin Cache Control',
    type: 'bool3',
    planNote: 'Enterprise',
  },
  {
    name: 'read_timeout',
    label: 'Proxy read timeout (seconds)',
    type: 'number',
    planNote: 'Enterprise',
  },
  {
    name: 'additional_cacheable_ports',
    label: 'Additional cacheable ports',
    type: 'text',
    help: 'Danh sách cổng, cách nhau bởi dấu phẩy (vd 8080, 8443)',
    planNote: 'Enterprise',
  },
]

export const CONFIGURATION_FIELDS: FieldDef[] = [
  {
    name: 'ssl',
    label: 'SSL/TLS encryption mode',
    type: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'off', label: 'Off' },
      { value: 'flexible', label: 'Flexible' },
      { value: 'full', label: 'Full' },
      { value: 'strict', label: 'Full (strict)' },
      { value: 'origin_pull', label: 'Authenticated Origin Pull' },
    ],
  },
  {
    name: 'security_level',
    label: 'Security level',
    type: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'off', label: 'Off' },
      { value: 'essentially_off', label: 'Essentially off' },
      { value: 'under_attack', label: "I'm Under Attack" },
    ],
  },
  {
    name: 'polish',
    label: 'Polish',
    type: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'off', label: 'Off' },
      { value: 'lossless', label: 'Lossless' },
      { value: 'lossy', label: 'Lossy' },
      { value: 'webp', label: 'WebP' },
    ],
  },
  {
    name: 'request_body_buffering',
    label: 'Request body buffering',
    type: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'standard', label: 'Standard' },
      { value: 'full', label: 'Full' },
      { value: 'none', label: 'None' },
    ],
  },
  {
    name: 'response_body_buffering',
    label: 'Response body buffering',
    type: 'select',
    options: [
      { value: '', label: 'Not set' },
      { value: 'standard', label: 'Standard' },
      { value: 'none', label: 'None' },
    ],
  },
  { name: 'automatic_https_rewrites', label: 'Automatic HTTPS Rewrites', type: 'bool3' },
  { name: 'bic', label: 'Browser Integrity Check', type: 'bool3', help: 'bic' },
  { name: 'email_obfuscation', label: 'Email Obfuscation', type: 'bool3' },
  { name: 'hotlink_protection', label: 'Hotlink Protection', type: 'bool3' },
  { name: 'opportunistic_encryption', label: 'Opportunistic Encryption', type: 'bool3' },
  { name: 'rocket_loader', label: 'Rocket Loader', type: 'bool3' },
  { name: 'fonts', label: 'Cloudflare Fonts', type: 'bool3' },
  { name: 'disable_rum', label: 'Disable Real User Monitoring (RUM)', type: 'bool3' },
  { name: 'disable_zaraz', label: 'Disable Zaraz', type: 'bool3' },
  {
    name: 'content_converter',
    label: 'Markdown for Agents',
    type: 'bool3',
    help: 'content_converter',
  },
]

export const REDIRECT_FIELDS: FieldDef[] = [
  {
    name: 'redirect_kind',
    label: 'Target URL type',
    type: 'select',
    options: [
      { value: 'static', label: 'Static URL' },
      { value: 'dynamic', label: 'Dynamic (expression)' },
    ],
  },
  {
    name: 'target_url_value',
    label: 'Target URL',
    type: 'text',
    required: true,
    showIf: (v) => v.redirect_kind !== 'dynamic',
    help: 'from_value.target_url.value',
  },
  {
    name: 'target_url_expression',
    label: 'Target URL expression',
    type: 'text',
    required: true,
    showIf: (v) => v.redirect_kind === 'dynamic',
    help: 'ví dụ concat("https://example.com", http.request.uri.path)',
  },
  {
    name: 'status_code',
    label: 'Status code',
    type: 'select',
    required: true,
    options: [
      { value: '', label: 'Not set' },
      { value: '301', label: '301 — Moved Permanently' },
      { value: '302', label: '302 — Found' },
      { value: '303', label: '303 — See Other' },
      { value: '307', label: '307 — Temporary Redirect' },
      { value: '308', label: '308 — Permanent Redirect' },
    ],
  },
  { name: 'preserve_query_string', label: 'Preserve query string', type: 'bool3' },
]

export function fieldsForKind(kind: RuleKind): FieldDef[] {
  if (kind === 'cache') return CACHE_FIELDS
  if (kind === 'configuration') return CONFIGURATION_FIELDS
  return REDIRECT_FIELDS
}

/** Key cấp 1 của action_parameters mà form đã xử lý — phần còn lại vào JSON nâng cao. */
const HANDLED_TOP_KEYS: Record<RuleKind, string[]> = {
  cache: [
    'cache',
    'edge_ttl',
    'browser_ttl',
    'cache_key',
    'cache_reserve',
    'serve_stale',
    'respect_strong_etags',
    'origin_error_page_passthru',
    'origin_cache_control',
    'read_timeout',
    'additional_cacheable_ports',
  ],
  configuration: CONFIGURATION_FIELDS.map((f) => f.name),
  redirect: ['from_value'],
}

/** Key con của các object lồng nhau mà form xử lý (giữ lại phần còn lại). */
const HANDLED_NESTED_KEYS: Record<string, string[]> = {
  edge_ttl: ['mode', 'default'],
  browser_ttl: ['mode', 'default'],
  cache_key: ['ignore_query_strings_order', 'cache_deception_armor', 'cache_by_device_type'],
  cache_reserve: ['eligible', 'minimum_file_size'],
  serve_stale: ['disable_stale_while_updating'],
  from_value: ['target_url', 'status_code', 'preserve_query_string'],
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function boolToTri(value: unknown): string {
  if (value === true) return 'true'
  if (value === false) return 'false'
  return ''
}

function triToBool(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return undefined
}

function leftover(source: Record<string, unknown>, handled: string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!handled.includes(key)) rest[key] = value
  }
  return rest
}

export interface ParsedParams {
  values: FormValues
  advanced: Record<string, unknown>
}

/** action_parameters (API) → giá trị form + phần dư đưa vào JSON nâng cao. */
export function paramsToFields(kind: RuleKind, params?: Record<string, unknown>): ParsedParams {
  const source = asRecord(params)
  const values: FormValues = {}
  const advanced = leftover(source, HANDLED_TOP_KEYS[kind])

  const keepNested = (key: string) => {
    const nested = asRecord(source[key])
    const rest = leftover(nested, HANDLED_NESTED_KEYS[key] ?? [])
    if (Object.keys(rest).length > 0) advanced[key] = rest
  }

  if (kind === 'cache') {
    values.cache = boolToTri(source.cache)

    const edgeTtl = asRecord(source.edge_ttl)
    values.edge_ttl_mode = typeof edgeTtl.mode === 'string' ? edgeTtl.mode : ''
    values.edge_ttl_default = typeof edgeTtl.default === 'number' ? edgeTtl.default : undefined
    keepNested('edge_ttl')

    const browserTtl = asRecord(source.browser_ttl)
    values.browser_ttl_mode = typeof browserTtl.mode === 'string' ? browserTtl.mode : ''
    values.browser_ttl_default = typeof browserTtl.default === 'number' ? browserTtl.default : undefined
    keepNested('browser_ttl')

    const cacheKey = asRecord(source.cache_key)
    values.cache_key_ignore_query_strings_order = boolToTri(cacheKey.ignore_query_strings_order)
    values.cache_key_cache_deception_armor = boolToTri(cacheKey.cache_deception_armor)
    values.cache_key_cache_by_device_type = boolToTri(cacheKey.cache_by_device_type)
    keepNested('cache_key')

    const cacheReserve = asRecord(source.cache_reserve)
    values.cache_reserve_eligible = boolToTri(cacheReserve.eligible)
    values.cache_reserve_minimum_file_size =
      typeof cacheReserve.minimum_file_size === 'number' ? cacheReserve.minimum_file_size : undefined
    keepNested('cache_reserve')

    const serveStale = asRecord(source.serve_stale)
    values.serve_stale_disable_stale_while_updating = boolToTri(serveStale.disable_stale_while_updating)
    keepNested('serve_stale')

    values.respect_strong_etags = boolToTri(source.respect_strong_etags)
    values.origin_error_page_passthru = boolToTri(source.origin_error_page_passthru)
    values.origin_cache_control = boolToTri(source.origin_cache_control)
    values.read_timeout = typeof source.read_timeout === 'number' ? source.read_timeout : undefined
    values.additional_cacheable_ports = Array.isArray(source.additional_cacheable_ports)
      ? (source.additional_cacheable_ports as number[]).join(', ')
      : ''
    return { values, advanced }
  }

  if (kind === 'configuration') {
    for (const field of CONFIGURATION_FIELDS) {
      const raw = source[field.name]
      values[field.name] =
        field.type === 'bool3' ? boolToTri(raw) : typeof raw === 'string' ? raw : ''
    }
    return { values, advanced }
  }

  const fromValue = asRecord(source.from_value)
  const targetUrl = asRecord(fromValue.target_url)
  const isDynamic = typeof targetUrl.expression === 'string'
  values.redirect_kind = isDynamic ? 'dynamic' : 'static'
  values.target_url_value = typeof targetUrl.value === 'string' ? targetUrl.value : ''
  values.target_url_expression = isDynamic ? (targetUrl.expression as string) : ''
  values.status_code = typeof fromValue.status_code === 'number' ? String(fromValue.status_code) : ''
  values.preserve_query_string = boolToTri(fromValue.preserve_query_string)
  keepNested('from_value')
  return { values, advanced }
}

/** Nhãn ngắn cho từng thiết lập, dùng ở cột Action của bảng (giống dashboard CF). */
const CACHE_SUMMARY_LABELS: Record<string, string> = {
  edge_ttl: 'Edge TTL',
  browser_ttl: 'Browser TTL',
  cache_key: 'Cache key',
  cache_reserve: 'Cache Reserve',
  serve_stale: 'Serve stale',
  respect_strong_etags: 'Respect strong ETags',
  origin_error_page_passthru: 'Origin error pages',
  origin_cache_control: 'Origin Cache Control',
  read_timeout: 'Read timeout',
  additional_cacheable_ports: 'Cacheable ports',
  vary: 'Vary',
}

function optionLabel(fieldName: string, value: unknown): string | undefined {
  const field = CONFIGURATION_FIELDS.find((f) => f.name === fieldName)
  return field?.options?.find((o) => o.value === value)?.label
}

/**
 * Tóm tắt action parameters thành danh sách nhãn ngắn để hiển thị trong bảng,
 * thay vì đổ nguyên JSON như trước.
 */
export function summarizeActionParameters(
  kind: RuleKind,
  params?: Record<string, unknown>,
): string[] {
  const source = asRecord(params)
  if (Object.keys(source).length === 0) return []

  if (kind === 'cache') {
    const labels: string[] = []
    if (source.cache === true) labels.push('Eligible for cache')
    if (source.cache === false) labels.push('Bypass cache')
    for (const [key, label] of Object.entries(CACHE_SUMMARY_LABELS)) {
      if (source[key] !== undefined) labels.push(label)
    }
    return labels.sort((a, b) => a.localeCompare(b))
  }

  if (kind === 'configuration') {
    return CONFIGURATION_FIELDS.filter((field) => source[field.name] !== undefined)
      .map((field) => {
        const value = source[field.name]
        if (field.type === 'bool3') return `${field.label}: ${value === true ? 'On' : 'Off'}`
        return `${field.label}: ${optionLabel(field.name, value) ?? String(value)}`
      })
      .sort((a, b) => a.localeCompare(b))
  }

  const fromValue = asRecord(source.from_value)
  const targetUrl = asRecord(fromValue.target_url)
  const target =
    typeof targetUrl.value === 'string'
      ? targetUrl.value
      : typeof targetUrl.expression === 'string'
        ? targetUrl.expression
        : ''
  const labels: string[] = []
  if (fromValue.status_code) labels.push(`${fromValue.status_code} → ${target}`)
  else if (target) labels.push(target)
  if (fromValue.preserve_query_string === true) labels.push('Preserve query string')
  return labels
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined && value !== null && value !== '') target[key] = value
}

function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined
}

/** Giá trị form + JSON nâng cao → action_parameters đúng chuẩn API. */
export function fieldsToParams(
  kind: RuleKind,
  values: FormValues,
  advanced: Record<string, unknown> = {},
): Record<string, unknown> | undefined {
  const params: Record<string, unknown> = { ...advanced }

  if (kind === 'cache') {
    const cache = triToBool(values.cache)
    if (cache !== undefined) params.cache = cache

    const edgeTtl: Record<string, unknown> = { ...asRecord(advanced.edge_ttl) }
    setIfDefined(edgeTtl, 'mode', values.edge_ttl_mode)
    if (values.edge_ttl_mode === 'override_origin' && values.edge_ttl_default !== undefined) {
      edgeTtl.default = Number(values.edge_ttl_default)
    }
    const edge = pruneEmpty(edgeTtl)
    if (edge) params.edge_ttl = edge
    else delete params.edge_ttl

    const browserTtl: Record<string, unknown> = { ...asRecord(advanced.browser_ttl) }
    setIfDefined(browserTtl, 'mode', values.browser_ttl_mode)
    if (values.browser_ttl_mode === 'override_origin' && values.browser_ttl_default !== undefined) {
      browserTtl.default = Number(values.browser_ttl_default)
    }
    const browser = pruneEmpty(browserTtl)
    if (browser) params.browser_ttl = browser
    else delete params.browser_ttl

    const cacheKey: Record<string, unknown> = { ...asRecord(advanced.cache_key) }
    for (const [formName, apiName] of [
      ['cache_key_ignore_query_strings_order', 'ignore_query_strings_order'],
      ['cache_key_cache_deception_armor', 'cache_deception_armor'],
      ['cache_key_cache_by_device_type', 'cache_by_device_type'],
    ] as const) {
      const bool = triToBool(values[formName])
      if (bool !== undefined) cacheKey[apiName] = bool
    }
    const key = pruneEmpty(cacheKey)
    if (key) params.cache_key = key
    else delete params.cache_key

    const cacheReserve: Record<string, unknown> = { ...asRecord(advanced.cache_reserve) }
    const eligible = triToBool(values.cache_reserve_eligible)
    if (eligible !== undefined) cacheReserve.eligible = eligible
    if (eligible && values.cache_reserve_minimum_file_size !== undefined) {
      cacheReserve.minimum_file_size = Number(values.cache_reserve_minimum_file_size)
    }
    const reserve = pruneEmpty(cacheReserve)
    if (reserve) params.cache_reserve = reserve
    else delete params.cache_reserve

    const serveStale: Record<string, unknown> = { ...asRecord(advanced.serve_stale) }
    const disableStale = triToBool(values.serve_stale_disable_stale_while_updating)
    if (disableStale !== undefined) serveStale.disable_stale_while_updating = disableStale
    const stale = pruneEmpty(serveStale)
    if (stale) params.serve_stale = stale
    else delete params.serve_stale

    for (const name of ['respect_strong_etags', 'origin_error_page_passthru', 'origin_cache_control'] as const) {
      const bool = triToBool(values[name])
      if (bool !== undefined) params[name] = bool
      else delete params[name]
    }

    if (values.read_timeout !== undefined && values.read_timeout !== null && values.read_timeout !== '') {
      params.read_timeout = Number(values.read_timeout)
    } else {
      delete params.read_timeout
    }

    const ports = String(values.additional_cacheable_ports ?? '')
      .split(',')
      .map((p) => Number(p.trim()))
      .filter((p) => Number.isInteger(p) && p > 0)
    if (ports.length > 0) params.additional_cacheable_ports = ports
    else delete params.additional_cacheable_ports

    return pruneEmpty(params)
  }

  if (kind === 'configuration') {
    for (const field of CONFIGURATION_FIELDS) {
      if (field.type === 'bool3') {
        const bool = triToBool(values[field.name])
        if (bool !== undefined) params[field.name] = bool
        else delete params[field.name]
      } else {
        const raw = values[field.name]
        if (typeof raw === 'string' && raw !== '') params[field.name] = raw
        else delete params[field.name]
      }
    }
    return pruneEmpty(params)
  }

  const fromValue: Record<string, unknown> = { ...asRecord(advanced.from_value) }
  if (values.redirect_kind === 'dynamic') {
    if (values.target_url_expression) fromValue.target_url = { expression: values.target_url_expression }
  } else if (values.target_url_value) {
    fromValue.target_url = { value: values.target_url_value }
  }
  if (values.status_code) fromValue.status_code = Number(values.status_code)
  const preserve = triToBool(values.preserve_query_string)
  if (preserve !== undefined) fromValue.preserve_query_string = preserve

  const from = pruneEmpty(fromValue)
  if (from) params.from_value = from
  else delete params.from_value

  return pruneEmpty(params)
}
