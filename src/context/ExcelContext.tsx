// context/ExcelContext.tsx
'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ProcessedExcelData } from '@/lib/types';

interface ExcelContextType {
  excelData: ProcessedExcelData | null;
  setExcelData: (data: ProcessedExcelData) => void;
  clearData: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const ExcelContext = createContext<ExcelContextType | undefined>(undefined);

export const ExcelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [excelData, setExcelDataState] = useState<ProcessedExcelData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const setExcelData = useCallback((data: ProcessedExcelData) => {
    setExcelDataState(data);
  }, []);

  const clearData = useCallback(() => {
    setExcelDataState(null);
  }, []);

  return (
    <ExcelContext.Provider
      value={{
        excelData,
        setExcelData,
        clearData,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </ExcelContext.Provider>
  );
};

export const useExcel = () => {
  const context = useContext(ExcelContext);
  if (context === undefined) {
    throw new Error('useExcel must be used within an ExcelProvider');
  }
  return context;
};
