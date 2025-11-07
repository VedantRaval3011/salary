// components/AdjustmentDayModal.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { EmployeeData, DayAttendance, STATUS_CODES } from '@/lib/types';
import { useExcel } from '@/context/ExcelContext';

interface AdjustmentDayModalProps {
  employee: EmployeeData;
  employeeIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export const AdjustmentDayModal: React.FC<AdjustmentDayModalProps> = ({
  employee,
  employeeIndex,
  isOpen,
  onClose,
}) => {
  const { applyAdjustment, removeAdjustment } = useExcel();
  const [selectedOriginal, setSelectedOriginal] = useState<number | null>(null);
  const [selectedAdjusted, setSelectedAdjusted] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const allDays = useMemo(() => {
    return [...employee.days].sort((a, b) => a.date - b.date);
  }, [employee.days]);

  const eligibleAdjustedDates = useMemo(() => {
    return employee.days.filter((day) => {
      const status = day.attendance.status.toUpperCase();

      if (
        status === STATUS_CODES.ADJUSTMENT_PRESENT.toUpperCase() ||
        status === STATUS_CODES.ADJUSTMENT_HOLIDAY.toUpperCase() ||
        status === 'ADJ-P' ||
        status === 'ADJ-M/WO-I'
      ) {
        return false;
      }

      if (day.isAdjustmentOriginal || day.isAdjustmentTarget) {
        return false;
      }

      if (selectedOriginal !== null && day.date === selectedOriginal) {
        return false;
      }

      return true;
    });
  }, [employee.days, selectedOriginal]);

  if (!isOpen) return null;

  const handleApply = () => {
    setErrorMessage('');

    if (selectedOriginal === null) {
      setErrorMessage('Please select an original date');
      return;
    }

    if (selectedAdjusted === null) {
      setErrorMessage('Please select an adjusted date');
      return;
    }

    if (selectedOriginal === selectedAdjusted) {
      setErrorMessage('Dates cannot be the same');
      return;
    }

    const originalDay = employee.days.find((d) => d.date === selectedOriginal);
    if (!originalDay) {
      setErrorMessage('Original date not found');
      return;
    }

    if (employee.adjustments) {
      const hasOverlap = employee.adjustments.some(
        (adj) =>
          adj.originalDate === selectedOriginal ||
          adj.adjustedDate === selectedOriginal ||
          adj.originalDate === selectedAdjusted ||
          adj.adjustedDate === selectedAdjusted
      );

      if (hasOverlap) {
        setErrorMessage('One or both dates are already adjusted');
        return;
      }
    }

    try {
      applyAdjustment(employeeIndex, selectedOriginal, selectedAdjusted);
      setSelectedOriginal(null);
      setSelectedAdjusted(null);
      setErrorMessage('');
      alert('✓ Adjustment applied!');
    } catch (error: any) {
      setErrorMessage(error.message || 'Error applying adjustment');
    }
  };

  const handleRemoveAdjustment = (index: number) => {
    try {
      removeAdjustment(employeeIndex, index);
      setErrorMessage('');
      alert('✓ Adjustment removed!');
    } catch (error: any) {
      setErrorMessage(error.message || 'Error removing adjustment');
    }
  };

  const selectedOriginalDay = selectedOriginal !== null 
    ? employee.days.find((d) => d.date === selectedOriginal)
    : null;

  const isSaturday = selectedOriginalDay?.day.toLowerCase() === 'sa';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-5xl w-full max-h-screen overflow-y-auto shadow-2xl">
        
        {/* Header */}
        <div className="border-b-2 border-gray-200 pb-4 mb-5">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <span className="text-blue-600">📅</span>
            Adjustment Day - {employee.empName}
          </h2>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-r">
            <p className="text-red-800 font-semibold text-sm flex items-center gap-2">
              <span>⚠️</span>
              {errorMessage}
            </p>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          
          {/* LEFT SIDE: Applied Adjustments */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-3 text-blue-800 flex items-center gap-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✓</span>
              Applied Adjustments {employee.adjustments && employee.adjustments.length > 0 && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{employee.adjustments.length}</span>
              )}
            </h3>
            
            {employee.adjustments && employee.adjustments.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {employee.adjustments.map((adj, idx) => {
                  const origDay = employee.days.find((d) => d.date === adj.originalDate);
                  const adjDay = employee.days.find((d) => d.date === adj.adjustedDate);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-200 hover:border-blue-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="bg-blue-500 text-white px-3 py-1 rounded-md font-bold text-sm whitespace-nowrap">
                          {adj.originalDate}
                        </span>
                        <span className="text-blue-600 text-lg">→</span>
                        <span className="bg-orange-500 text-white px-3 py-1 rounded-md font-bold text-sm whitespace-nowrap">
                          {adj.adjustedDate}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveAdjustment(idx)}
                        className="ml-2 px-3 py-1.5 bg-red-500 text-white text-xs rounded-md hover:bg-red-600 transition-colors whitespace-nowrap flex-shrink-0 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white p-6 rounded-lg text-center border-2 border-dashed border-blue-300">
                <div className="text-gray-400 text-4xl mb-2">📋</div>
                <p className="text-sm text-gray-600 font-medium">No adjustments applied yet</p>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Selected Date Details */}
          <div className={`rounded-xl p-4 shadow-sm border-2 transition-all ${
            selectedOriginalDay
              ? isSaturday
                ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300'
                : 'bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-300'
              : 'bg-gray-50 border-gray-300'
          }`}>
            <h3 className="text-sm font-bold mb-3 text-gray-800 flex items-center gap-2">
              <span className={`${selectedOriginalDay ? 'bg-indigo-500' : 'bg-gray-400'} text-white rounded-full w-6 h-6 flex items-center justify-center text-xs`}>
                📋
              </span>
              Original Date Details
            </h3>
            
            {selectedOriginalDay ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <span className="font-semibold text-gray-500 block text-xs mb-1">Date</span>
                    <div className="font-bold text-blue-600 text-lg">{selectedOriginalDay.date}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <span className="font-semibold text-gray-500 block text-xs mb-1">Day</span>
                    <div className="font-bold text-gray-800 text-lg">{selectedOriginalDay.day}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <span className="font-semibold text-gray-500 block text-xs mb-1">Status</span>
                    <div className="font-bold text-blue-600 text-sm">{selectedOriginalDay.attendance.status}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                    <span className="font-semibold text-gray-500 block text-xs mb-1">Shift</span>
                    <div className="font-bold text-gray-800 text-sm">{selectedOriginalDay.attendance.shift || '-'}</div>
                  </div>
                </div>
                {isSaturday && (
                  <div className="p-3 bg-purple-200 rounded-lg border-l-4 border-purple-600">
                    <p className="text-purple-900 text-sm font-bold flex items-center gap-2">
                      <span>🗓️</span>
                      Saturday (Holiday)
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-lg text-center border-2 border-dashed border-gray-300">
                <div className="text-gray-300 text-5xl mb-2">📍</div>
                <p className="text-sm text-gray-500 font-medium">Select an original date to view details</p>
              </div>
            )}
          </div>
        </div>

        {/* Selection Section - Enhanced UI */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-5 shadow-lg">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="bg-indigo-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">⚙</span>
            Create New Adjustment
          </h3>

          {/* Original Date & Adjusted Date in one row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Original Date Selection */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-200">
              <label className="block text-sm font-bold mb-2 text-gray-700 flex items-center gap-1">
                <span className="text-blue-600">📍</span>
                Original Date
              </label>
              <select
                value={selectedOriginal ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedOriginal(value ? Number(value) : null);
                }}
                className="w-full p-2.5 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-blue-400 transition-colors"
              >
                <option value="">-- Select Original Date --</option>
                {allDays.map((day) => (
                  <option key={day.date} value={day.date}>
                    {day.date} ({day.day}) - {day.attendance.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Adjusted Date Selection */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-200">
              <label className="block text-sm font-bold mb-2 text-gray-700 flex items-center gap-1">
                <span className="text-green-600">🎯</span>
                Adjusted Date
              </label>
              <select
                value={selectedAdjusted ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedAdjusted(value ? Number(value) : null);
                }}
                disabled={selectedOriginal === null}
                className="w-full p-2.5 border-2 border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white hover:border-green-400 transition-colors disabled:bg-gray-100 disabled:border-gray-200 disabled:cursor-not-allowed disabled:hover:border-gray-200"
              >
                <option value="">-- Select Adjusted Date --</option>
                {eligibleAdjustedDates.length === 0 && selectedOriginal !== null ? (
                  <option disabled>No eligible dates available</option>
                ) : (
                  eligibleAdjustedDates.map((day) => (
                    <option key={day.date} value={day.date}>
                      {day.date} ({day.day}) - {day.attendance.status}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Summary */}
          {selectedOriginal !== null && selectedAdjusted !== null && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border-2 border-green-400 shadow-md">
              <p className="text-green-800 text-sm font-bold mb-3 flex items-center gap-2">
                <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</span>
                Adjustment Summary
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-lg border-2 border-green-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl text-green-600 mt-0.5">→</span>
                    <div className="flex-1">
                      <span className="text-gray-700 font-semibold text-sm block mb-1">Original Date:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{selectedOriginal}</span>
                        <span className="text-gray-500">→</span>
                        <span className="bg-lime-400 text-lime-900 px-2.5 py-1 rounded-md font-bold text-xs inline-block shadow-sm">
                          adj-P
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border-2 border-orange-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl text-orange-600 mt-0.5">→</span>
                    <div className="flex-1">
                      <span className="text-gray-700 font-semibold text-sm block mb-1">Adjusted Date:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{selectedAdjusted}</span>
                        <span className="text-gray-500">→</span>
                        <span className="bg-orange-400 text-orange-900 px-2.5 py-1 rounded-md font-bold text-xs inline-block shadow-sm">
                          adj-H
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-4 mt-6 pt-5 border-t-2 border-gray-200">
          <button
            onClick={handleApply}
            disabled={selectedOriginal === null || selectedAdjusted === null}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-md hover:shadow-lg disabled:shadow-none flex items-center justify-center gap-2"
          >
            <span>✓</span>
            Apply Adjustment
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-bold text-sm hover:from-gray-600 hover:to-gray-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <span>✕</span>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};