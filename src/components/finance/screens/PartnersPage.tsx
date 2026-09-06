'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Partner, PartnerKind, InvoiceLanguage } from '@/lib/finance/types'
import { matchesSearch } from '@/lib/finance/filters'
import { formatInvoicePenaltyPercent } from '@/lib/finance/partners'
import {
  deletePartnerAction,
  listPartnersAction,
  upsertPartnerAction,
} from '@/app/actions/finance-partners'
import { PERSON_IMMIGRATION_STATUSES } from '@/lib/crm/person-status'
import type { PersonImmigrationStatus } from '@/db/schema'
import { Badge } from '@/components/finance/Badge'
import { Button, tableActionClass } from '@/components/finance/Button'
import { DeleteIconButton, EditIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { EmptyState } from '@/components/finance/EmptyState'
import { FilterSummary, FilterTh, HeaderSearch, HeaderSelect, PlainTh } from '@/components/finance/ColumnFilters'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import {
  Field,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

const empty: Partial<Partner> = {
  legal_name: '',
  kind: 'customer',
  contact_name: '',
  email: '',
  phone: '',
  address_line1: '',
  city: 'Montréal',
  province: 'QC',
  postal_code: '',
  country: 'Canada',
  language: 'fr' as InvoiceLanguage,
  payment_terms_days: 30,
  invoice_penalty_monthly_pct: 0.02,
  notes: '',
  immigration_status: 'none',
  status_expires_at: '',
  preferred_locale: 'fr',
}

function kindBadgeTone(kind: PartnerKind) {
  if (kind === 'customer') return 'active'
  if (kind === 'provider') return 'sent'
  return 'draft'
}

export function PartnersPage({
  initialRows,
  financeOn,
  immigrationOn,
}: {
  initialRows: Partner[]
  financeOn: boolean
  immigrationOn: boolean
}) {
  const t = useTranslations('financeApp')
  const ti = useTranslations('immigrationStatus')
  const [rows, setRows] = useState<Partner[]>(initialRows)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Partial<Partner>>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<PartnerKind | ''>('')

  const filtered = useMemo(
    () =>
      rows.filter((p) => {
        if (kindFilter && p.kind !== kindFilter) return false
        return matchesSearch(search, p.legal_name, p.contact_name, p.email, p.city, p.province, p.notes, p.kind)
      }),
    [rows, search, kindFilter]
  )

  const hasFilters = !!(search || kindFilter)

  useEffect(() => {
    setRows(initialRows)
  }, [initialRows])

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(p: Partner) {
    setForm(p)
    setEditingId(p.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const result = await upsertPartnerAction({
      id: editingId ?? undefined,
      legal_name: form.legal_name!,
      kind: form.kind ?? 'customer',
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address_line1: form.address_line1 || null,
      city: form.city || null,
      province: form.province || null,
      postal_code: form.postal_code || null,
      country: form.country || null,
      language: form.language ?? 'fr',
      payment_terms_days: form.payment_terms_days ?? 30,
      invoice_penalty_monthly_pct: form.invoice_penalty_monthly_pct ?? 0.02,
      notes: form.notes || null,
      immigration_status: (PERSON_IMMIGRATION_STATUSES as readonly string[]).includes(
        form.immigration_status ?? '',
      )
        ? (form.immigration_status as PersonImmigrationStatus)
        : 'none',
      status_expires_at: form.status_expires_at || null,
      preferred_locale: (form.preferred_locale as 'en' | 'fr' | 'es' | undefined) ?? 'fr',
    })
    if (result.error) {
      alert(result.error)
      return
    }
    setOpen(false)
    setRows(await listPartnersAction())
  }

  async function remove(id: string) {
    if (!confirm(t('partners.confirmDelete'))) return
    const result = await deletePartnerAction(id)
    if (result.error === 'linked_records') {
      alert(t('partners.deleteBlocked'))
      return
    }
    if (result.error) {
      alert(result.error)
      return
    }
    setRows((current) => current.filter((row) => row.id !== id))
  }

  const clearFilters = () => {
    setSearch('')
    setKindFilter('')
  }

  const KIND_OPTIONS: { value: PartnerKind | ''; label: string }[] = [
    { value: '', label: t('common.all') },
    { value: 'customer', label: t('partners.kindCustomer') },
    { value: 'provider', label: t('partners.kindProvider') },
    { value: 'both', label: t('partners.kindBoth') },
  ]

  const kindLabel = (kind: PartnerKind) =>
    kind === 'customer' ? t('partners.kindCustomer') : kind === 'provider' ? t('partners.kindProvider') : t('partners.kindBoth')

  return (
    <PageShell className="space-y-4">
      <PageHeader
        title={t('partners.title')}
        subtitle={t('partners.subtitle')}
        actions={<Button onClick={openNew}>{t('partners.new')}</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState message={t('partners.empty')} />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
          />
          <DataTable minWidth={960}>
            <thead className="bg-muted text-left">
              <tr>
                <FilterTh label={t('partners.name')}>
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder={t('partners.searchName')}
                    aria-label={t('partners.filterName')}
                  />
                </FilterTh>
                <FilterTh label={t('partners.role')}>
                  <HeaderSelect
                    value={kindFilter}
                    onChange={(v) => setKindFilter(v as PartnerKind | '')}
                    aria-label={t('partners.filterRole')}
                    options={KIND_OPTIONS}
                  />
                </FilterTh>
                <PlainTh>{t('partners.contact')}</PlainTh>
                <PlainTh>{t('partners.email')}</PlainTh>
                {immigrationOn ? <PlainTh>{t('partners.immigrationStatus')}</PlainTh> : null}
                {financeOn ? (
                  <>
                    <PlainTh>{t('partners.invoiceLanguageCol')}</PlainTh>
                    <PlainTh>{t('partners.netTerms')}</PlainTh>
                    <PlainTh>{t('partners.invoicePenaltyCol')}</PlainTh>
                  </>
                ) : null}
                <PlainTh>{t('partners.city')}</PlainTh>
                <PlainTh className="w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {t('partners.noneMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="group hover:bg-muted/50">
                    <td className="px-3 py-3 font-medium">
                      <Link href={`/partners/${p.id}`} className="text-action hover:underline">
                        {p.legal_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Badge label={kindLabel(p.kind)} tone={kindBadgeTone(p.kind)} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{p.contact_name ?? t('common.dash')}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.email ?? t('common.dash')}</td>
                    {immigrationOn ? (
                      <td className="px-3 py-3 text-muted-foreground">
                        {ti((p.immigration_status as 'none') || 'none')}
                        {p.status_expires_at ? ` · ${p.status_expires_at}` : ''}
                      </td>
                    ) : null}
                    {financeOn ? (
                      <>
                    <td className="px-3 py-3 text-muted-foreground">
                      {p.kind === 'provider' ? t('common.dash') : t(p.language === 'en' ? 'partners.langEn' : 'partners.langFr')}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {p.kind === 'provider' ? t('common.dash') : t('partners.netN', { days: p.payment_terms_days ?? 30 })}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {p.kind === 'provider' ? t('common.dash') : formatInvoicePenaltyPercent(p)}
                    </td>
                      </>
                    ) : null}
                    <td className="px-3 py-3 text-muted-foreground">{p.city ?? t('common.dash')}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-0.5">
                        <Link
                          href={`/partners/${p.id}`}
                          className={`${tableActionClass} inline-flex items-center justify-center text-sm font-medium text-action hover:underline`}
                        >
                          {t('partners.open')}
                        </Link>
                        <EditIconButton className={iconActionRevealClassName} label={t('common.edit')} onClick={() => openEdit(p)} />
                        <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => remove(p.id)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}
      <Modal title={editingId ? t('partners.edit') : t('partners.new')} open={open} onClose={() => setOpen(false)} wide>
        <FormStack onSubmit={save}>
          <Field>
            <FieldLabel htmlFor="partner-legal-name" required>
              {t('partners.legalName')}
            </FieldLabel>
            <Input
              id="partner-legal-name"
              required
              value={form.legal_name ?? ''}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-kind" required>
              {t('partners.roleStar')}
            </FieldLabel>
            <NativeSelect
              id="partner-kind"
              required
              value={form.kind ?? 'customer'}
              onChange={(e) => setForm({ ...form, kind: e.target.value as PartnerKind })}
            >
              <option value="customer">{t('partners.kindCustomer')}</option>
              <option value="provider">{t('partners.kindProvider')}</option>
              <option value="both">{t('partners.kindBoth')}</option>
            </NativeSelect>
            <FieldHint>{t('partners.roleHint')}</FieldHint>
          </Field>
          <FieldGrid>
            <Field>
              <FieldLabel htmlFor="partner-contact">{t('partners.contact')}</FieldLabel>
              <Input
                id="partner-contact"
                value={form.contact_name ?? ''}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-email">{t('partners.email')}</FieldLabel>
              <Input
                id="partner-email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-phone">{t('partners.phone')}</FieldLabel>
              <Input
                id="partner-phone"
                type="tel"
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </FieldGrid>
          <Field>
            <FieldLabel htmlFor="partner-address">{t('partners.address')}</FieldLabel>
            <Input
              id="partner-address"
              value={form.address_line1 ?? ''}
              onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            />
          </Field>
          <FieldGrid columns={2}>
            <Field>
              <FieldLabel htmlFor="partner-city">{t('partners.city')}</FieldLabel>
              <Input
                id="partner-city"
                value={form.city ?? ''}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-province">{t('partners.province')}</FieldLabel>
              <Input
                id="partner-province"
                value={form.province ?? ''}
                onChange={(e) => setForm({ ...form, province: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-postal">{t('partners.postalCode')}</FieldLabel>
              <Input
                id="partner-postal"
                value={form.postal_code ?? ''}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="partner-country">{t('partners.country')}</FieldLabel>
              <Input
                id="partner-country"
                value={form.country ?? ''}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </Field>
          </FieldGrid>
          {immigrationOn ? (
            <FieldGrid>
              <Field>
                <FieldLabel htmlFor="partner-immigration-status">{t('partners.immigrationStatus')}</FieldLabel>
                <NativeSelect
                  id="partner-immigration-status"
                  value={form.immigration_status ?? 'none'}
                  onChange={(e) => setForm({ ...form, immigration_status: e.target.value })}
                >
                  {PERSON_IMMIGRATION_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {ti(value)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="partner-status-expires">{t('partners.statusExpires')}</FieldLabel>
                <Input
                  id="partner-status-expires"
                  type="date"
                  value={form.status_expires_at ?? ''}
                  onChange={(e) => setForm({ ...form, status_expires_at: e.target.value })}
                  disabled={(form.immigration_status ?? 'none') === 'none'}
                />
              </Field>
            </FieldGrid>
          ) : null}
          {(financeOn && (form.kind === 'customer' || form.kind === 'both')) && (
            <>
              <Field>
                <FieldLabel htmlFor="partner-invoice-language">{t('partners.invoiceLanguage')}</FieldLabel>
                <NativeSelect
                  id="partner-invoice-language"
                  value={form.language ?? 'fr'}
                  onChange={(e) => setForm({ ...form, language: e.target.value as InvoiceLanguage })}
                >
                  <option value="fr">{t('partners.langFr')}</option>
                  <option value="en">{t('partners.langEn')}</option>
                </NativeSelect>
                <FieldHint>{t('partners.languageHint')}</FieldHint>
              </Field>
              <Field>
                <FieldLabel htmlFor="partner-net-days">{t('partners.netDays')}</FieldLabel>
                <Input
                  id="partner-net-days"
                  type="number"
                  min={0}
                  value={form.payment_terms_days ?? 30}
                  onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })}
                />
                <FieldHint>{t('partners.netHint')}</FieldHint>
              </Field>
              <Field>
                <FieldLabel htmlFor="partner-penalty">{t('partners.penaltyPct')}</FieldLabel>
                <Input
                  id="partner-penalty"
                  type="number"
                  min={0}
                  step={0.01}
                  value={Number(((form.invoice_penalty_monthly_pct ?? 0.02) * 100).toFixed(4))}
                  onChange={(e) =>
                    setForm({ ...form, invoice_penalty_monthly_pct: Number(e.target.value) / 100 })
                  }
                />
                <FieldHint>{t('partners.penaltyHint')}</FieldHint>
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </FormStack>
      </Modal>
    </PageShell>
  )
}
