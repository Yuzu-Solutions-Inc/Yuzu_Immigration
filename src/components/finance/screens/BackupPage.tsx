'use client'

import { useState } from 'react'
import { exportFullBackupZip, type BackupProgress } from '@/lib/finance/backupExport'
import { AlertBanner } from '@/components/finance/AlertBanner'
import { Button } from '@/components/finance/Button'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { useTranslations } from 'next-intl'

export function BackupPage() {
  const t = useTranslations('financeApp')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runExport() {
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress({ phase: t('backup.starting'), current: 0, total: 1 })
    try {
      const out = await exportFullBackupZip(setProgress)
      setResult(
        t('backup.success', { filename: out.filename, tables: out.tableCount, docs: out.documentCount })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('backup.exportFailed'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
      />

      <div className="ui-card p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('backup.body')}
        </p>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>
            <code className="text-xs">settings/</code>, <code className="text-xs">master/</code>,{' '}
            <code className="text-xs">billing/</code>, <code className="text-xs">bank/</code>
          </li>
          <li>
            <code className="text-xs">payroll/</code>, <code className="text-xs">tax/</code>,{' '}
            <code className="text-xs">accounting/</code>, <code className="text-xs">documents/</code>
          </li>
          <li>
            {t('backup.manifest')}
          </li>
        </ul>

        <Button disabled={busy} onClick={() => void runExport()}>
          {busy ? t('backup.exporting') : t('backup.download')}
        </Button>

        {progress && (
          <p className="text-xs text-muted-foreground">
            {t('backup.progress', { phase: progress.phase, current: progress.current, total: progress.total })}
          </p>
        )}

        {result && <AlertBanner variant="success">{result}</AlertBanner>}
        {error && <AlertBanner variant="warning">{error}</AlertBanner>}

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          {t('backup.doNotCommit')}
        </p>
      </div>
    </PageShell>
  )
}
