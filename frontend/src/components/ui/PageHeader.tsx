import type { ReactNode, ReactElement } from 'react'
import { Typography, Breadcrumb } from 'antd'

const { Title, Text } = Typography

interface PageHeaderProps {
  /** Page title */
  title: ReactNode
  /** Subtitle / description (backward-compat alias: `description`) */
  subtitle?: ReactNode
  /** @deprecated Use `subtitle` instead */
  description?: ReactNode
  /** Breadcrumb items rendered above the title */
  breadcrumb?: ReactNode
  /** Actions slot — rendered right-aligned on md+, below title on mobile */
  actions?: ReactNode
  /** Additional Tailwind classes */
  className?: string
}

/** SaaS-style page header: title + subtitle left, actions right.
 * On mobile, actions wrap below the title block.
 *
 * Backward-compatible with the previous `PageHeader` (`title`, `description`, `actions`).
 *
 * @example
 * <PageHeader
 *   breadcrumb={<Breadcrumb items={[{ title: 'Home' }, { title: 'Domains' }]} />}
 *   title="Domains"
 *   subtitle="Manage your Cloudflare zones"
 *   actions={<Button type="primary">Add Domain</Button>}
 * />
 */
export default function PageHeader({
  title,
  subtitle,
  description,
  breadcrumb,
  actions,
  className = '',
}: PageHeaderProps) {
  const sub = subtitle ?? description

  return (
    <div className={`page-header mb-6 ${className}`}>
      {breadcrumb && (
        <div className="mb-2">
          {typeof breadcrumb === 'object' && (breadcrumb as ReactElement).type === Breadcrumb
            ? breadcrumb
            : <Breadcrumb>{breadcrumb}</Breadcrumb>}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Title
            level={2}
            className="!mb-1 !font-bold"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
          </Title>
          {sub && <Text type="secondary">{sub}</Text>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
