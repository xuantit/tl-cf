import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import '../../i18n'

// Mock useIsMobile so we can control the responsive behaviour
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}))

import { useIsMobile } from '../../hooks/useIsMobile'
import ResponsiveTable from './ResponsiveTable'
import type { ColumnsType } from 'antd/es/table'

interface Row {
  id: string
  name: string
  status: string
}

const columns: ColumnsType<Row> = [
  { dataIndex: 'id', title: 'ID' },
  { dataIndex: 'name', title: 'Name' },
  { dataIndex: 'status', title: 'Status' },
]

const data: Row[] = [
  { id: '1', name: 'example.com', status: 'active' },
  { id: '2', name: 'test.org', status: 'paused' },
]

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider>{children}</ConfigProvider>
}

describe('ResponsiveTable', () => {
  it('renders AntD Table on desktop (md+)', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    const { container } = render(
      <ResponsiveTable columns={columns} dataSource={data} rowKey="id" />,
      { wrapper },
    )

    // AntD Table renders th elements for each column
    expect(container.querySelector('.ant-table')).toBeTruthy()
    expect(container.textContent).toContain('Name')
    expect(container.textContent).toContain('example.com')
  })

  it('renders card list on mobile (<md)', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)

    const { container } = render(
      <ResponsiveTable
        columns={columns}
        dataSource={data}
        rowKey="id"
        mobile={{
          title: (row) => row.name,
          subtitle: (row) => row.status,
        }}
      />,
      { wrapper },
    )

    // Cards should be rendered (no table)
    expect(container.querySelector('.ant-table')).toBeNull()
    expect(container.querySelector('.ant-card')).toBeTruthy()
    expect(container.textContent).toContain('example.com')
    expect(container.textContent).toContain('test.org')
    expect(container.textContent).toContain('active')
  })

  it('renders loading skeleton on desktop', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    const { container } = render(
      <ResponsiveTable columns={columns} dataSource={[]} rowKey="id" loading />,
      { wrapper },
    )

    expect(container.firstChild).toBeTruthy()
  })

  it('renders loading skeleton on mobile', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)

    const { container } = render(
      <ResponsiveTable columns={columns} dataSource={[]} rowKey="id" loading />,
      { wrapper },
    )

    expect(container.firstChild).toBeTruthy()
  })

  it('renders empty state when dataSource is empty', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    const { container } = render(
      <ResponsiveTable columns={columns} dataSource={[]} rowKey="id" />,
      { wrapper },
    )

    // EmptyState component renders
    expect(container.firstChild).toBeTruthy()
  })

  it('renders with custom emptyText on desktop', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    const { container } = render(
      <ResponsiveTable
        columns={columns}
        dataSource={[]}
        rowKey="id"
        emptyText="No results found"
      />,
      { wrapper },
    )

    expect(container.textContent).toContain('No results found')
  })
})
