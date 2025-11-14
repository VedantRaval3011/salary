// app/page.tsx
"use client";

import React, { useState } from "react";
import { FileUploader } from "@/components/FileUploader";
import { EmployeeCard } from "@/components/EmployeeCard";
import { useExcel } from "@/context/ExcelContext";
import { EmployeeData } from "@/lib/types";

interface MonthConfig {
  month: string;
  year: number;
  adjustments: Array<{ originalDate: number; adjustedDate: number }>;
  holidays: number[];
}

export default function Home() {
  const { excelData, applyAdjustment, applyHolidays } = useExcel();

  // Setup wizard state
  const [setupComplete, setSetupComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Month configuration
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Adjustment configuration
  const [adjustments, setAdjustments] = useState<
    Array<{ originalDate: number; adjustedDate: number }>
  >([]);
  const [currentOriginalDate, setCurrentOriginalDate] = useState("");
  const [currentAdjustedDate, setCurrentAdjustedDate] = useState("");

  // Holiday configuration
  const [numberOfHolidays, setNumberOfHolidays] = useState(0);
  const [selectedHolidays, setSelectedHolidays] = useState<number[]>([]);
  const [currentHoliday, setCurrentHoliday] = useState("");

  // Track if configurations have been applied
  const [configurationsApplied, setConfigurationsApplied] = useState(false);

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const years = Array.from(
    { length: 10 },
    (_, i) => new Date().getFullYear() - 5 + i
  );

  // Get days in selected month
  const getDaysInMonth = () => {
    if (!selectedMonth || !selectedYear) return 31;
    const monthIndex = months.indexOf(selectedMonth);
    return new Date(selectedYear, monthIndex + 1, 0).getDate(); // This correctly returns 31 for October
  };

  const daysInMonth = getDaysInMonth();
  const availableDates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Add adjustment
  const handleAddAdjustment = () => {
    const original = parseInt(currentOriginalDate);
    const adjusted = parseInt(currentAdjustedDate);

    if (!original || !adjusted) {
      alert("Please select both original and adjusted dates");
      return;
    }

    if (original === adjusted) {
      alert("Original and adjusted dates cannot be the same");
      return;
    }

    if (
      adjustments.some(
        (adj) => adj.originalDate === original || adj.adjustedDate === original
      )
    ) {
      alert("This date is already used in an adjustment");
      return;
    }

    if (
      adjustments.some(
        (adj) => adj.originalDate === adjusted || adj.adjustedDate === adjusted
      )
    ) {
      alert("This date is already used in an adjustment");
      return;
    }

    setAdjustments([
      ...adjustments,
      { originalDate: original, adjustedDate: adjusted },
    ]);
    setCurrentOriginalDate("");
    setCurrentAdjustedDate("");
  };

  // Remove adjustment
  const handleRemoveAdjustment = (index: number) => {
    setAdjustments(adjustments.filter((_, i) => i !== index));
  };

  // Add holiday
  const handleAddHoliday = () => {
    const holiday = parseInt(currentHoliday);

    if (!holiday) {
      alert("Please select a holiday date");
      return;
    }

    if (selectedHolidays.includes(holiday)) {
      alert("This date is already marked as holiday");
      return;
    }

    if (
      adjustments.some(
        (adj) => adj.originalDate === holiday || adj.adjustedDate === holiday
      )
    ) {
      alert("This date is used in an adjustment");
      return;
    }

    setSelectedHolidays([...selectedHolidays, holiday].sort((a, b) => a - b));
    setCurrentHoliday("");
  };

  // Remove holiday
  const handleRemoveHoliday = (date: number) => {
    setSelectedHolidays(selectedHolidays.filter((d) => d !== date));
  };

  // Complete setup and apply configurations
  const handleCompleteSetup = () => {
    if (!selectedMonth || !selectedYear) {
      alert("Please select month and year");
      return;
    }

    setSetupComplete(true);
  };

  // Apply configurations to uploaded data
  React.useEffect(() => {
    if (excelData && setupComplete && !configurationsApplied) {
      // RESET: Clear all previous adjustments for all employees
      excelData.employees.forEach((employee) => {
        employee.adjustments = [];
        // Reset any adjustment flags on days
        employee.days.forEach((day) => {
          if (day.isAdjustmentOriginal || day.isAdjustmentTarget) {
            if (day.originalStatus) {
              day.attendance.status = day.originalStatus;
            }
            delete day.originalStatus;
            day.isAdjustmentOriginal = false;
            day.isAdjustmentTarget = false;
          }
        });
      });

      // Apply holidays to all employees first
      if (selectedHolidays.length > 0) {
        try {
          applyHolidays(selectedHolidays);
        } catch (error) {
          console.error("Error applying holidays:", error);
        }
      }

      // Apply ONLY current adjustments
      if (adjustments.length > 0) {
        excelData.employees.forEach((_, employeeIndex) => {
          adjustments.forEach((adj) => {
            try {
              applyAdjustment(
                employeeIndex,
                adj.originalDate,
                adj.adjustedDate
              );
            } catch (error) {
              console.error(
                `Error applying adjustment for employee ${employeeIndex}:`,
                error
              );
            }
          });
        });
      }

      setConfigurationsApplied(true);
    }
  }, [excelData, setupComplete, configurationsApplied]);

  // Reset setup
  const handleResetSetup = () => {
    setSetupComplete(false);
    setCurrentStep(1);
    setSelectedMonth("");
    setSelectedYear(new Date().getFullYear());
    setAdjustments([]);
    setSelectedHolidays([]);
    setNumberOfHolidays(0);
    setConfigurationsApplied(false);
  };

  // Render setup wizard
  if (!setupComplete) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              📊 Attendance Data Setup
            </h1>
            <p className="text-gray-600">
              Configure month, adjustments, and holidays before uploading files
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              {[1, 2, 3].map((step) => (
                <React.Fragment key={step}>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                      currentStep === step
                        ? "bg-blue-600 text-white ring-4 ring-blue-200"
                        : currentStep > step
                        ? "bg-green-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {currentStep > step ? "✓" : step}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-16 h-1 ${
                        currentStep > step ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            {/* Step 1: Month Selection */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <span className="text-blue-600">📅</span>
                  Step 1: Select Month & Year
                </h2>
                <p className="text-gray-600 mb-6">
                  Choose the month and year for which you're processing
                  attendance data
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Month Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Month
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    >
                      <option value="">-- Select Month --</option>
                      {months.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Year Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Year
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) =>
                        setSelectedYear(parseInt(e.target.value))
                      }
                      className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                    >
                      {years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedMonth && selectedYear && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-blue-800 font-semibold">
                      ✓ Selected: {selectedMonth} {selectedYear} ({daysInMonth}{" "}
                      days)
                    </p>
                  </div>
                )}

                <div className="flex justify-end mt-8">
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!selectedMonth || !selectedYear}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Next: Adjustments →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Adjustment Days */}
            {currentStep === 2 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <span className="text-orange-600">🔄</span>
                  Step 2: Adjustment Days
                </h2>
                <p className="text-gray-600 mb-6">
                  Set up day adjustments where holidays/week-offs are swapped
                  with working days
                </p>

                {/* Add Adjustment Form */}
                <div className="bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-lg border-2 border-orange-200 mb-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">
                    Add New Adjustment
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">
                        Original Date (Holiday/Week Off)
                      </label>
                      <select
                        value={currentOriginalDate}
                        onChange={(e) => setCurrentOriginalDate(e.target.value)}
                        className="w-full p-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">-- Select Date --</option>
                        {availableDates.map((date) => (
                          <option key={date} value={date}>
                            {date}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-2">
                        Adjusted Date (Will become Holiday)
                      </label>
                      <select
                        value={currentAdjustedDate}
                        onChange={(e) => setCurrentAdjustedDate(e.target.value)}
                        className="w-full p-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">-- Select Date --</option>
                        {availableDates.map((date) => (
                          <option key={date} value={date}>
                            {date}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleAddAdjustment}
                    className="mt-4 w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all"
                  >
                    + Add Adjustment
                  </button>
                </div>

                {/* Adjustments List */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">
                    Configured Adjustments ({adjustments.length})
                  </h3>
                  {adjustments.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-lg text-center border-2 border-dashed border-gray-300">
                      <p className="text-gray-500 text-sm">
                        No adjustments added yet (Optional)
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {adjustments.map((adj, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-orange-400 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span className="bg-orange-500 text-white px-3 py-1 rounded-md font-bold text-sm">
                              {adj.originalDate}
                            </span>
                            <span className="text-orange-600">→</span>
                            <span className="bg-green-500 text-white px-3 py-1 rounded-md font-bold text-sm">
                              {adj.adjustedDate}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveAdjustment(index)}
                            className="px-3 py-1 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between mt-8">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
                  >
                    Next: Holidays →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Holidays */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <span className="text-green-600">🎉</span>
                  Step 3: Holiday Dates
                </h2>
                <p className="text-gray-600 mb-6">
                  Select the dates that should be marked as holidays for all
                  employees
                </p>

                {/* Number of Holidays */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border-2 border-green-200 mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Number of Holidays
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={daysInMonth}
                    value={numberOfHolidays}
                    onChange={(e) =>
                      setNumberOfHolidays(parseInt(e.target.value) || 0)
                    }
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-base"
                    placeholder="e.g., 3"
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    ℹ️ Currently {selectedHolidays.length} of {numberOfHolidays}{" "}
                    holidays selected
                  </p>
                </div>

                {/* Add Holiday Form */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200 mb-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">
                    Add Holiday Date
                  </h3>
                  <div className="flex gap-3">
                    <select
                      value={currentHoliday}
                      onChange={(e) => setCurrentHoliday(e.target.value)}
                      className="flex-1 p-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Holiday Date --</option>
                      {availableDates.map((date) => (
                        <option
                          key={date}
                          value={date}
                          disabled={selectedHolidays.includes(date)}
                        >
                          {date}{" "}
                          {selectedHolidays.includes(date)
                            ? "(Already added)"
                            : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddHoliday}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-all"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Holidays List */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">
                    Selected Holidays ({selectedHolidays.length})
                  </h3>
                  {selectedHolidays.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-lg text-center border-2 border-dashed border-gray-300">
                      <p className="text-gray-500 text-sm">
                        No holidays added yet (Optional)
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedHolidays.map((date) => (
                        <div
                          key={date}
                          className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-2 rounded-lg border border-blue-300"
                        >
                          <span className="font-bold">{date}</span>
                          <button
                            onClick={() => handleRemoveHoliday(date)}
                            className="text-red-600 hover:text-red-800 font-bold text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-between mt-8">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleCompleteSetup}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all"
                  >
                    ✓ Complete Setup
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Summary Card */}
          {currentStep === 3 && (
            <div className="mt-6 bg-white rounded-xl shadow-lg p-6 border-2 border-blue-300">
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                📋 Configuration Summary
              </h3>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Month:</strong> {selectedMonth} {selectedYear} (
                  {daysInMonth} days)
                </p>
                <p>
                  <strong>Adjustments:</strong> {adjustments.length} configured
                </p>
                <p>
                  <strong>Holidays:</strong> {selectedHolidays.length} dates
                  marked
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // Main application after setup
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Configuration Badge */}
        <div className="mb-4 bg-white rounded-lg shadow-md p-4 flex justify-between items-center border-l-4 border-blue-600">
          <div className="flex-1">
            <p className="text-sm text-gray-600 font-semibold">
              📅 {selectedMonth} {selectedYear} ({daysInMonth} days)
            </p>
          </div>
          <button
            onClick={handleResetSetup}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-all text-sm font-semibold"
          >
            Reset Setup
          </button>
        </div>

        {/* Adjustments & Holidays Details - Minimalistic */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Adjustments Card */}
          <div className="bg-white rounded-lg shadow-sm p-4 border border-orange-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-orange-600 text-lg">🔄</span>
              <h3 className="text-sm font-bold text-gray-800">
                Adjustments ({adjustments.length})
              </h3>
            </div>
            {adjustments.length === 0 ? (
              <p className="text-xs text-gray-500">No adjustments configured</p>
            ) : (
              <div className="space-y-2">
                {adjustments.map((adj, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-xs bg-orange-50 p-2 rounded border border-orange-200"
                  >
                    <span className="font-bold text-orange-700">
                      {adj.originalDate}
                    </span>
                    <span className="text-orange-500">→</span>
                    <span className="font-bold text-green-700">
                      {adj.adjustedDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Holidays Card */}
          <div className="bg-white rounded-lg shadow-sm p-4 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-blue-600 text-lg">🎉</span>
              <h3 className="text-sm font-bold text-gray-800">
                Holidays ({selectedHolidays.length})
              </h3>
            </div>
            {selectedHolidays.length === 0 ? (
              <p className="text-xs text-gray-500">No holidays marked</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedHolidays.map((date) => (
                  <span
                    key={date}
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold border border-blue-300"
                  >
                    {date}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <FileUploader />

        {excelData && (
          <div className="mt-8">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  {excelData.title}
                </h1>
                <p className="text-gray-600">{excelData.period}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Total Employees: {excelData.employees.length}
                </p>
              </div>
            </div>

            {/* Employee Cards */}
            <div className="space-y-4">
              {excelData.employees.map(
                (employee: EmployeeData, index: number) => (
                  <EmployeeCard
                    key={employee.empCode}
                    employee={employee}
                    index={index}
                    baseHolidaysCount={0}
                    selectedHolidaysCount={selectedHolidays.length}
                  />
                )
              )}
            </div>
          </div>
        )}

        {!excelData && (
          <div className="mt-12 text-center text-gray-500">
            <p className="text-lg">
              Upload Excel files to process attendance data
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
