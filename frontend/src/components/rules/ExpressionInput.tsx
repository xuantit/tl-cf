import { useState } from 'react'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Radio, Select, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

import {
  buildExpression,
  createRow,
  EXPRESSION_FIELDS,
  fieldByName,
  MATCH_ALL_EXPRESSION,
  operatorsForField,
  type ExpressionRow,
} from './expressionBuilder'

const { Text } = Typography

const MAX_LENGTH = 4000

type Mode = 'all' | 'builder' | 'editor'

/**
 * Ô nhập biểu thức theo phong cách dashboard Cloudflare:
 *  - "All incoming requests" cho rule áp dụng toàn zone
 *  - Expression Builder: Field / Operator / Value + And-Or
 *  - Expression Preview kèm bộ đếm ký tự, bấm "Edit expression" để sửa tay
 *
 * Dùng được trực tiếp trong <Form.Item> nhờ hợp đồng value/onChange.
 */
export default function ExpressionInput({
  value = '',
  onChange,
}: {
  value?: string
  onChange?: (value: string) => void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<ExpressionRow[]>([createRow()])
  // Lựa chọn của người dùng; khi chưa chọn thì suy ra từ giá trị hiện có —
  // rule có sẵn (biểu thức không dựng ngược được) mở thẳng chế độ sửa tay.
  const [manualMode, setManualMode] = useState<Mode | null>(null)
  const mode: Mode =
    value === MATCH_ALL_EXPRESSION ? 'all' : (manualMode ?? (value ? 'editor' : 'builder'))

  const emit = (next: string) => onChange?.(next)

  const updateRows = (next: ExpressionRow[]) => {
    setRows(next)
    emit(buildExpression(next))
  }

  const patchRow = (id: string, patch: Partial<ExpressionRow>) => {
    updateRows(
      rows.map((row) => {
        if (row.id !== id) return row
        const merged = { ...row, ...patch }
        // Đổi field có thể làm toán tử hiện tại không còn hợp lệ.
        if (patch.field && !operatorsForField(merged.field).some((o) => o.value === merged.operator)) {
          merged.operator = 'eq'
        }
        return merged
      }),
    )
  }

  const changeMode = (next: Mode) => {
    setManualMode(next)
    if (next === 'all') emit(MATCH_ALL_EXPRESSION)
    else if (next === 'builder') emit(buildExpression(rows))
  }

  return (
    <div className="flex flex-col gap-2">
      <Radio.Group
        value={mode === 'all' ? 'all' : 'custom'}
        onChange={(e) => changeMode(e.target.value === 'all' ? 'all' : 'builder')}
        options={[
          { value: 'custom', label: t('Custom filter expression') },
          { value: 'all', label: t('All incoming requests') },
        ]}
      />

      {mode === 'builder' && (
        <div className="flex flex-col gap-1.5">
          {rows.map((row, index) => {
            const field = fieldByName(row.field)
            const operator = operatorsForField(row.field).find((o) => o.value === row.operator)
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-1.5">
                {index > 0 && (
                  <Select
                    size="small"
                    value={row.join}
                    style={{ width: 72 }}
                    onChange={(join) => patchRow(row.id, { join })}
                    options={[
                      { value: 'and', label: t('And') },
                      { value: 'or', label: t('Or') },
                    ]}
                  />
                )}
                <Select
                  size="small"
                  showSearch
                  value={row.field}
                  style={{ width: 168 }}
                  onChange={(next) => patchRow(row.id, { field: next })}
                  optionFilterProp="label"
                  options={EXPRESSION_FIELDS.map((f) => ({ value: f.value, label: t(f.label) }))}
                />
                <Select
                  size="small"
                  value={row.operator}
                  style={{ width: 168 }}
                  onChange={(next) => patchRow(row.id, { operator: next })}
                  options={operatorsForField(row.field).map((o) => ({
                    value: o.value,
                    label: t(o.label),
                  }))}
                />
                {field?.type === 'boolean' ? (
                  <Select
                    size="small"
                    value={row.value || 'true'}
                    style={{ width: 120 }}
                    onChange={(next) => patchRow(row.id, { value: next })}
                    options={[
                      { value: 'true', label: t('On') },
                      { value: 'false', label: t('Off') },
                    ]}
                  />
                ) : (
                  <Input
                    size="small"
                    style={{ flex: 1, minWidth: 180 }}
                    value={row.value}
                    placeholder={
                      operator?.list
                        ? t('Multiple values separated by commas')
                        : (field?.placeholder ?? t('Value'))
                    }
                    onChange={(e) => patchRow(row.id, { value: e.target.value })}
                  />
                )}
                <Button
                  size="small"
                  type="text"
                  icon={<DeleteOutlined />}
                  disabled={rows.length === 1}
                  onClick={() => updateRows(rows.filter((r) => r.id !== row.id))}
                />
              </div>
            )
          })}
          <div className="flex gap-1.5">
            <Button size="small" icon={<PlusOutlined />} onClick={() => updateRows([...rows, createRow('and')])}>
              {t('And')}
            </Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => updateRows([...rows, createRow('or')])}>
              {t('Or')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'editor' && (
        <Input.TextArea
          rows={3}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(e) => emit(e.target.value)}
          placeholder='(http.request.uri.path eq "/old")'
        />
      )}

      {mode !== 'all' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('Expression Preview')}
            </Text>
            <a
              className="ml-auto text-[12px]"
              onClick={() => changeMode(mode === 'editor' ? 'builder' : 'editor')}
            >
              {mode === 'editor' ? t('Use expression builder') : t('Edit expression')}
            </a>
          </div>
          <code className="block overflow-x-auto rounded-[4px] bg-bg-side px-2 py-1.5 text-[12px] break-all">
            {value || t('(empty)')}
          </code>
          <Text type={value.length > MAX_LENGTH ? 'danger' : 'secondary'} style={{ fontSize: 11 }}>
            {value.length} / {MAX_LENGTH} {t('characters')}
          </Text>
        </div>
      )}
    </div>
  )
}
