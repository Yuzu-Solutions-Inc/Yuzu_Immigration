import { round2 } from "./taxes";

export type MonetaryAccount = {
  code: string;
  balanceForeign: number;
  currency: string;
};

export type FxRevaluationLine = {
  accountCode: string;
  currency: string;
  foreignBalance: number;
  cadBefore: number;
  cadAfter: number;
  gainLoss: number;
};

/**
 * Period-end revaluation of monetary FX balances into CAD.
 * Gain/loss posts to a single unrealized FX account (not implemented as a GL
 * writer here — the general ledger assembler should consume these lines).
 */
export function revalueMonetaryAccounts(params: {
  accounts: MonetaryAccount[];
  cadBalanceByAccount: Record<string, number>;
  ratesToCad: Record<string, number>;
}): FxRevaluationLine[] {
  return params.accounts.map((account) => {
    const rate = params.ratesToCad[account.currency] ?? 1;
    const cadAfter = round2(account.balanceForeign * rate);
    const cadBefore = round2(params.cadBalanceByAccount[account.code] ?? 0);
    return {
      accountCode: account.code,
      currency: account.currency,
      foreignBalance: account.balanceForeign,
      cadBefore,
      cadAfter,
      gainLoss: round2(cadAfter - cadBefore),
    };
  });
}
