// src/context/GrandOTContext.tsx
"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

type GrandOTMap = Map<string, number>;

interface GrandOTContextType {
  grandOT: GrandOTMap;
  setGrandOT: (empCode: string, minutes: number) => void;
  getGrandOT: (empCode: string) => number | undefined;
  clearGrandOT: () => void;
}

const GrandOTContext = createContext<GrandOTContextType | undefined>(undefined);

export const GrandOTProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [grandOT, setGrandOTState] = useState<GrandOTMap>(new Map());

  const setGrandOT = useCallback((empCode: string, minutes: number) => {
    setGrandOTState((prev) => {
      const cur = prev.get(empCode);
      // Avoid unnecessary reference updates if value unchanged
      if (cur === minutes) return prev;
      const next = new Map(prev);
      next.set(empCode, minutes);
      return next;
    });
  }, []);

  const getGrandOT = useCallback(
    (empCode: string) => {
      return grandOT.get(empCode);
    },
    [grandOT]
  );

  const clearGrandOT = useCallback(() => {
    setGrandOTState(new Map());
  }, []);

  return (
    <GrandOTContext.Provider
      value={{ grandOT, setGrandOT, getGrandOT, clearGrandOT }}
    >
      {children}
    </GrandOTContext.Provider>
  );
};

export const useGrandOT = (): GrandOTContextType => {
  const ctx = useContext(GrandOTContext);
  if (!ctx) throw new Error("useGrandOT must be used within GrandOTProvider");
  return ctx;
};
