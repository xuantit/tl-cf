import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DetailPanel } from './DetailPanel'
import {
  Banner,
  Dot,
  EmptyState,
  Kbd,
  KvRow,
  Lbl,
  SectionHeader,
  SkeletonLine,
  StatStrip,
  Tag,
} from './index'

describe('ui primitives', () => {
  it('keeps closed panel fields mounted but removes them from keyboard interaction', () => {
    const { container, rerender } = render(
      <DetailPanel open={false} title="Edit" onClose={() => {}}><input aria-label="Value" defaultValue="saved" /></DetailPanel>,
    )
    expect(container.querySelector('aside')).toHaveAttribute('inert')
    expect(container.querySelector('input')).toHaveValue('saved')
    rerender(<DetailPanel open title="Edit" onClose={() => {}}><input aria-label="Value" defaultValue="saved" /></DetailPanel>)
    expect(container.querySelector('aside')).not.toHaveAttribute('inert')
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('saved')
  })

  it('Tag renders variants with matching classes', () => {
    const { container } = render(
      <>
        <Tag>plain</Tag>
        <Tag variant="acc">acc</Tag>
        <Tag variant="ok">ok</Tag>
        <Tag variant="err">err</Tag>
      </>,
    )
    const tags = container.querySelectorAll('span')
    expect(tags[0].className).toContain('bg-bg-hover')
    expect(tags[1].className).toContain('bg-accent-soft')
    expect(tags[2].className).toContain('text-ok')
    expect(tags[3].className).toContain('text-danger')
    expect(screen.getByText('plain')).toBeInTheDocument()
  })

  it('Dot renders status color class', () => {
    const { container } = render(<Dot status="warn" />)
    expect(container.firstElementChild!.className).toContain('bg-warn')
  })

  it('Kbd renders a kbd element', () => {
    render(<Kbd>⌘K</Kbd>)
    expect(screen.getByText('⌘K').tagName).toBe('KBD')
  })

  it('Lbl renders uppercase mono label', () => {
    render(<Lbl>Section</Lbl>)
    expect(screen.getByText('Section').className).toContain('uppercase')
  })

  it('KvRow renders key and value', () => {
    render(<KvRow k="SSL mode" v="full_strict" />)
    expect(screen.getByText('SSL mode')).toBeInTheDocument()
    expect(screen.getByText('full_strict')).toBeInTheDocument()
  })

  it('SectionHeader renders title and actions', () => {
    render(<SectionHeader title="DNS Records" actions={<button>Add</button>} />)
    expect(screen.getByText('DNS Records')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('StatStrip renders items with delta tones', () => {
    render(
      <StatStrip
        items={[
          { value: '128', label: 'Domains', delta: '+4', deltaTone: 'up' },
          { value: '3', label: 'Errors', delta: '-1', deltaTone: 'down' },
        ]}
      />,
    )
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('+4').className).toContain('text-ok')
    expect(screen.getByText('-1').className).toContain('text-danger')
  })

  it('EmptyState renders title and desc', () => {
    render(<EmptyState icon="∅" title="No domains" desc="Add your first zone" />)
    expect(screen.getByText('No domains')).toBeInTheDocument()
    expect(screen.getByText('Add your first zone')).toBeInTheDocument()
  })

  it('SkeletonLine applies shimmer animation and width', () => {
    const { container } = render(<SkeletonLine width={120} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('animate-shimmer')
    expect(el.style.width).toBe('120px')
  })

  it('Banner renders tone background and actions', () => {
    render(
      <Banner tone="err" actions={<button>Retry</button>}>
        Rate limited
      </Banner>,
    )
    expect(screen.getByText('Rate limited')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
