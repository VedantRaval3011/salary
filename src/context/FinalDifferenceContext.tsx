// src/context/FinalDifferenceContext.tsx
"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface FinalDifferenceContextType {
  employeeFinalDifferences: Map<string, number>;
  updateFinalDifference: (empCode: string, difference: number) => void;

  originalFinalDifference: Map<string, number>;
  updateOriginalFinalDifference: (empCode: string, value: number) => void;

  clearFinalDifferences: () => void;

  totalMinus4: Map<string, number>;
  updateTotalMinus4: (empCode: string, minutes: number) => void;

  lateDeductionOverride: Map<string, number>;
  updateLateDeductionOverride: (empCode: string, minutes: number) => void;

  setRecursionState: (empCode: string, inProgress: boolean) => void;

  presentDayTotals: Map<string, number>;
  updatePresentDayTotal: (empCode: string, total: number) => void;

  overtimeGrandTotals: Map<string, number>;
  updateOvertimeGrandTotal: (empCode: string, total: number) => void;
}

const FinalDifferenceContext = createContext<
  FinalDifferenceContextType | undefined
>(undefined);

export const FinalDifferenceProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [employeeFinalDifferences, setEmployeeFinalDifferences] = useState<
    Map<string, number>
  >(new Map());

  const [originalFinalDifference, setOriginalFinalDifference] = useState<
    Map<string, number>
  >(new Map());

  const [totalMinus4, setTotalMinus4] = useState<Map<string, number>>(
    new Map()
  );

  const [lateDeductionOverride, setLateDeductionOverride] = useState<
    Map<string, number>
  >(new Map());

  const setRecursionState = useCallback(
    (_empCode: string, _inProgress: boolean) => {},
    []
  );

  /* ======================================================
      HELPERS
  ====================================================== */

  const safeSetFinalDifference = useCallback(
    (empCode: string, value: number) => {
      setEmployeeFinalDifferences((prev) => {
        const existing = prev.get(empCode);
        if (existing === value) return prev;
        const map = new Map(prev);
        map.set(empCode, value);
        return map;
      });
    },
    []
  );

  const safeSetLateDeduction = useCallback(
    (empCode: string, minutes: number) => {
      setLateDeductionOverride((prev) => {
        const existing = prev.get(empCode);
        if (existing === minutes) return prev;
        const map = new Map(prev);
        map.set(empCode, minutes);
        return map;
      });
    },
    []
  );

  const updateOriginalFinalDifference = useCallback(
    (empCode: string, value: number) => {
      setOriginalFinalDifference((prev) => {
        if (prev.has(empCode)) return prev;
        const map = new Map(prev);
        map.set(empCode, value);
        return map;
      });
    },
    []
  );

  /* ======================================================
      LATE DEDUCTION REMOVED - Set to 0
  ====================================================== */

  /* ======================================================
      UPDATE FINAL DIFFERENCE (NEW RULE)
  ====================================================== */

  const updateFinalDifference = useCallback(
    (empCode: string, difference: number) => {
      // Store original FD ONCE
      updateOriginalFinalDifference(empCode, difference);

      // Late deduction removed - always set to 0
      safeSetFinalDifference(empCode, difference);
      safeSetLateDeduction(empCode, 0);
    },
    [
      originalFinalDifference,
      updateOriginalFinalDifference,
      safeSetFinalDifference,
      safeSetLateDeduction,
    ]
  );

  /* ======================================================
      OTHER FUNCTIONS
  ====================================================== */

  const [presentDayTotals, setPresentDayTotals] = useState<Map<string, number>>(
    new Map()
  );

  const [overtimeGrandTotals, setOvertimeGrandTotals] = useState<
    Map<string, number>
  >(new Map());

  const updatePresentDayTotal = useCallback((empCode: string, total: number) => {
    setPresentDayTotals((prev) => {
      const existing = prev.get(empCode);
      if (existing === total) return prev;
      const map = new Map(prev);
      map.set(empCode, total);
      return map;
    });
  }, []);

  const updateOvertimeGrandTotal = useCallback(
    (empCode: string, total: number) => {
      setOvertimeGrandTotals((prev) => {
        const existing = prev.get(empCode);
        if (existing === total) return prev;
        const map = new Map(prev);
        map.set(empCode, total);
        return map;
      });
    },
    []
  );

  const clearFinalDifferences = useCallback(() => {
    setEmployeeFinalDifferences(new Map());
    setOriginalFinalDifference(new Map());
    setLateDeductionOverride(new Map());
    setTotalMinus4(new Map());
    setPresentDayTotals(new Map());
    setOvertimeGrandTotals(new Map());
  }, []);

  const updateTotalMinus4 = useCallback((empCode: string, minutes: number) => {
    setTotalMinus4((prev) => {
      const existing = prev.get(empCode);
      if (existing === minutes) return prev;
      const map = new Map(prev);
      map.set(empCode, minutes);
      return map;
    });
  }, []);

  const updateLateDeductionOverride = useCallback(
    (empCode: string, minutes: number) => {
      safeSetLateDeduction(empCode, minutes);
    },
    [safeSetLateDeduction]
  );

  return (
    <FinalDifferenceContext.Provider
      value={{
        employeeFinalDifferences,
        updateFinalDifference,

        originalFinalDifference,
        updateOriginalFinalDifference,

        clearFinalDifferences,
        totalMinus4,
        updateTotalMinus4,
        lateDeductionOverride,
        updateLateDeductionOverride,

        setRecursionState,

        presentDayTotals,
        updatePresentDayTotal,
        overtimeGrandTotals,
        updateOvertimeGrandTotal,
      }}
    >
      {children}
    </FinalDifferenceContext.Provider>
  );
};

export const useFinalDifference = () => {
  const context = useContext(FinalDifferenceContext);
  if (!context) {
    throw new Error(
      "useFinalDifference must be used within FinalDifferenceProvider"
    );
  }
  return context;
};
