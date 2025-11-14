import { create } from "zustand";

interface AttendanceStats {
  empCode: string;
  empName: string;
  finalDifference: number; // Only this matters!

  // These can stay but we don't care about them
  grandTotalPresentDay: number;
  grandTotalOT: number;
  totalLateEarlyDeparture: number;
}
interface AttendanceStore {
  stats: AttendanceStats | null;

  // Actions
  setEmployeeInfo: (empCode: string, empName: string) => void;
  setFinalStats: (stats: {
    grandTotalPresentDay: number;
    grandTotalOT: number;
    totalLateEarlyDeparture: number;
    finalDifference: number;
  }) => void;
  resetStats: () => void;
}

const initialStats: AttendanceStats = {
  empCode: "",
  empName: "",
  grandTotalPresentDay: 0,
  grandTotalOT: 0,
  totalLateEarlyDeparture: 0,
  finalDifference: 0,
};

export const useAttendanceStore = create<AttendanceStore>((set) => ({
  stats: null,

  setEmployeeInfo: (empCode, empName) =>
    set((state) => ({
      stats: state.stats
        ? { ...state.stats, empCode, empName }
        : { ...initialStats, empCode, empName },
    })),

  setFinalStats: (newStats) =>
    set((state) => ({
      stats: {
        ...(state.stats || initialStats),
        ...newStats,
      },
    })),

  resetStats: () => set({ stats: null }),
}));
