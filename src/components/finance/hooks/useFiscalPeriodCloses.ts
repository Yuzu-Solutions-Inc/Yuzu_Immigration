'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/finance/db'
import type { FiscalPeriodClose } from '@/lib/finance/fiscalPeriodClose'

export function useFiscalPeriodCloses() {
  const [closes, setCloses] = useState<FiscalPeriodClose[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await db
      .from('fiscal_period_closes')
      .select('*')
      .order('period_end', { ascending: false })
    if (!error) setCloses((data as FiscalPeriodClose[]) ?? [])
    setLoading(false)
  }

  return { closes, loading, reload: load }
}
