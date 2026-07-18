import type { ReactNode } from 'react'
import { Typography } from 'antd'

const { Title, Text } = Typography

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Primary/secondary actions rendered right-aligned on the same row (Vercel pattern). */
  actions?: ReactNode
}

/** SaaS-style page header: title + description left, actions right, wraps on mobile. */
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div
      className="page-header"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {title}
        </Title>
        {description && <Text type="secondary">{description}</Text>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
