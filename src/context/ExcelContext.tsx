'use client';

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  ProcessedExcelData,
  EmployeeData,
  DayAttendance,
  AdjustmentDay,
  UploadedFile,
  FileContext,
  PaidLeaveData,
} from "@/lib/types";
import { normalizeEmpCode } from "@/utils/normalizeEmpCode";

interface ExcelContextType {
  excelData: ProcessedExcelData | null;
  setExcelData: (data: ProcessedExcelData | null) => void;
  clearData: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  applyAdjustment: (
    employeeIndex: number,
    originalDate: number,
    adjustedDate: number
  ) => void;
  removeAdjustment: (employeeIndex: number, adjustmentIndex: number) => void;
  applyHolidays: (holidayDates: number[]) => void;

  // File context
  fileContext: FileContext;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (fileId: string) => void;
  updateFileStatus: (
    fileId: string,
    status: "pending" | "processing" | "success" | "error",
    error?: string
  ) => void;
  updateFileData: (fileId: string, data: ProcessedExcelData) => void;
  updatePaidLeaveData: (fileId: string, paid: PaidLeaveData[]) => void; // NEW
  getUploadedFile: (fileId: string) => UploadedFile | null;
  getAllUploadedFiles: () => UploadedFile[];
  clearAllFiles: () => void;
  getFilesByType: (type: "required" | "optional") => UploadedFile[];
  mergePaidLeaveData: (paidLeaveData: PaidLeaveData[]) => void;
}

const ExcelContext = createContext<ExcelContextType | undefined>(undefined);

export const ExcelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [excelData, setExcelData] = useState<ProcessedExcelData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fileContext, setFileContext] = useState<FileContext>({});

  const clearData = () => {
    setExcelData(null);
  };

  const addUploadedFile = (file: UploadedFile) => {
    setFileContext((prev) => ({
      ...prev,
      [file.id]: file,
    }));
  };

  const removeUploadedFile = (fileId: string) => {
    setFileContext((prev) => {
      const updated = { ...prev };
      delete updated[fileId];
      return updated;
    });
  };

  const updateFileStatus = (
    fileId: string,
    status: "pending" | "processing" | "success" | "error",
    error?: string
  ) => {
    setFileContext((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        status,
        error,
      },
    }));
  };

  const updateFileData = (fileId: string, data: ProcessedExcelData) => {
    setFileContext((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        data,
        status: "success",
      },
    }));
  };

  const updatePaidLeaveData = (fileId: string, paid: PaidLeaveData[]) => {
    setFileContext((prev) => ({
      ...prev,
      [fileId]: {
        ...prev[fileId],
        paidLeaveData: paid,
        status: "success",
      },
    }));
  };

  const getUploadedFile = (fileId: string): UploadedFile | null => {
    return fileContext[fileId] || null;
  };

  const getAllUploadedFiles = (): UploadedFile[] => {
    return Object.values(fileContext);
  };

  const getFilesByType = (type: "required" | "optional"): UploadedFile[] => {
    return Object.values(fileContext).filter((f) => f.fileType === type);
  };

  const clearAllFiles = () => {
    setFileContext({});
  };

  /** Merge Paid Leave rows into current employees using normalized emp codes. */
