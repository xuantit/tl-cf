import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Tag, Button, Input, Space, Typography, Modal, Form, Popconfirm, theme, Select, Alert } from 'antd'
import { isAxiosError } from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SearchOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, SwapOutlined, AppstoreAddOutlined, TagsOutlined, CopyOutlined } from '@ant-design/icons'
import { api, apiErrorDetail } from '../services/api'
import { message } from '../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BulkProgressModal from '../components/BulkProgressModal'
import BulkAddDomainsModal, { CreateZonesDone } from '../components/domains/BulkAddDomainsModal'
import BulkDnsReplaceModal from '../components/domains/BulkDnsReplaceModal'
import { CopyConfigPanel, CloneDomainPanel } from '../components/domains/CopyClonePanels'
import ConfirmDestructive from '../components/ConfirmDestructive'
import PageHeader from '../components/PageHeader'
import { useDomainFilters } from '../hooks/useDomainFilters'
import type { Zone } from '../types/domain'

const { Text } = Typography

interface TagAssignmentFailure {
  zoneId: string
  name: string
  detail: string
}

export default function Domains() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token } = theme.useToken()
  const [searchParams, setSearchParams] = useSearchParams()
  // Sidebar "Find" hands off its query via ?q=
  const searchText = searchParams.get('q') || ''
  const tagFilter = (searchParams.get('tag') || '').split(',').filter(Boolean)
  const requestedTab = searchParams.get('tab')
  const tab = requestedTab === 'active' || requestedTab === 'pending' ? requestedTab : 'all'
  const [tagsToAssign, setTagsToAssign] = useState<string[]>([])
  const [tagFailures, setTagFailures] = useState<TagAssignmentFailure[]>([])
  const [form] = Form.useForm<{ name: string }>()

  // Modal & job state live in the URL so F5 / shared links restore the view
  const activeModal = searchParams.get('modal')
  const jobId = searchParams.get('job')
  const selectedRowKeys = [...new Set(searchParams.getAll('zone'))]
  const sourceZoneId = searchParams.get('source')
  const deleteZoneId = searchParams.get('deleteZone')

  const setParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const setSelectedRowKeys = (zoneIds: string[]) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('zone')
        zoneIds.forEach((zoneId) => next.append('zone', zoneId))
        return next
      },
      { replace: true },
    )
  }

  const setTagFilter = (tags: string[]) => setParams({ tag: tags.length ? tags.join(',') : null })

  const { data: domains = [], isLoading, isError, error, refetch } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      try {
        const res = await api.get<Zone[]>('/domains')
        return res.data
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 400 && apiErrorDetail(error)?.includes('credentials')) {
          message.warning(t('Please add a Cloudflare account first'))
          navigate('/accounts')
        }
        throw error
      }
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/domains', { name })
      return res.data
    },
    onSuccess: () => {
      message.success(t('Domain added successfully'))
      setParams({ modal: null })
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not add domain'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      await api.delete(`/domains/${zoneId}`)
    },
    onSuccess: (_, zoneId) => {
      message.success(t('Domain deleted'))
      // Clear the confirmation and only the deleted selection in one URL update.
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete('modal')
        next.delete('deleteZone')
        const remaining = next.getAll('zone').filter((id) => id !== zoneId)
        next.delete('zone')
        remaining.forEach((id) => next.append('zone', id))
        return next
      }, { replace: true })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not delete domain'))
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async (payload: { action: 'purge' | 'delete'; zoneIds: string[] }) => {
      const res = await api.post('/domains/bulk', payload)
      return res.data as { jobId: string }
    },
    onSuccess: (data) => {
      setParams({ job: data.jobId, modal: null, deleteZone: null })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Bulk operation failed'))
    },
  })

  const assignTagsMutation = useMutation({
    mutationFn: async ({ zoneIds, tags }: { zoneIds: string[]; tags: string[] }) => {
      const assigned: Array<{ zoneId: string; tags: string[] }> = []
      const failed: TagAssignmentFailure[] = []
      // PUT replaces tags. Merge separately per known zone, never treat an unknown
      // URL selection as an empty tag list. Await every result before allowing retry.
      for (const zoneId of zoneIds) {
        const zone = domains.find((domain) => domain.id === zoneId)
        if (!zone) {
          failed.push({ zoneId, name: zoneId, detail: t('Domain is not available in the current account') })
          continue
        }
        const merged = [...new Set([...(zone.tags || []), ...tags])]
        try {
          await api.put(`/domains/${zoneId}/tags`, { tags: merged })
          assigned.push({ zoneId, tags: merged })
        } catch (error) {
          failed.push({ zoneId, name: zone.name, detail: apiErrorDetail(error) || t('Could not update tags') })
        }
      }
      return { assigned, failed }
    },
    onSuccess: ({ assigned, failed }) => {
      queryClient.setQueryData<Zone[]>(['domains'], (previous) => previous?.map((zone) => {
        const result = assigned.find((item) => item.zoneId === zone.id)
        return result ? { ...zone, tags: result.tags } : zone
      }))
      queryClient.invalidateQueries({ queryKey: ['domains'] })
      setTagFailures(failed)
      if (failed.length > 0) {
        // Keep the form and failed targets; retry must not re-submit successful zones.
        setSelectedRowKeys(failed.map((item) => item.zoneId))
        message.error(t('Could not update tags'))
        return
      }
      message.success(t('Tags updated'))
      setTagsToAssign([])
      setParams({ modal: null })
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not update tags')),
  })

  const busy = deleteMutation.isPending || bulkMutation.isPending || assignTagsMutation.isPending
  const normalizedTags = [...new Set(tagsToAssign.map((tag) => tag.trim()).filter(Boolean))]
  const deleteIds = deleteZoneId ? [deleteZoneId] : selectedRowKeys
  const deleteTargets = domains.filter((zone) => deleteIds.includes(zone.id))
  const canDelete = !isLoading && !isError && deleteIds.length > 0 && deleteTargets.length === deleteIds.length
  const deletionError = deleteZoneId ? deleteMutation.error : bulkMutation.error
  const cloneSource = activeModal === 'clone' ? domains.find((zone) => zone.id === sourceZoneId) : undefined

  const closeConfigPanel = () => setParams({ modal: null, source: null })
  const onConfigJobCreated = (id: string) => setParams({ modal: null, source: null, job: id })

  const closeTags = () => {
    if (assignTagsMutation.isPending) return
    setParams({ modal: null })
    setTagsToAssign([])
    setTagFailures([])
  }

  const closeBulkJob = () => {
    // Remove job + selected zones in a single update; two sequential setSearchParams calls are
    // unreliable (react-router ref not updated between calls) and would leave the modal open.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('job')
        next.delete('zone')
        return next
      },
      { replace: true },
    )
    queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  const { filtered: filteredDomains, counts, allTags } = useDomainFilters(domains, {
    search: searchText,
    tab,
    tags: tagFilter,
  })

  const statusDot = (color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ textTransform: 'capitalize' }}>{label}</span>
    </span>
  )

  const columns: ColumnsType<Zone> = [
    {
      title: 'Domain',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span style={{ fontWeight: 500, fontSize: 15 }}>{text}</span>,
    },
    {
      title: 'Plan',
      key: 'plan',
      width: 120,
      filters: [...new Set(domains.map((d) => d.plan).filter((p): p is string => !!p))].sort().map((plan) => ({
        text: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: plan,
      })),
      onFilter: (value, record) => record.plan === value,
      render: (_: unknown, record: Zone) => {
        if (!record.plan) return <span style={{ color: '#8f8f8f' }}>—</span>
        const colors: Record<string, string> = { enterprise: 'gold', business: 'blue', pro: 'purple' }
        return (
          <Tag variant="filled" color={colors[record.plan] || 'default'}>
            {record.plan.charAt(0).toUpperCase() + record.plan.slice(1)}
          </Tag>
        )
      },
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) =>
        statusDot(status === 'active' ? '#28a948' : status === 'pending' ? '#ffae00' : '#8f8f8f', status),
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 130,
      render: (_: unknown, record: Zone) => {
        const sslMode = record.sslMode || record.ssl?.mode
        const sslStatus = record.ssl?.status || 'unknown'
        if (sslMode) {
          return statusDot(sslMode !== 'off' ? '#28a948' : '#8f8f8f', sslMode)
        }
        if (sslStatus !== 'unknown') {
          return statusDot(sslStatus === 'active' ? '#28a948' : '#ffae00', sslStatus)
        }
        return statusDot('#8f8f8f', 'unknown')
      },
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 220,
      render: (_: unknown, record: Zone) => (
        <Space size={4} wrap>
          {(record.tags || []).map((tag) => (
            <Tag
              key={tag}
              variant="filled"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                setTagFilter([tag])
              }}
            >
              {tag}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Zone) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Button
            type="link"
            size="small"
            disabled={busy}
            onClick={() => setParams({ modal: 'copy-config', source: record.id })}
          >
            {t('Copy')}
          </Button>
          <Button
            type="link"
            size="small"
            disabled={busy}
            onClick={() => setParams({ modal: 'clone', source: record.id })}
          >
            {t('Clone')}
          </Button>
          <Button
            danger
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            aria-label={t('Delete domain')}
            disabled={busy}
            onClick={() => {
              deleteMutation.reset()
              setParams({ modal: 'delete', deleteZone: record.id })
            }}
          />
        </span>
      ),
    },
  ]

  return (
    <div className="domains-page relative flex min-h-full">
      <div className="min-w-0 flex-1" style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <PageHeader
        title="Domains"
        description={`${counts.all} domains · ${counts.active} active · ${counts.pending} pending`}
        tabs={[
          { key: 'all', label: t('All'), count: counts.all },
          { key: 'active', label: t('Active'), count: counts.active },
          { key: 'pending', label: t('Pending'), count: counts.pending },
        ]}
        activeTab={tab}
        onTabChange={(key) => setParams({ tab: key === 'all' ? null : key })}
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          title={apiErrorDetail(error) || t('Could not load domains')}
          action={<Button onClick={() => refetch()}>{t('Retry')}</Button>}
          className="mb-4"
        />
      )}

      <div className="domains-toolbar mb-4 flex flex-wrap items-center gap-2">
        <Input
          size="large"
          prefix={<SearchOutlined style={{ color: '#8f8f8f' }} />}
          placeholder={t('Search domains...')}
          aria-label={t('Search domains...')}
          allowClear
          value={searchText}
          onChange={(e) => setParams({ q: e.target.value || null })}
          className="min-w-[200px] flex-1"
        />
        <Select
          mode="multiple"
          aria-label={t('Filter by tag')}
          allowClear
          size="large"
          placeholder={<><TagsOutlined /> {t('Filter by tag')}</>}
          value={tagFilter}
          onChange={setTagFilter}
          options={allTags.map((t) => ({ value: t, label: t }))}
          className="min-w-[160px]"
        />
        <Button size="large" icon={<AppstoreAddOutlined />} disabled={busy} onClick={() => setParams({ modal: 'bulk-add' })}>
          {t('Bulk add')}
        </Button>
        <Button size="large" type="primary" icon={<PlusOutlined />} disabled={busy} onClick={() => setParams({ modal: 'add' })}>
          {t('Add domain')}
        </Button>
      </div>

      <Space orientation="vertical" style={{ width: '100%' }} size="large">
          {selectedRowKeys.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                padding: '10px 14px',
                background: token.colorFillQuaternary,
                borderRadius: 8,
              }}
            >
              <Text strong>{t('{{count}} domain(s) selected', { count: selectedRowKeys.length })}</Text>
              <Popconfirm
                title={t('Bulk purge cache')}
                description={t('Purge all cache for the {{count}} selected domain(s)?', { count: selectedRowKeys.length })}
                okText={t('Purge')}
                cancelText={t('Cancel')}
                onConfirm={() => {
                  if (!busy) bulkMutation.mutate({ action: 'purge', zoneIds: selectedRowKeys })
                }}
              >
                <Button icon={<ReloadOutlined />} loading={bulkMutation.isPending} disabled={busy}>
                  {t('Purge cache')}
                </Button>
              </Popconfirm>
              <Button icon={<SwapOutlined />} disabled={busy} onClick={() => setParams({ modal: 'bulk-dns' })}>
                {t('Bulk DNS replace')}
              </Button>
              <Button icon={<CopyOutlined />} disabled={busy} onClick={() => setParams({ modal: 'copy-config', source: null })}>
                {t('Copy config')}
              </Button>
              <Button
                icon={<TagsOutlined />}
                disabled={busy || isLoading || isError}
                onClick={() => {
                  setTagFailures([])
                  setParams({ modal: 'tags' })
                }}
              >
                {t('Assign tags')}
              </Button>
              <Button
                danger
                disabled={busy}
                onClick={() => {
                  bulkMutation.reset()
                  setParams({ modal: 'delete', deleteZone: null })
                }}
              >
                ▢ {t('Delete domains')}
              </Button>
              <Button type="text" disabled={busy} onClick={() => setSelectedRowKeys([])}>
                {t('Clear selection')}
              </Button>
            </div>
          )}
          <Table
            loading={isLoading}
            dataSource={filteredDomains}
            rowKey="id"
            columns={columns}
            rowClassName="hover-row"
            onRow={(record) => ({
              onClick: (event) => {
                if (event.target instanceof Element && event.target.closest('button, a, input, .ant-checkbox-wrapper')) return
                if (!busy) navigate(`/domains/${record.id}`)
              },
            })}
            rowSelection={{
              selectedRowKeys,
              preserveSelectedRowKeys: true,
              onChange: (keys: Key[]) => setSelectedRowKeys(keys as string[]),
              getCheckboxProps: () => ({ disabled: busy }),
            }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => t('Total {{total}} domains', { total }),
            }}
            scroll={{ x: 'max-content' }}
          />
        </Space>

      {activeModal === 'delete' && !isLoading && !canDelete && (
        <Alert
          type="warning"
          title={t('Select available domains before deleting')}
          action={<Button onClick={() => setParams({ modal: null, deleteZone: null })}>{t('Cancel')}</Button>}
          className="mt-4"
        />
      )}

      <ConfirmDestructive
        key={`${deleteZoneId ? 'row' : 'bulk'}:${deleteIds.join(',')}`}
        open={activeModal === 'delete' && canDelete}
        title={t('Delete {{count}} zones from Cloudflare?', { count: deleteIds.length })}
        items={deleteTargets.map((zone) => ({ key: zone.id, label: zone.name, meta: zone.status }))}
        explanation={
          <>
            {t('All DNS records, page rules and cache configuration of these zones will be permanently deleted on Cloudflare. Websites will stop working if their nameservers still point to Cloudflare.')}
            {deletionError && (
              <span role="alert" className="mt-2 block text-danger">
                {apiErrorDetail(deletionError) || t(deleteZoneId ? 'Could not delete domain' : 'Bulk operation failed')}
              </span>
            )}
          </>
        }
        severity="high"
        confirmText={t(deleteIds.length === 1 ? 'delete {{count}} zone' : 'delete {{count}} zones', { count: deleteIds.length })}
        loading={deleteMutation.isPending || bulkMutation.isPending}
        onConfirm={() => {
          if (busy || !canDelete) return
          if (deleteZoneId) deleteMutation.mutate(deleteZoneId)
          else bulkMutation.mutate({ action: 'delete', zoneIds: deleteIds })
        }}
        onCancel={() => {
          if (!busy) setParams({ modal: null, deleteZone: null })
        }}
      />

      <Modal
        title={t('Assign tags')}
        open={activeModal === 'tags'}
        onCancel={closeTags}
        onOk={() => {
          if (busy || isLoading || isError || normalizedTags.length === 0 || selectedRowKeys.length === 0) return
          setTagFailures([])
          assignTagsMutation.mutate({ zoneIds: selectedRowKeys, tags: normalizedTags })
        }}
        okText={t('Assign')}
        cancelText={t('Cancel')}
        confirmLoading={assignTagsMutation.isPending}
        okButtonProps={{ disabled: isLoading || isError || normalizedTags.length === 0 || selectedRowKeys.length === 0 }}
        cancelButtonProps={{ disabled: assignTagsMutation.isPending }}
        closable={!assignTagsMutation.isPending}
      >
        <p>{t('Tags will be added to the {{count}} selected domain(s).', { count: selectedRowKeys.length })}</p>
        <Select
          mode="tags"
          style={{ width: '100%' }}
          aria-label={t('Choose or type new tags')}
          placeholder={t('Choose or type new tags')}
          value={tagsToAssign}
          onChange={setTagsToAssign}
          disabled={assignTagsMutation.isPending}
          options={allTags.map((tag) => ({ value: tag, label: tag }))}
        />
        {tagFailures.length > 0 && (
          <Alert
            type="error"
            title={t('Could not update tags')}
            description={<ul>{tagFailures.map((failure) => <li key={failure.zoneId}>{failure.name}: {failure.detail}</li>)}</ul>}
            className="mt-3"
          />
        )}
      </Modal>

      <Modal
        title={t('Add new domain')}
        open={activeModal === 'add'}
        onCancel={() => {
          setParams({ modal: null })
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText={t('Add')}
        cancelText={t('Cancel')}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values.name.trim())}
        >
          <Form.Item
            label={t('Domain name')}
            name="name"
            rules={[
              { required: true, message: t('Please enter a domain name') },
              {
                pattern: /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/,
                message: t('Invalid domain name (e.g. example.com)'),
              },
            ]}
          >
            <Input placeholder="example.com" size="large" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <BulkProgressModal
        jobId={jobId}
        open={!!jobId}
        onClose={closeBulkJob}
        renderDone={(job) => (job.type === 'create-zones' || job.type === 'clone-domain' ? <CreateZonesDone job={job} /> : null)}
      />

      <BulkAddDomainsModal
        open={activeModal === 'bulk-add'}
        onClose={() => setParams({ modal: null })}
        onJobCreated={(id) => setParams({ modal: null, job: id })}
      />

      <BulkDnsReplaceModal
        open={activeModal === 'bulk-dns'}
        onClose={() => setParams({ modal: null })}
        onJobCreated={(id) => setParams({ modal: null, job: id })}
        zoneIds={selectedRowKeys}
        zoneNames={Object.fromEntries(domains.map((d) => [d.id, d.name]))}
      />
      </div>

      {/* Sibling panel keys must be distinct even when they share the URL source. */}
      <CopyConfigPanel
        key={`copy:${sourceZoneId || 'bulk-copy'}`}
        open={activeModal === 'copy-config'}
        zones={domains}
        initialSourceZoneId={sourceZoneId}
        initialTargetIds={selectedRowKeys}
        onClose={closeConfigPanel}
        onJobCreated={onConfigJobCreated}
      />

      <CloneDomainPanel
        key={`clone:${sourceZoneId || 'clone'}`}
        source={cloneSource ? { zoneId: cloneSource.id, zoneName: cloneSource.name } : null}
        onClose={closeConfigPanel}
        onJobCreated={onConfigJobCreated}
      />
    </div>
  )
}
