// components/HolidayManagementModal.tsx
"use client";

import React, { useState, useMemo } from "react";
import { EmployeeData } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext";

interface HolidayManagementModalProps {
  employees: EmployeeData[];
  isOpen: boolean;
  onClose: () => void;
}

export const HolidayManagementModal: React.FC<HolidayManagementModalProps> = ({
  employees: initialEmployees,
  isOpen,
  onClose,
}) => {
  const { applyHolidays, excelData } = useExcel();
  const [numberOfHolidays, setNumberOfHolidays] = useState<number>(0);
  const [selectedDates, setSelectedDates] = useState<Set<number>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Use excelData.employees instead of prop to get fresh data
  const employees = excelData?.employees || initialEmployees;

  // Get all unique dates across all employees
  const allUniqueDates = useMemo(() => {
    const dates = new Set<number>();
    employees.forEach((emp) => {
      emp.days.forEach((day) => {
        dates.add(day.date);
      });
    });
    return Array.from(dates).sort((a, b) => a - b);
  }, [employees]);

  // Get day of week for a date
  const getDayOfWeek = (dateNum: number): string => {
    for (const emp of employees) {
      const day = emp.days.find((d) => d.date === dateNum);
      if (day) return day.day;
    }
    return "?";
  };

  // Get eligible dates (not Saturdays, not already holidays/adjusted)
  const eligibleDates = useMemo(() => {
    return allUniqueDates.filter((dateNum) => {
      const dayOfWeek = getDayOfWeek(dateNum);
      
      // Skip Saturdays
      if (dayOfWeek.toLowerCase() === "sa") return false;

      // Check if this date is available across all employees
      for (const emp of employees) {
        const day = emp.days.find((d) => d.date === dateNum);
        if (!day) return false;

        const status = day.attendance.status.toUpperCase();

        // Skip if already a holiday or adjusted
        if (
          status === "H" ||
          status === "WO" ||
          status === "ADJ-P" ||
          status === "ADJ-M/WO-I" ||
          day.isAdjustmentOriginal ||
          day.isAdjustmentTarget ||
          day.isHoliday
        ) {
          return false;
        }
      }

      return true;
    });
  }, [employees, allUniqueDates]);

  // Toggle date selection
  const toggleDateSelection = (date: number) => {
    const newSelected = new Set(selectedDates);
    if (newSelected.has(date)) {
      newSelected.delete(date);
    } else {
      if (newSelected.size < numberOfHolidays) {
        newSelected.add(date);
      } else {
        setErrorMessage(
          `You can only select ${numberOfHolidays} date${
            numberOfHolidays > 1 ? "s" : ""
          }`
        );
        setTimeout(() => setErrorMessage(""), 3000);
        return;
      }
    }
    setSelectedDates(newSelected);
  };

  // Handle number of holidays change
  const handleNumberChange = (value: number) => {
    setNumberOfHolidays(value);
    // Clear selections if new number is less than current selections
    if (value < selectedDates.size) {
      setSelectedDates(new Set());
    }
    setErrorMessage("");
    setSuccessMessage("");
  };

  // Handle apply
  const handleApply = () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (numberOfHolidays <= 0) {
      setErrorMessage("Please enter a valid number of holidays");
      return;
    }

    if (selectedDates.size !== numberOfHolidays) {
      setErrorMessage(
        `Please select exactly ${numberOfHolidays} date${
          numberOfHolidays > 1 ? "s" : ""
        }`
      );
      return;
    }

    try {
      applyHolidays(Array.from(selectedDates));
      setSuccessMessage(
        `✓ Successfully applied ${numberOfHolidays} holiday${
          numberOfHolidays > 1 ? "s" : ""
        } to all ${employees.length} employees!`
      );
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        handleReset();
        onClose();
      }, 2000);
    } catch (error: any) {
      setErrorMessage(error.message || "Error applying holidays");
    }
  };

  // Reset form
  const handleReset = () => {
    setNumberOfHolidays(0);
    setSelectedDates(new Set());
    setErrorMessage("");
    setSuccessMessage("");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-screen overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="border-b-2 border-gray-200 pb-4 mb-5">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-blue-600">🎉</span>
            Holiday Management - All {employees.length} Employees
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            Set holidays for all employees at once. Select dates to mark as
            holidays.
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-r">
            <p className="text-green-800 font-semibold text-sm flex items-center gap-2">
              <span>✓</span>
              {successMessage}
            </p>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r">
            <p className="text-red-800 font-semibold text-sm flex items-center gap-2">
              <span>⚠️</span>
              {errorMessage}
            </p>
          </div>
        )}

        {/* Number Input Section */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-5 mb-5">
          <label className="block text-sm font-bold mb-3 text-gray-800">
            📊 Number of Holidays:
          </label>
          <input
            type="number"
            min="0"
            max={eligibleDates.length}
            value={numberOfHolidays || ""}
            onChange={(e) => handleNumberChange(Number(e.target.value) || 0)}
            placeholder="Enter number of holidays"
            className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <p className="text-xs text-gray-600 mt-2">
            Available eligible dates: {eligibleDates.length}
          </p>
        </div>

        {/* Date Selection Section */}
        {numberOfHolidays > 0 && (
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 rounded-xl p-5 mb-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                  📅
                </span>
                Select {numberOfHolidays} Date{numberOfHolidays > 1 ? "s" : ""}
              </h3>
              <div className="text-sm font-semibold">
                <span className="text-purple-600">
                  {selectedDates.size} / {numberOfHolidays}
                </span>{" "}
                <span className="text-gray-600">selected</span>
              </div>
            </div>

            {eligibleDates.length === 0 ? (
              <div className="bg-white p-6 rounded-lg text-center border-2 border-dashed border-gray-300">
                <div className="text-gray-300 text-4xl mb-2">📅</div>
                <p className="text-sm text-gray-500">
                  No eligible dates available for holidays
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2 max-h-96 overflow-y-auto p-2">
                {eligibleDates.map((date) => {
                  const isSelected = selectedDates.has(date);
                  const dayOfWeek = getDayOfWeek(date);

                  return (
                    <button
                      key={date}
                      onClick={() => toggleDateSelection(date)}
                      className={`p-3 rounded-lg border-2 transition-all font-bold text-sm ${
                        isSelected
                          ? "bg-purple-500 text-white border-purple-700 shadow-lg scale-105"
                          : "bg-white text-gray-700 border-gray-300 hover:border-purple-400 hover:bg-purple-50"
                      }`}
                    >
                      <div className="text-lg">{date}</div>
                      <div className="text-xs opacity-80">{dayOfWeek}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {numberOfHolidays > 0 && selectedDates.size > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-400 shadow-md mb-5">
            <p className="text-green-800 text-sm font-bold mb-3 flex items-center gap-2">
              <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                ✓
              </span>
              Holiday Summary
            </p>
            <div className="bg-white p-3 rounded border-2 border-green-200">
              <div className="text-xs font-semibold text-gray-600 mb-2">
                Selected Holiday Dates:
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(selectedDates)
                  .sort((a, b) => a - b)
                  .map((date) => (
                    <span
                      key={date}
                      className="bg-blue-500 text-white px-3 py-1 rounded-full font-bold text-sm flex items-center gap-1"
                    >
                      {date} ({getDayOfWeek(date)})
                    </span>
                  ))}
              </div>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs text-blue-800 font-semibold">
                🔄 These dates will be marked as holidays for all{" "}
                {employees.length} employees
              </p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-4 pt-4 border-t-2 border-gray-200">
          <button
            onClick={handleApply}
            disabled={
              numberOfHolidays <= 0 ||
              selectedDates.size !== numberOfHolidays ||
              successMessage !== ""
            }
            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <span>✓</span>
            Apply Holidays to All {employees.length} Employees
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg font-bold text-sm hover:from-yellow-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            Reset
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-bold text-sm hover:from-gray-600 hover:to-gray-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <span>✕</span>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};