// inside ExcelProvider
const mergePaidLeaveData = (paidLeaveData: PaidLeaveData[]) => {
  if (!excelData) return;

  // Helpers to normalize codes/names aggressively
  const canon = (s: string) => (s || "").toUpperCase().trim();
  const stripNonAlnum = (s: string) => canon(s).replace(/[^A-Z0-9]/g, "");
  const numericOnly = (s: string) => (s.match(/\d+/g)?.join("") ?? "");
  const dropLeadingZeros = (s: string) => s.replace(/^0+/, "");

  // Build multiple keys for each PL row
  type PLRec = PaidLeaveData & { _keys: string[]; _nameKey: string };
  const plWithKeys: PLRec[] = paidLeaveData.map((pl) => {
    const raw = canon(pl.empCode);
    const s1 = stripNonAlnum(raw);
    const num = numericOnly(raw);
    const no0 = dropLeadingZeros(num);
    // also try some padded variants (common 4–6 width)
    const pads = [4, 5, 6].map(w => num.padStart(w, "0"));
    const k = new Set<string>([
      raw, s1, num, no0,
      ...pads,
      `S:${raw}`, `S:${s1}`, `N:${num}`, `Z:${no0}`,
    ]);
    return { ...pl, _keys: Array.from(k), _nameKey: stripNonAlnum(pl.empName) };
  });

  // Index PL by every key
  const plIndex = new Map<string, PLRec>();
  plWithKeys.forEach(pl => {
    pl._keys.forEach(k => {
      if (!plIndex.has(k)) plIndex.set(k, pl);
    });
  });

  // Also index by name (but keep possible multiples)
  const nameIndex = new Map<string, PLRec[]>();
  plWithKeys.forEach(pl => {
    const arr = nameIndex.get(pl._nameKey) ?? [];
    arr.push(pl);
    nameIndex.set(pl._nameKey, arr);
  });

  const updatedEmployees = excelData.employees.map((emp) => {
    const raw = canon(emp.empCode);
    const s1 = stripNonAlnum(raw);
    const num = numericOnly(raw);
    const no0 = dropLeadingZeros(num);
    const pads = [4, 5, 6].map(w => num.padStart(w, "0"));
    const candidateKeys = [raw, s1, num, no0, ...pads, `S:${raw}`, `S:${s1}`, `N:${num}`, `Z:${no0}`];

    // 1) Try code-based matches (first hit wins)
    let match: PLRec | undefined = candidateKeys.map(k => plIndex.get(k)).find(Boolean);

    // 2) Fallback: exact-ish name match if unique
    if (!match) {
      const nameKey = stripNonAlnum(emp.empName);
      const options = nameIndex.get(nameKey) ?? [];
      if (options.length === 1) {
        match = options[0];
      } else if (options.length > 1) {
        // pick the one whose numeric-only code matches best
        const best = options.find(o => numericOnly(o.empCode) === num) ||
                     options.find(o => dropLeadingZeros(numericOnly(o.empCode)) === no0);
        if (best) match = best;
      }
    }

    if (!match) {
      console.warn(`[PaidLeave] No match for code="${emp.empCode}" name="${emp.empName}"`);
    }

    return { ...emp, paidLeave: match ? match.paidDays : 0 };
  });

  setExcelData({ ...excelData, employees: updatedEmployees });
};


  const applyAdjustment = (
    employeeIndex: number,
    originalDate: number,
    adjustedDate: number
  ) => {
    if (!excelData) return;

    const updatedEmployees = [...excelData.employees];
    const employee = updatedEmployees[employeeIndex];

    const originalDay = employee.days.find((d) => d.date === originalDate);
    const adjustedDay = employee.days.find((d) => d.date === adjustedDate);

    if (!originalDay || !adjustedDay) {
      throw new Error("One or both dates not found");
    }

    if (!originalDay.originalStatus) {
      originalDay.originalStatus = originalDay.attendance.status;
    }
    if (!adjustedDay.originalStatus) {
      adjustedDay.originalStatus = adjustedDay.attendance.status;
    }

    originalDay.attendance.status = "ADJ-P";
    originalDay.isAdjustmentOriginal = true;
    originalDay.isAdjustmentTarget = false;

    adjustedDay.attendance.status = "ADJ-M/WO-I";
    adjustedDay.isAdjustmentTarget = true;
    adjustedDay.isAdjustmentOriginal = false;

    const adjustment: AdjustmentDay = {
      originalDate,
      adjustedDate,
      timestamp: new Date().toISOString(),
    };

    if (!employee.adjustments) {
      employee.adjustments = [];
    }
    employee.adjustments.push(adjustment);

    recalculateEmployeeTotals(employee);

    updatedEmployees[employeeIndex] = employee;
    setExcelData({ ...excelData, employees: updatedEmployees });
  };

  const removeAdjustment = (employeeIndex: number, adjustmentIndex: number) => {
    if (!excelData) return;

    const updatedEmployees = [...excelData.employees];
    const employee = updatedEmployees[employeeIndex];

    if (
      !employee.adjustments ||
      adjustmentIndex < 0 ||
      adjustmentIndex >= employee.adjustments.length
    ) {
      throw new Error("Adjustment not found");
    }

    const adjustment = employee.adjustments[adjustmentIndex];

    const originalDay = employee.days.find(
      (d) => d.date === adjustment.originalDate
    );
    if (originalDay) {
      if (originalDay.originalStatus) {
        originalDay.attendance.status = originalDay.originalStatus;
        delete originalDay.originalStatus;
      }
      originalDay.isAdjustmentOriginal = false;
      originalDay.isAdjustmentTarget = false;
    }

    const adjustedDay = employee.days.find(
      (d) => d.date === adjustment.adjustedDate
    );
    if (adjustedDay) {
      if (adjustedDay.originalStatus) {
        adjustedDay.attendance.status = adjustedDay.originalStatus;
        delete adjustedDay.originalStatus;
      }
      adjustedDay.isAdjustmentTarget = false;
      adjustedDay.isAdjustmentOriginal = false;
    }

    employee.adjustments.splice(adjustmentIndex, 1);

    recalculateEmployeeTotals(employee);

    updatedEmployees[employeeIndex] = employee;
    setExcelData({ ...excelData, employees: updatedEmployees });
  };

  const applyHolidays = (holidayDates: number[]) => {
    if (!excelData) return;

    const updatedEmployees = excelData.employees.map((employee) => {
      const updatedEmployee = { ...employee };

      holidayDates.forEach((date) => {
        const day = updatedEmployee.days.find((d) => d.date === date);
        if (day) {
          if (!day.originalStatus) {
            day.originalStatus = day.attendance.status;
          }

          day.attendance.status = "H";
          day.isHoliday = true;
        }
      });

      recalculateEmployeeTotals(updatedEmployee);

      return updatedEmployee;
    });

    setExcelData({ ...excelData, employees: updatedEmployees });
  };

  // Normalize status before counting
  const recalculateEmployeeTotals = (employee: EmployeeData) => {
    let present = 0;
    let absent = 0;
    let holiday = 0;
    let weekOff = 0;
    let od = 0;
    let leave = 0;

    employee.days.forEach((day) => {
      const status = (day.attendance.status || "").toUpperCase().trim();

      if (status === "P" || status === "ADJ-P") {
        present += 1;
      } else if (status === "A") {
        absent += 1;
      } else if (status === "H" || status === "ADJ-M/WO-I") {
        holiday += 1;
      } else if (status === "WO") {
        weekOff += 1;
      } else if (status === "OD") {
        od += 1;
      } else if (status === "LEAVE") {
        leave += 1;
      }
    });

    employee.present = present;
    employee.absent = absent;
    employee.holiday = holiday;
    employee.weekOff = weekOff;
    employee.od = od;
    employee.leave = leave;
  };

  return (
    <ExcelContext.Provider
      value={{
        excelData,
        setExcelData,
        clearData,
        isLoading,
        setIsLoading,
        applyAdjustment,
        removeAdjustment,
        applyHolidays,
        fileContext,
        addUploadedFile,
        removeUploadedFile,
        updateFileStatus,
        updateFileData,
        updatePaidLeaveData,
        getUploadedFile,
        getAllUploadedFiles,
        clearAllFiles,
        getFilesByType,
        mergePaidLeaveData,
      }}
    >
      {children}
    </ExcelContext.Provider>
  );
};

export const useExcel = () => {
  const context = useContext(ExcelContext);
  if (context === undefined) {
    throw new Error("useExcel must be used within an ExcelProvider");
  }
  return context;
};
