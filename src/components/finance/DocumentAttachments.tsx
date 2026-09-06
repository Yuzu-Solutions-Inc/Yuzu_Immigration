'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DocumentAttachment, DocumentEntityType } from '@/lib/finance/types'
import {
  deleteAttachment,
  documentAcceptAttribute,
  fetchAttachments,
  formatDocumentSize,
  getSignedDocumentUrl,
  uploadDocument,
} from '@/lib/finance/documents'
import { Button } from './Button'
import { DeleteIconButton, ViewIconButton } from '@/components/layout/icon-action-button'

type Props = {
  entityType: DocumentEntityType
  entityId: string | null
  disabled?: boolean
  label?: string
  hint?: string
  /** Restrict picker + validation to PDF only (e.g. project contracts). */
  pdfOnly?: boolean
}

export function DocumentAttachments({
  entityType,
  entityId,
  disabled = false,
  label,
  hint,
  pdfOnly = false,
}: Props) {
  const t = useTranslations('financeApp')
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<DocumentAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAttachments(entityType, entityId)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.loadError'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId, t])

  async function handleUpload(file: File) {
    if (!entityId || disabled) return
    setUploading(true)
    setError(null)
    try {
      const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.type)
      if (pdfOnly && mime !== 'application/pdf') {
        throw new Error(t('common.pdfOnly'))
      }
      const attachment = await uploadDocument(file, file.name, mime, entityType, entityId)
      setRows((prev) => [attachment, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function handleView(attachment: DocumentAttachment) {
    setError(null)
    try {
      const url = await getSignedDocumentUrl(attachment.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.openFailed'))
    }
  }

  async function handleDelete(attachment: DocumentAttachment) {
    if (disabled) return
    if (!confirm(t('common.confirmDeleteNamed', { filename: attachment.filename }))) return
    setError(null)
    try {
      await deleteAttachment(attachment)
      setRows((prev) => prev.filter((r) => r.id !== attachment.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.deleteFailed'))
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{label ?? t('common.documents')}</div>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={pdfOnly ? '.pdf,application/pdf' : documentAcceptAttribute}
            className="hidden"
            disabled={disabled || !entityId || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            className="!text-xs"
            disabled={disabled || !entityId || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? t('common.uploading') : pdfOnly ? t('common.attachPdf') : t('common.attach')}
          </Button>
        </div>
      </div>

      {!entityId && (
        <p className="text-xs text-muted-foreground">{t('common.saveFirstToAttach')}</p>
      )}

      {loading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}

      {!loading && entityId && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {pdfOnly ? t('common.noPdfContract') : t('common.noDocuments')}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border bg-surface">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{doc.filename}</div>
                <div className="text-xs text-muted-foreground">{formatDocumentSize(Number(doc.size_bytes))}</div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <ViewIconButton label={t('common.view')} onClick={() => void handleView(doc)} />
                {!disabled && (
                  <DeleteIconButton label={t('common.delete')} onClick={() => void handleDelete(doc)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
