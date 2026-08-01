import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import { Lbl } from '../../components/ui'
import { api, apiErrorDetail } from '../../services/api'
import type { ZoneDetail } from '../../types/domain'

/**
 * Tags tab — chips with remove + add input, each change saves immediately via
 * PUT /domains/:zoneId/tags. Also hosts the danger zone (delete domain) that
 * used to live on the legacy Settings tab.
 */
export default function TagsTab({ zoneId, zone }: { zoneId: string; zone?: ZoneDetail }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [newTag, setNewTag] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const tags = zone?.savedSettings?.tags ?? zone?.tags ?? []

  const updateTags = useMutation({
    mutationFn: async (next: string[]) => (await api.put(`/domains/${zoneId}/tags`, { tags: next })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain', zoneId] })
      qc.invalidateQueries({ queryKey: ['domains'] })
      message.success(t('Tags updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save tags'))
    },
  })

  const deleteZone = useMutation({
    mutationFn: async () => api.delete(`/domains/${zoneId}`),
    onSuccess: () => {
      message.success(t('Domain deleted'))
      qc.invalidateQueries({ queryKey: ['domains'] })
      navigate('/')
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not delete domain'))
    },
  })

  const addTag = () => {
    const value = newTag.trim()
    if (!value) return
    if (tags.includes(value)) {
      setNewTag('')
      return
    }
    updateTags.mutate([...tags, value], { onSuccess: () => setNewTag('') })
  }

  const removeTag = (tag: string) => {
    updateTags.mutate(tags.filter((existing) => existing !== tag))
  }

  return (
    <div className="border-x border-b border-stroke bg-bg">
      <div className="px-4 py-[13px]">
        <Lbl className="mb-[9px] block">{t('Tags')}</Lbl>
        <p className="mt-0 mb-3 font-mono text-[11.5px] text-fg-3">
          {t('Tags are stored locally to organize your domains.')}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-[5px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-[5px] rounded-[4px] border border-solid border-stroke-2 bg-bg-hover px-[6px] py-[4px] font-mono text-[11.5px] leading-none text-fg-2"
            >
              {tag}
              <button
                type="button"
                aria-label={t('Remove tag {{tag}}', { tag })}
                disabled={updateTags.isPending}
                onClick={() => removeTag(tag)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[11px] leading-none text-fg-3 hover:text-danger"
              >
                ✕
              </button>
            </span>
          ))}
          {tags.length === 0 && <span className="font-mono text-[11px] text-fg-3">{t('No tags yet')}</span>}
        </div>

        <div className="flex max-w-[360px] gap-1.5">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onPressEnter={addTag}
            placeholder={t('Enter tag…')}
            maxLength={40}
          />
          <Button
            type="primary"
            loading={updateTags.isPending}
            disabled={!newTag.trim()}
            onClick={addTag}
          >
            + {t('Add')}
          </Button>
        </div>
      </div>

      <div className="border-t border-stroke px-4 py-[13px]">
        <Lbl className="mb-[9px] block text-danger">{t('Danger zone')}</Lbl>
        <p className="mt-0 mb-3 text-[12.5px] text-fg-2">
          {t('Delete this domain from Cloudflare. This action cannot be undone.')}
        </p>
        <Button danger loading={deleteZone.isPending} onClick={() => setDeleteOpen(true)}>
          ▢ {t('Delete domain')}
        </Button>
      </div>

      <ConfirmDestructive
        open={deleteOpen}
        title={t('Delete {{name}} from Cloudflare?', { name: zone?.name ?? zoneId })}
        explanation={t(
          'All DNS records, page rules and cache configuration of this zone will be permanently deleted on Cloudflare. The website will stop working if its nameservers still point to Cloudflare.',
        )}
        confirmText={zone?.name ?? zoneId}
        loading={deleteZone.isPending}
        onConfirm={() => deleteZone.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
