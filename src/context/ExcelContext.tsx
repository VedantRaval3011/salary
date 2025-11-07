// context/ExcelContext.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ProcessedExcelData, EmployeeData, DayAttendance, AdjustmentDay } from '@/lib/types';

interface ExcelContextType {
  excelData: ProcessedExcelData | null;
  setExcelData: (data: ProcessedExcelData | null) => void;
  clearData: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  applyAdjustment: (employeeIndex: number, originalDate: number, adjustedDate: number) => void;
  applyHolidays: (holidayDates: number[]) => void;
  removeAdjustment: (employeeIndex: number, adjustmentIndex: number) => void;
}

const ExcelContext = createContext<ExcelContextType | undefined>(undefined);

export const ExcelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [excelData, setExcelData] = useState<ProcessedExcelData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearData = () => {
    setExcelData(null);
  };

  const applyAdjustment = (
    employeeIndex: number,
    originalDate: number,
    adjustedDate: number
  ) => {
    if (!excelData) return;

    const updatedEmployees = [...excelData.employees];
    const employee = updatedEmployees[employeeIndex];

    // Find the days
    const originalDay = employee.days.find((d) => d.date === originalDate);
    const adjustedDay = employee.days.find((d) => d.date === adjustedDate);

    if (!originalDay || !adjustedDay) {
      throw new Error('One or both dates not found');
    }

    // Store original statuses if not already stored
    if (!originalDay.originalStatus) {
      originalDay.originalStatus = originalDay.attendance.status;
    }
    if (!adjustedDay.originalStatus) {
      adjustedDay.originalStatus = adjustedDay.attendance.status;
    }

    // Update statuses
    originalDay.attendance.status = 'adj-P';
    originalDay.isAdjustmentOriginal = true;
    originalDay.isAdjustmentTarget = false;

    adjustedDay.attendance.status = 'adj-M/WO-I';
    adjustedDay.isAdjustmentTarget = true;
    adjustedDay.isAdjustmentOriginal = false;

    // Add adjustment record
    const adjustment: AdjustmentDay = {
      originalDate,
      adjustedDate,
      timestamp: new Date().toISOString(),
    };

    if (!employee.adjustments) {
      employee.adjustments = [];
    }
    employee.adjustments.push(adjustment);

    // Recalculate totals
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
          // Store original status if not already stored
          if (!day.originalStatus) {
            day.originalStatus = day.attendance.status;
          }

          // Mark as holiday
          day.attendance.status = 'H';
          day.isHoliday = true;
        }
      });

      // Recalculate totals
      recalculateEmployeeTotals(updatedEmployee);

      return updatedEmployee;
    });

    setExcelData({ ...excelData, employees: updatedEmployees });
  };

  const removeAdjustment = (employeeIndex: number, adjustmentIndex: number) => {
    if (!excelData) return;

    const updatedEmployees = [...excelData.employees];
    const employee = updatedEmployees[employeeIndex];

    if (!employee.adjustments) return;

    const adjustment = employee.adjustments[adjustmentIndex];
    const originalDay = employee.days.find((d) => d.date === adjustment.originalDate);
    const adjustedDay = employee.days.find((d) => d.date === adjustment.adjustedDate);

    if (originalDay && originalDay.originalStatus) {
      originalDay.attendance.status = originalDay.originalStatus;
      originalDay.isAdjustmentOriginal = false;
    }

    if (adjustedDay && adjustedDay.originalStatus) {
      adjustedDay.attendance.status = adjustedDay.originalStatus;
      adjustedDay.isAdjustmentTarget = false;
    }

    employee.adjustments.splice(adjustmentIndex, 1);
    recalculateEmployeeTotals(employee);

    updatedEmployees[employeeIndex] = employee;
    setExcelData({ ...excelData, employees: updatedEmployees });
  };

  const recalculateEmployeeTotals = (employee: EmployeeData) => {
    let present = 0;
    let absent = 0;
    let holiday = 0;
    let weekOff = 0;
    let od = 0;
    let leave = 0;

    employee.days.forEach((day) => {
      const status = day.attendance.status.toUpperCase();
      
      if (status === 'P' || status === 'ADJ-P') {
        present += 1;
      } else if (status === 'A') {
        absent += 1;
      } else if (status === 'H' || status === 'ADJ-M/WO-I') {
        holiday += 1;
      } else if (status === 'WO') {
        weekOff += 1;
      } else if (status === 'OD') {
        od += 1;
      } else if (status === 'LEAVE') {
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
        applyHolidays,
        removeAdjustment,
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