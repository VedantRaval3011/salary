"use client";

import React, { useState, useMemo } from "react";
import { EmployeeData, STATUS_CODES } from "@/lib/types";
import { useExcel } from "@/context/ExcelContext";

interface BulkAdjustmentDayModalProps {
  employees: EmployeeData[];
  isOpen: boolean;
  onClose: () => void;
}

export const BulkAdjustmentDayModal: React.FC<BulkAdjustmentDayModalProps> = ({
  employees: initialEmployees,
  isOpen,
  onClose,
}) => {
  const { applyAdjustment, excelData } = useExcel();
  const [selectedOriginal, setSelectedOriginal] = useState<number | null>(null);
  const [selectedAdjusted, setSelectedAdjusted] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [processingCount, setProcessingCount] = useState<number>(0);

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

  // Get all unique days of week
  const getDayOfWeek = (dateNum: number): string => {
    for (const emp of employees) {
      const day = emp.days.find((d) => d.date === dateNum);
      if (day) return day.day;
    }
    return "?";
  };

  // Filter eligible adjusted dates (dates that are not already adjusted)
  const eligibleAdjustedDates = useMemo(() => {
    if (selectedOriginal === null) return [];

    return allUniqueDates.filter((dateNum) => {
      if (dateNum === selectedOriginal) return false;

      // Check if this date is available across all employees
      for (const emp of employees) {
        const day = emp.days.find((d) => d.date === dateNum);
        if (!day) return false;

        const status = day.attendance.status.toUpperCase();

        // Skip if already adjusted
        if (
          status === "ADJ-P" ||
          status === "ADJ-M/WO-I" ||
          day.isAdjustmentOriginal ||
          day.isAdjustmentTarget
        ) {
          return false;
        }
      }

      return true;
    });
  }, [selectedOriginal, employees, allUniqueDates]);

  // Get details for the selected original date
  const getDateDetails = (dateNum: number) => {
    const sampleDay = employees[0]?.days.find((d) => d.date === dateNum);
    if (!sampleDay) return null;

    const isSaturday = sampleDay.day.toLowerCase() === "sa";
    const statuses = new Map<string, number>();

    employees.forEach((emp) => {
      const day = emp.days.find((d) => d.date === dateNum);
      if (day) {
        const status = day.attendance.status;
        statuses.set(status, (statuses.get(status) || 0) + 1);
      }
    });

    return {
      date: dateNum,
      day: sampleDay.day,
      isSaturday,
      statuses: Object.fromEntries(statuses),
    };
  };

  const originalDateDetails = getDateDetails(selectedOriginal ?? 0);

  const handleApply = () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (selectedOriginal === null) {
      setErrorMessage("Please select an original date");
      return;
    }

    if (selectedAdjusted === null) {
      setErrorMessage("Please select an adjusted date");
      return;
    }

    if (selectedOriginal === selectedAdjusted) {
      setErrorMessage("Dates cannot be the same");
      return;
    }

    // Validate all employees have both dates
    for (const emp of employees) {
      const origDay = emp.days.find((d) => d.date === selectedOriginal);
      const adjDay = emp.days.find((d) => d.date === selectedAdjusted);

      if (!origDay || !adjDay) {
        setErrorMessage(
          `Employee ${emp.empName} missing one of the selected dates`
        );
        return;
      }

      if (emp.adjustments) {
        const hasOverlap = emp.adjustments.some(
          (adj) =>
            adj.originalDate === selectedOriginal ||
            adj.adjustedDate === selectedOriginal ||
            adj.originalDate === selectedAdjusted ||
            adj.adjustedDate === selectedAdjusted
        );

        if (hasOverlap) {
          setErrorMessage(
            `Employee ${emp.empName} already has an adjustment involving these dates`
          );
          return;
        }
      }
    }

    // Apply adjustment to ALL employees
    let successCount = 0;
    try {
      employees.forEach((emp, index) => {
        applyAdjustment(index, selectedOriginal, selectedAdjusted);
        successCount++;
      });

      setProcessingCount(successCount);
      setSuccessMessage(
        `✓ Adjustment applied successfully to ${successCount} employees!`
      );
      setSelectedOriginal(null);
      setSelectedAdjusted(null);

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error: any) {
      setErrorMessage(error.message || "Error applying bulk adjustment");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-4xl w-full max-h-screen overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="border-b-2 border-gray-200 pb-4 mb-5">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-blue-600">📅</span>
            Bulk Adjustment - All {employees.length} Employees
          </h2>
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

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* LEFT: Date Selection */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 text-gray-800 flex items-center gap-2">
              <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                📍
              </span>
              Select Dates for All Employees
            </h3>

            {/* Original Date Selection */}
            <div className="mb-4">
              <label className="block text-sm font-bold mb-2 text-gray-700">
                Original Date (from):
              </label>
              <select
                value={selectedOriginal ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedOriginal(value ? Number(value) : null);
                }}
                className="w-full p-2.5 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hover:border-blue-400 transition-colors">
                <option value="">-- Select Original Date --</option>
                {allUniqueDates.map((date) => (
                  <option key={date} value={date}>
                    {date} ({getDayOfWeek(date)})
                  </option>
                ))}
              </select>
            </div>

            {/* Adjusted Date Selection */}
            <div>
              <label className="block text-sm font-bold mb-2 text-gray-700">
                Adjusted Date (to):
              </label>
              <select
                value={selectedAdjusted ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedAdjusted(value ? Number(value) : null);
                }}
                disabled={selectedOriginal === null}
                className="w-full p-2.5 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white hover:border-green-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed">
                <option value="">-- Select Adjusted Date --</option>
                {eligibleAdjustedDates.length === 0 &&
                selectedOriginal !== null ? (
                  <option disabled>No eligible dates available</option>
                ) : (
                  eligibleAdjustedDates.map((date) => (
                    <option key={date} value={date}>
                      {date} ({getDayOfWeek(date)})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* RIGHT: Original Date Details */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border-2 border-blue-300 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 text-gray-800 flex items-center gap-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                📋
              </span>
              Original Date Details
            </h3>

            {originalDateDetails ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 block mb-1">
                      Date
                    </span>
                    <div className="font-bold text-blue-600 text-lg">
                      {originalDateDetails.date}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 block mb-1">
                      Day
                    </span>
                    <div className="font-bold text-gray-800">
                      {originalDateDetails.day}
                    </div>
                  </div>
                </div>

                {originalDateDetails.isSaturday && (
                  <div className="p-2 bg-purple-200 rounded border-l-4 border-purple-600">
                    <p className="text-purple-900 text-xs font-bold">
                      🗓️ Saturday (Holiday)
                    </p>
                  </div>
                )}

                <div className="bg-white p-2 rounded border border-gray-200">
                  <span className="text-xs font-semibold text-gray-500 block mb-2">
                    Status Distribution
                  </span>
                  <div className="space-y-1">
                    {Object.entries(originalDateDetails.statuses).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          className="flex justify-between text-xs">
                          <span className="font-semibold">{status}:</span>
                          <span className="bg-blue-100 px-2 py-0.5 rounded">
                            {count} employees
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-6 rounded text-center border-2 border-dashed border-gray-300">
                <div className="text-gray-300 text-4xl mb-2">📍</div>
                <p className="text-xs text-gray-500">
                  Select an original date to view details
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {selectedOriginal !== null && selectedAdjusted !== null && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-400 shadow-md mb-5">
            <p className="text-green-800 text-sm font-bold mb-3 flex items-center gap-2">
              <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                ✓
              </span>
              Bulk Adjustment Summary
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded border-2 border-green-200">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  Original Date:
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded font-bold text-sm">
                    {selectedOriginal}
                  </span>
                  <span className="text-gray-600">→</span>
                  <span className="bg-lime-400 text-lime-900 px-3 py-1 rounded font-bold text-xs">
                    adj-P
                  </span>
                </div>
              </div>
              <div className="bg-white p-3 rounded border-2 border-green-200">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  Adjusted Date:
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-orange-500 text-white px-3 py-1 rounded font-bold text-sm">
                    {selectedAdjusted}
                  </span>
                  <span className="text-gray-600">→</span>
                  <span className="bg-orange-400 text-orange-900 px-3 py-1 rounded font-bold text-xs">
                    adj-H
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs text-blue-800 font-semibold">
                🔄 This adjustment will be applied to all {employees.length}{" "}
                employees
              </p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-4 pt-4 border-t-2 border-gray-200">
          <button
            onClick={handleApply}
            disabled={
              selectedOriginal === null ||
              selectedAdjusted === null ||
              successMessage !== ""
            }
            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2">
            <span>✓</span>
            Apply to All {employees.length} Employees
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-bold text-sm hover:from-gray-600 hover:to-gray-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2">
            <span>✕</span>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
