"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface FinalDifferenceContextType {
  employeeFinalDifferences: Map<string, number>;
  updateFinalDifference: (empCode: string, difference: number) => void;
  clearFinalDifferences: () => void;
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

  const updateFinalDifference = useCallback(
    (empCode: string, difference: number) => {
      setEmployeeFinalDifferences((prev) => {
        const oldValue = prev.get(empCode);

        if (oldValue === difference) return prev; // no change → no re-render

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

  return (
    <FinalDifferenceContext.Provider
      value={{
        employeeFinalDifferences,
        updateFinalDifference,
        clearFinalDifferences,
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
