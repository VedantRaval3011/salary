"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface FinalDifferenceContextType {
  employeeFinalDifferences: Map<string, number>;
  updateFinalDifference: (empCode: string, difference: number) => void;
  clearFinalDifferences: () => void;

  // 🆕 ADD THESE
  totalMinus4: Map<string, number>;
  updateTotalMinus4: (empCode: string, minutes: number) => void;
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

  // 🆕 Storage for Total (-4hrs)
  const [totalMinus4, setTotalMinus4] = useState<Map<string, number>>(
    new Map()
  );

  // --- Already existing ---
  const updateFinalDifference = useCallback(
    (empCode: string, difference: number) => {
      setEmployeeFinalDifferences((prev) => {
        const oldValue = prev.get(empCode);
        if (oldValue === difference) return prev; // no change
        const newMap = new Map(prev);
        newMap.set(empCode, difference);
        return newMap;
      });
    },
    []
  );

  const clearFinalDifferences = useCallback(() => {
    setEmployeeFinalDifferences(new Map());
  }, []);

  // 🆕 NEW FUNCTION FOR Total (-4hrs)
  const updateTotalMinus4 = useCallback((empCode: string, minutes: number) => {
    setTotalMinus4((prev) => {
      const old = prev.get(empCode);
      if (old === minutes) return prev; // no change
      const newMap = new Map(prev);
      newMap.set(empCode, minutes);
      return newMap;
    });
  }, []);

  return (
    <FinalDifferenceContext.Provider
      value={{
        employeeFinalDifferences,
        updateFinalDifference,
        clearFinalDifferences,

        // 🆕 Expose these to components
        totalMinus4,
        updateTotalMinus4,
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
