'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { documentAcceptAttribute } from '@/lib/finance/documents'
import {
  extractReceiptFromFile,
  mergeReceiptIntoPurchase,
  type ReceiptExtract,
  type ReceiptPurchaseFields,
} from '@/lib/finance/receiptOcr'
import type { TaxSettings } from '@/lib/finance/taxes'
import { Button } from './Button'
import { Field } from './Field'
import { DeleteIconButton } from '@/components/layout/icon-action-button'

type Props = {
  file: File | null
  onFileChange: (file: File | null) => void
  onExtracted: (fields: ReceiptPurchaseFields, raw: ReceiptExtract) => void
  applyTax: boolean
  settings: TaxSettings | null | undefined
  label?: string
  hint?: string
  disabled?: boolean
  /** When true (default), choosing a file starts Gemini extraction immediately. */
  autoScan?: boolean
}

export function ReceiptScanField({
  file,
  onFileChange,
  onExtracted,
  applyTax,
  settings,
  label,
  hint,
  disabled = false,
  autoScan = true,
}: Props) {
  const t = useTranslations('financeApp')
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  async function runScan(nextFile: File) {
    if (disabled) return
    setScanning(true)
    setError(null)
    setScanNote(null)
    try {
      const raw = await extractReceiptFromFile(nextFile)
      const fields = mergeReceiptIntoPurchase(raw, applyTax, settings)
      onExtracted(fields, raw)
      const conf =
        raw.confidence !== null && raw.confidence !== undefined
          ? t('common.confidence', { pct: Math.round(raw.confidence * 100) })
          : ''
      setScanNote(`${t('common.receiptPrefill')}${conf}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.extractFailed'))
    } finally {
      setScanning(false)
    }
  }

  async function handleFilePicked(next: File | null) {
    onFileChange(next)
    setError(null)
    setScanNote(null)
    if (next && autoScan) {
      await runScan(next)
    }
  }

  return (
    <Field label={label ?? t('common.receiptInvoice')}>
      <input
        ref={inputRef}
        type="file"
        accept={documentAcceptAttribute}
        className="hidden"
        disabled={disabled || scanning}
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null
          e.target.value = ''
          void handleFilePicked(next)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="!text-xs"
          disabled={disabled || scanning}
          onClick={() => inputRef.current?.click()}
        >
          {scanning ? t('common.scanning') : file ? t('common.changeFile') : t('common.scan')}
        </Button>
        {file ? (
          <span className="max-w-[240px] truncate text-xs">{file.name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{hint ?? t('common.receiptHint')}</span>
        )}
        {file && !scanning && (
          <>
            <Button
              type="button"
              variant="secondary"
              className="!text-xs"
              disabled={disabled}
              onClick={() => void runScan(file)}
            >
              {t('common.rescan')}
            </Button>
            <DeleteIconButton
              label={t('common.remove')}
              disabled={disabled}
              onClick={() => {
                onFileChange(null)
                setError(null)
                setScanNote(null)
              }}
            />
          </>
        )}
      </div>
      {scanNote && <p className="mt-1.5 text-xs text-success">{scanNote}</p>}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </Field>
  )
}
