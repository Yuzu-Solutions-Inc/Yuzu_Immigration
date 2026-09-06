import { db } from './db'

export async function deletePayrollRun(payrollRunId: string) {
  await db.from('employee_expenses').update({ payroll_run_id: null }).eq('payroll_run_id', payrollRunId)
  const { error } = await db.from('payroll_runs').delete().eq('id', payrollRunId)
  if (error) throw error
}

export async function linkReimbursements(payrollRunId: string, selectedIds: string[], previousRunId?: string | null) {
  if (previousRunId) {
    await db.from('employee_expenses').update({ payroll_run_id: null }).eq('payroll_run_id', previousRunId)
  }
  if (selectedIds.length > 0) {
    const { error } = await db
      .from('employee_expenses')
      .update({ payroll_run_id: payrollRunId })
      .in('id', selectedIds)
    if (error) throw error
  }
}
