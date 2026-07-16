"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface ApiActivityContextValue {
  apiFetch: typeof fetch;
  isLoading: boolean;
}

const ApiActivityContext = createContext<ApiActivityContextValue | undefined>(undefined);

export function ApiActivityProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const apiFetch = useCallback<typeof fetch>(async (input, init) => {
    setPendingCount((count) => count + 1);
    try {
      return await fetch(input, init);
    } finally {
      setPendingCount((count) => count - 1);
    }
  }, []);

  const value = useMemo(() => ({ apiFetch, isLoading: pendingCount > 0 }), [apiFetch, pendingCount]);

  return (
    <ApiActivityContext.Provider value={value}>
      {value.isLoading ? (
        <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden">
          <div className="odl-loading-bar h-full w-1/3 bg-[var(--primary)]" />
        </div>
      ) : null}
      {children}
    </ApiActivityContext.Provider>
  );
}

export function useApiFetch(): typeof fetch {
  const context = useContext(ApiActivityContext);
  if (!context) {
    throw new Error("useApiFetch must be used within an ApiActivityProvider.");
  }

  return context.apiFetch;
}

export function useApiActivity(): boolean {
  const context = useContext(ApiActivityContext);
  if (!context) {
    throw new Error("useApiActivity must be used within an ApiActivityProvider.");
  }

  return context.isLoading;
}
