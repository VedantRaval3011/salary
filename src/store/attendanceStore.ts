import { create } from "zustand";

interface AttendanceStats {
  // Present Day Stats
  presentDayTotal: number;
  presentAfterAdj: number;
  holidays: number;
  lateDeduction: number; // This will be auto-calculated
  adjustedTotal: number;
  paidLeave: number;
  grandTotalPresentDay: number;

  // Overtime Stats
  baseOT: string;
  staffGrantedOT: number;
  staffNonGrantedOT: number;
  workerGrantedOT: number;
  worker9to6OT: number;
  grantedFromSheet: number;
  totalOT: number;
  fullNightOT: number;
  lateDeductionOT: number;
  grandTotalOT: number;

  // Late & Early Departure Stats
  lateArrival: number;
  earlyDeparture: number;
  breakExcess: number;
  lessThan4Hr: number;
  totalLateEarlyDeparture: number;

  // Final Difference (OT - Late/Early)
  finalDifference: number;
}

interface AttendanceStore {
  stats: AttendanceStats | null;

  // Actions
  setPresentDayBaseStats: (stats: Partial<AttendanceStats>) => void;
  setOvertimeStats: (stats: Partial<AttendanceStats>) => void;
  setLateEarlyStats: (stats: Partial<AttendanceStats>) => void;
  setEmployeeInfo: (empCode: string, empName: string) => void;

  // Computed getters
  calculateLateDeduction: () => number;
  calculateAdjustedTotal: () => number;
  calculateGrandTotalPresentDay: () => number;

  resetStats: () => void;

  // Employee Info
  empCode: string;
  empName: string;
}

const initialStats: AttendanceStats = {
  presentDayTotal: 0,
  presentAfterAdj: 0,
  holidays: 0,
  lateDeduction: 0,
  adjustedTotal: 0,
  paidLeave: 0,
  grandTotalPresentDay: 0,
  baseOT: "0:00",
  staffGrantedOT: 0,
  staffNonGrantedOT: 0,
  workerGrantedOT: 0,
  worker9to6OT: 0,
  grantedFromSheet: 0,
  totalOT: 0,
  fullNightOT: 0,
  lateDeductionOT: 0,
  grandTotalOT: 0,
  lateArrival: 0,
  earlyDeparture: 0,
  breakExcess: 0,
  lessThan4Hr: 0,
  totalLateEarlyDeparture: 0,
  finalDifference: 0,
};

export const useAttendanceStore = create<AttendanceStore>((set, get) => ({
  stats: null,
  empCode: "",
  empName: "",

  // Helper function to calculate late deduction based on final difference
  calculateLateDeduction: () => {
    const state = get().stats;
    if (!state) return 0;

    // Get the final difference directly from the store (in hours)
    const finalDiffHours = state.finalDifference;

    // Only apply deduction if final difference is negative
    if (finalDiffHours < 0) {
      const absDiffHours = Math.abs(finalDiffHours);

      // If less than or equal to 4 hours → 0.5 day
      // Otherwise → 0.5 day for each 4-hour block (ceil to next block)
      const deduction = 0.5 * Math.ceil(absDiffHours / 4);

      console.log(
        `⚠️ Negative Final Diff (${absDiffHours.toFixed(
          2
        )}h). Applying ${deduction} day late deduction.`
      );

      return Number(deduction.toFixed(1));
    }

    return 0; // No deduction if difference >= 0
  },

  calculateAdjustedTotal: () => {
    const state = get().stats;
    if (!state) return 0;

    const lateDeduction = get().calculateLateDeduction();
    return Math.max(state.presentDayTotal - lateDeduction, 0);
  },

  calculateGrandTotalPresentDay: () => {
    const state = get().stats;
    if (!state) return 0;

    const adjustedTotal = get().calculateAdjustedTotal();
    return Math.max(adjustedTotal + state.paidLeave, 0);
  },

  setPresentDayBaseStats: (newStats) =>
    set((state) => {
      const updatedStats = state.stats
        ? { ...state.stats, ...newStats }
        : { ...initialStats, ...newStats };

      // Recalculate dependent values
      const lateDeduction = get().calculateLateDeduction();
      const adjustedTotal = Math.max(
        updatedStats.presentDayTotal - lateDeduction,
        0
      );
      const grandTotalPresentDay = Math.max(
        adjustedTotal + updatedStats.paidLeave,
        0
      );

      return {
        stats: {
          ...updatedStats,
          lateDeduction,
          adjustedTotal,
          grandTotalPresentDay,
        },
      };
    }),

  setOvertimeStats: (newStats) =>
    set((state) => {
      const updatedStats = state.stats
        ? { ...state.stats, ...newStats }
        : { ...initialStats, ...newStats };

      // Calculate final difference
      const finalDifference =
        updatedStats.grandTotalOT - updatedStats.totalLateEarlyDeparture;

      // Recalculate late deduction and dependent values
      const lateDeduction = get().calculateLateDeduction();
      const adjustedTotal = Math.max(
        updatedStats.presentDayTotal - lateDeduction,
        0
      );
      const grandTotalPresentDay = Math.max(
        adjustedTotal + updatedStats.paidLeave,
        0
      );

      return {
        stats: {
          ...updatedStats,
          finalDifference,
          lateDeduction,
          adjustedTotal,
          grandTotalPresentDay,
        },
      };
    }),

  setLateEarlyStats: (newStats) =>
    set((state) => {
      const updatedStats = state.stats
        ? { ...state.stats, ...newStats }
        : { ...initialStats, ...newStats };

      // Calculate final difference
      const finalDifference =
        ((updatedStats.grandTotalOT ?? 0) -
          (updatedStats.totalLateEarlyDeparture ?? 0)) /
        60;

      // Recalculate late deduction and dependent values
      const statsWithDiff = { ...updatedStats, finalDifference };

      // Now calculate deduction based on updated finalDifference
      let lateDeduction = 0;
      if (finalDifference < 0) {
        const absDiffHours = Math.abs(finalDifference) / 60;
        lateDeduction = 0.5 * Math.ceil(absDiffHours / 4);
      }

      const adjustedTotal = Math.max(
        statsWithDiff.presentDayTotal - lateDeduction,
        0
      );
      const grandTotalPresentDay = Math.max(
        adjustedTotal + statsWithDiff.paidLeave,
        0
      );

      return {
        stats: {
          ...statsWithDiff,
          lateDeduction: Number(lateDeduction.toFixed(1)),
          adjustedTotal: Number(adjustedTotal.toFixed(1)),
          grandTotalPresentDay: Number(grandTotalPresentDay.toFixed(1)),
        },
      };
    }),

  setEmployeeInfo: (empCode, empName) => set({ empCode, empName }),

  resetStats: () => set({ stats: null, empCode: "", empName: "" }),
}));
