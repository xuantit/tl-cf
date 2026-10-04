import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/antdApp', () => ({ message: { error: vi.fn() } }))

import '../../i18n'
import { message } from '../../lib/antdApp'
import { DetailPanel } from '../ui/DetailPanel'
import PageRuleFormModal from './PageRuleFormModal'
import type { PageRuleInput } from './pageRulePresets'

type FormProps = ComponentProps<typeof PageRuleFormModal>

function panel(props: FormProps, key = 'rule-1', open = true) {
  return (
    <DetailPanel open={open} title={props.initialValue ? 'Edit Page Rule' : 'Add Page Rule'} onClose={props.onCancel}>
      {open && <PageRuleFormModal key={key} {...props} />}
    </DetailPanel>
  )
}

function rule(actions: PageRuleInput['actions']): PageRuleInput {
  return {
    status: 'disabled',
    targets: [{ target: 'url', constraint: { operator: 'matches', value: 'www.example.com/*' } }],
    actions,
  }
}

async function selectOption(select: HTMLElement, label: string) {
  fireEvent.mouseDown(select)
  fireEvent.click(await screen.findByText(label, { exact: true }))
}

describe('PageRuleFormModal inside DetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an inline edit form with delete/cancel and preserves submitted fields', async () => {
    const onSubmit = vi.fn()
    const onDelete = vi.fn()
    const onCancel = vi.fn()
    const initialValue: PageRuleInput = {
      ...rule([
        { id: 'cache_level', value: 'cache_everything' },
        { id: 'edge_cache_ttl', value: 3600 },
        { id: 'automatic_https_rewrites', value: 'off' },
        { id: 'ssl', value: 'strict' },
        { id: 'security_level', value: 'high' },
        { id: 'always_use_https', value: 'stale value must be stripped' },
        { id: 'custom_setting', value: 'keep me' },
      ]),
      priority: 7,
    }
    render(panel({ zoneName: 'example.com', initialValue, onSubmit, onDelete, onCancel }))

    const aside = screen.getByRole('complementary')
    const url = within(aside).getByLabelText('URL')
    expect(url).toHaveValue('www.example.com/*')
    expect(aside).toContainElement(url.closest('form'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.ant-modal-root')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Load a template')).not.toBeInTheDocument()

    fireEvent.click(within(aside).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    fireEvent.click(within(aside).getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(url, { target: { value: 'example.com/assets/*' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7200' } })
    await selectOption(screen.getByLabelText('Status'), 'Active')
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      priority: 7,
      status: 'active',
      targets: [{ target: 'url', constraint: { operator: 'matches', value: 'example.com/assets/*' } }],
      actions: [
        { id: 'cache_level', value: 'cache_everything' },
        { id: 'edge_cache_ttl', value: 7200 },
        { id: 'automatic_https_rewrites', value: 'off' },
        { id: 'ssl', value: 'strict' },
        { id: 'security_level', value: 'high' },
        { id: 'always_use_https' },
        { id: 'custom_setting', value: 'keep me' },
      ],
    })
  })

  it('preserves the nested forwarding status code and edited destination', async () => {
    const onSubmit = vi.fn()
    const initialValue = rule([{ id: 'forwarding_url', value: { status_code: 302, url: 'https://example.com/$1' } }])
    render(panel({ initialValue, onSubmit, onCancel: vi.fn() }))

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('https://www.example.com/$1'), {
      target: { value: 'https://other.example/$1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      ...initialValue,
      actions: [{ id: 'forwarding_url', value: { status_code: 302, url: 'https://other.example/$1' } }],
    }))
  })

  it('keeps URL and at-least-one-setting validation for new rules', async () => {
    const onSubmit = vi.fn()
    render(panel({ zoneName: 'example.com', onSubmit, onCancel: vi.fn(), onDelete: vi.fn() }, 'new'))

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveValue('www.example.com/*')
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and Deploy' }))
    expect(await screen.findByText('URL pattern is required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'example.com/*' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and Deploy' }))
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('At least one action is required'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects forwarding combined with other settings and allows removing the extra setting', async () => {
    const onSubmit = vi.fn()
    const redirect = { id: 'forwarding_url', value: { status_code: 301, url: 'https://example.com/$1' } }
    const initialValue = rule([redirect, { id: 'always_use_https' }])
    render(panel({ initialValue, onSubmit, onCancel: vi.fn() }))

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('forwarding_url cannot be combined with other actions'))
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove setting' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ ...initialValue, actions: [redirect] }))
  })

  it('requires a forwarding destination before submitting', async () => {
    const onSubmit = vi.fn()
    render(panel({
      initialValue: rule([{ id: 'forwarding_url', value: { status_code: 301, url: '' } }]),
      onSubmit,
      onCancel: vi.fn(),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(await screen.findByText('Required')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('loads templates, resets custom fields, and submits a different template without stale redirect values', async () => {
    const onSubmit = vi.fn()
    render(panel({ zoneName: 'example.com', onSubmit, onCancel: vi.fn() }, 'new'))

    await selectOption(screen.getByLabelText('Load a template'), 'Redirect from WWW to root')
    expect(screen.getByPlaceholderText('https://www.example.com/$1')).toHaveValue('https://example.com/$1')
    await selectOption(screen.getByLabelText('Load a template'), 'Custom')
    expect(screen.getByLabelText('URL')).toHaveValue('www.example.com/*')
    expect(screen.queryByRole('button', { name: 'Remove setting' })).not.toBeInTheDocument()

    await selectOption(screen.getByLabelText('Load a template'), 'Cache everything')
    expect(screen.queryByPlaceholderText('https://www.example.com/$1')).not.toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveValue('*example.com/*')
    fireEvent.click(screen.getByRole('button', { name: 'Save and Deploy' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      status: 'active',
      targets: [{ target: 'url', constraint: { operator: 'matches', value: '*example.com/*' } }],
      actions: [{ id: 'cache_level', value: 'cache_everything' }],
    }))
  })

  it('adds settings and resets their values when the action changes', async () => {
    const onSubmit = vi.fn()
    render(panel({ zoneName: 'example.com', onSubmit, onCancel: vi.fn() }, 'new'))

    fireEvent.click(screen.getByRole('button', { name: /Add a Setting/ }))
    await selectOption(screen.getByLabelText('Pick a Setting'), 'Forwarding URL')
    expect(screen.getByPlaceholderText('https://www.example.com/$1')).toHaveValue('')

    await selectOption(screen.getByLabelText('Pick a Setting'), 'Edge Cache TTL')
    expect(screen.queryByPlaceholderText('https://www.example.com/$1')).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toHaveValue('86400')
    fireEvent.click(screen.getByRole('button', { name: 'Save and Deploy' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      status: 'active',
      targets: [{ target: 'url', constraint: { operator: 'matches', value: 'www.example.com/*' } }],
      actions: [{ id: 'edge_cache_ttl', value: 86400 }],
    }))
  })

  it('resets fields when the caller changes the rule key or closes and reopens creation', () => {
    const props = { zoneName: 'example.com', onSubmit: vi.fn(), onCancel: vi.fn() }
    const { rerender } = render(panel({ ...props, initialValue: rule([{ id: 'always_use_https' }]) }))
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'unsaved.example/*' } })

    rerender(panel({
      ...props,
      initialValue: { ...rule([{ id: 'edge_cache_ttl', value: 120 }]), targets: [{ target: 'url', constraint: { operator: 'matches', value: 'second.example/*' } }] },
    }, 'rule-2'))
    expect(screen.getByLabelText('URL')).toHaveValue('second.example/*')
    expect(screen.getByRole('spinbutton')).toHaveValue('120')

    rerender(panel(props, 'new'))
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'unsaved-new.example/*' } })
    rerender(panel(props, 'new', false))
    rerender(panel(props, 'new'))
    expect(screen.getByLabelText('URL')).toHaveValue('www.example.com/*')
    expect(screen.queryByRole('button', { name: 'Remove setting' })).not.toBeInTheDocument()
  })

  it('disables deletion while saving', () => {
    const onDelete = vi.fn()
    render(panel({
      initialValue: rule([{ id: 'always_use_https' }]),
      loading: true,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onDelete,
    }))

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toBeDisabled()
    fireEvent.click(deleteButton)
    expect(onDelete).not.toHaveBeenCalled()
  })
})