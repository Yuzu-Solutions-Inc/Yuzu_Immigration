"use client";

import { createContext, useContext, type ReactNode } from "react";

export type FinanceOutletValue = {
  refreshMetrics?: () => void | Promise<void>;
};

const FinanceOutletContext = createContext<FinanceOutletValue>({});

export function FinanceOutletProvider({
  value,
  children,
}: {
  value: FinanceOutletValue;
  children: ReactNode;
}) {
  return (
    <FinanceOutletContext.Provider value={value}>
      {children}
    </FinanceOutletContext.Provider>
  );
}

export function useFinanceOutlet<T extends FinanceOutletValue = FinanceOutletValue>() {
  return useContext(FinanceOutletContext) as T;
}
