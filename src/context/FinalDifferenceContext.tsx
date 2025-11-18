// src/context/FinalDifferenceContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from "react";

interface FinalDifferenceContextType {
  employeeFinalDifferences: Map<string, number>;
  updateFinalDifference: (empCode: string, difference: number) => void;

  originalFinalDifference: Map<string, number>; // ⭐ NEW
  updateOriginalFinalDifference: (empCode: string, value: number) => void; // ⭐ NEW

  clearFinalDifferences: () => void;

  totalMinus4: Map<string, number>;
  updateTotalMinus4: (empCode: string, minutes: number) => void;

  lateDeductionOverride: Map<string, number>;
  updateLateDeductionOverride: (empCode: string, minutes: number) => void;

  setRecursionState: (empCode: string, inProgress: boolean) => void;
}

const FinalDifferenceContext = createContext<
  FinalDifferenceContextType | undefined
>(undefined);

export const FinalDifferenceProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  // ⭐ LIVE (modified) finalDifference after recursion
  const [employeeFinalDifferences, setEmployeeFinalDifferences] = useState<
    Map<string, number>
  >(new Map());

  // ⭐ ORIGINAL finalDifference before recursion
  const [originalFinalDifference, setOriginalFinalDifference] = useState<
    Map<string, number>
  >(new Map());

  const [totalMinus4, setTotalMinus4] = useState<Map<string, number>>(
    new Map()
  );
  const [lateDeductionOverride, setLateDeductionOverride] = useState<
    Map<string, number>
  >(new Map());

  // recursion guard
  const recursionInProgressRef = useRef<Set<string>>(new Set());

  /* --------------------------------------------------
     RECURSION ENGINE
  -------------------------------------------------- */
  function computeRecursiveLateDeduction(initialFinalDifference: number) {
    const DAY_MINUTES = 8 * 60;
    let finalDiff = initialFinalDifference;
    let totalLateDeduction = 0;

    while (finalDiff < 0) {
      const days = Math.ceil(Math.abs(finalDiff) / DAY_MINUTES);
      const deduction = days * DAY_MINUTES;

      totalLateDeduction += deduction;
      finalDiff += deduction;
      if (finalDiff >= 0) break;
    }

    return { finalDiff, totalLateDeduction };
  }

  const setRecursionState = useCallback(
    (empCode: string, inProgress: boolean) => {
      const set = recursionInProgressRef.current;
      inProgress ? set.add(empCode) : set.delete(empCode);
    },
    []
  );

  /* --------------------------------------------------
     UPDATE ORIGINAL F.D. — store only once
  -------------------------------------------------- */
  const updateOriginalFinalDifference = useCallback(
    (empCode: string, value: number) => {
      setOriginalFinalDifference((prev) => {
        if (prev.has(empCode)) return prev; // ❗ DO NOT OVERRIDE
        const map = new Map(prev);
        map.set(empCode, value);
        return map;
      });
    },
    []
  );

  /* --------------------------------------------------
     UPDATE FINAL DIFFERENCE WITH RECURSION
  -------------------------------------------------- */
  const updateFinalDifference = useCallback(
    (empCode: string, difference: number) => {
      // Prevent re-entrancy
      if (recursionInProgressRef.current.has(empCode)) return;

      // Record the original final diff the first time we see it
      updateOriginalFinalDifference(empCode, difference);

      // Re-read original (it may have been set by the call above)
      const orig = originalFinalDifference.get(empCode);

      // Debug: helpful to see call order for emp
      console.debug(
        "[FD:update] emp:",
        empCode,
        "incomingDiff:",
        difference,
        "orig:",
        orig
      );

      // If incoming difference is non-negative -> straightforward set
      if (difference >= 0) {
        setEmployeeFinalDifferences((prev) => {
          const existing = prev.get(empCode);
          if (existing === difference) return prev;
          const map = new Map(prev);
          map.set(empCode, difference);
          return map;
        });
        return;
      }

      // At this point difference < 0
      // If original is not yet recorded (rare because we wrote it above),
      // still set live negative and return; recursion will run when orig exists.
      if (orig === undefined) {
        setEmployeeFinalDifferences((prev) => {
          const existing = prev.get(empCode);
          if (existing === difference) return prev;
          const map = new Map(prev);
          map.set(empCode, difference);
          return map;
        });
        return;
      }

      // If original already exists and is non-negative, keep original positive value
      if (orig >= 0) {
        setEmployeeFinalDifferences((prev) => {
          const existing = prev.get(empCode);
          if (existing === orig) return prev;
          const map = new Map(prev);
          map.set(empCode, orig);
          return map;
        });
        return;
      }

      // Decide whether to trigger recursion: only for negatives >= 4 hours
      const MIN_TRIGGER_MINUTES = 2 * 60; // 240 minutes
      if (Math.abs(difference) < MIN_TRIGGER_MINUTES) {
        // small negative - do NOT apply full-day recursion
        // keep the live negative diff visible and do not set a lateDeductionOverride
        console.debug(
          "[FD:update] emp:",
          empCode,
          "small negative (<4h), skipping recursion. diff:",
          difference
        );

        setEmployeeFinalDifferences((prev) => {
          const existing = prev.get(empCode);
          if (existing === difference) return prev;
          const map = new Map(prev);
          map.set(empCode, difference);
          return map;
        });
        return;
      }

      // original exists and is negative AND large enough -> run recursion
      console.debug(
        "[FD:recursion:start] emp:",
        empCode,
        "initialDiff:",
        difference
      );
      setRecursionState(empCode, true);
      try {
        const { finalDiff, totalLateDeduction } =
          computeRecursiveLateDeduction(difference);

        console.debug(
          "[FD:recursion:result]",
          empCode,
          "finalDiff:",
          finalDiff,
          "deductionMins:",
          totalLateDeduction
        );

        setEmployeeFinalDifferences((prev) => {
          const existing = prev.get(empCode);
          if (existing === finalDiff) return prev;
          const map = new Map(prev);
          map.set(empCode, finalDiff);
          return map;
        });

        setLateDeductionOverride((prev) => {
          const existing = prev.get(empCode);
          if (existing === totalLateDeduction) return prev;
          const map = new Map(prev);
          map.set(empCode, totalLateDeduction);
          return map;
        });
      } finally {
        setRecursionState(empCode, false);
      }
    },
    [setRecursionState, originalFinalDifference, updateOriginalFinalDifference]
  );

  /* --------------------------------------------------
     OTHER FUNCTIONS
  -------------------------------------------------- */
  const clearFinalDifferences = useCallback(() => {
    setEmployeeFinalDifferences(new Map());
    setOriginalFinalDifference(new Map());
    setLateDeductionOverride(new Map());
    setTotalMinus4(new Map());
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
