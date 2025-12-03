"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

// Define the structure for punch data
export interface DailyPunchData {
  in: string[];
  out: string[];
}

export interface EmployeePunchData {
  empCode: string;
  empName: string;
  company: string;
  department: string;
  attendance: {
    [date: string]: DailyPunchData;
  };
  otGrantedType?: string; // e.g., "fullnight"
}

interface PunchDataContextType {
  punchData: EmployeePunchData[];
  setPunchData: (data: EmployeePunchData[]) => void;
  getPunchDataForEmployee: (empCode: string) => EmployeePunchData | null;
  getPunchDataForDate: (empCode: string, date: string) => DailyPunchData | null;
  getAllPunchData: () => EmployeePunchData[];
}

const PunchDataContext = createContext<PunchDataContextType | undefined>(
  undefined
);

export const PunchDataProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [punchData, setPunchData] = useState<EmployeePunchData[]>([]);

  const getPunchDataForEmployee = (empCode: string): EmployeePunchData | null => {
    if (!empCode) return null;
    
    // Normalize the employee code for matching
    const normalizeCode = (code: string) => {
      const cleaned = code.toString().trim().toUpperCase();
      const numOnly = cleaned.match(/\d+/g)?.join("") ?? "";
      return { cleaned, numOnly };
    };

    const { cleaned: searchCleaned, numOnly: searchNum } = normalizeCode(empCode);

    const found = punchData.find((emp) => {
      const { cleaned: empCleaned, numOnly: empNum } = normalizeCode(emp.empCode);
      return empCleaned === searchCleaned || (searchNum && empNum === searchNum);
    });

    return found || null;
  };

  const getPunchDataForDate = (empCode: string, date: string): DailyPunchData | null => {
    const employeeData = getPunchDataForEmployee(empCode);
    if (!employeeData) return null;

    // Normalize date for matching (handle "1" vs "01", etc.)
    const normalizeDate = (d: string) => {
      const trimmed = d.toString().trim();
      const num = parseInt(trimmed, 10);
      return isNaN(num) ? trimmed : num.toString();
    };

    const searchDate = normalizeDate(date);

    // Try exact match first
    if (employeeData.attendance[date]) {
      return employeeData.attendance[date];
    }

    // Try normalized match
    for (const [key, value] of Object.entries(employeeData.attendance)) {
      if (normalizeDate(key) === searchDate) {
        return value;
      }
    }

    return null;
  };

  const getAllPunchData = (): EmployeePunchData[] => {
    return punchData;
  };

  return (
    <PunchDataContext.Provider
      value={{
        punchData,
        setPunchData,
        getPunchDataForEmployee,
        getPunchDataForDate,
        getAllPunchData,
      }}
    >
      {children}
    </PunchDataContext.Provider>
  );
};

export const usePunchData = (): PunchDataContextType => {
  const context = useContext(PunchDataContext);
  if (!context) {
    throw new Error("usePunchData must be used within a PunchDataProvider");
  }
  return context;
};
