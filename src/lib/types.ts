// lib/types.ts

/**
 * Attendance Data for a single day
 * Contains all the time tracking information for an employee on a specific day
 */
export interface AttendanceData {
  shift: string;
  inTime: string;
  outTime: string;
  lateMins: string | number;
  earlyDep: string | number;
  otHrs: string;
  workHrs: string;
  status: string; // P, A, WO, H, OD, Leave, adj-P, adj-M/WO-I
}

/**
 * Day Attendance Record
 * Represents a complete record for an employee on a specific day
 * Includes original status tracking for adjustment day feature
 */
// lib/types.ts (Add to DayAttendance interface)

export interface DayAttendance {
  date: number;
  day: string;
  attendance: AttendanceData;
  
  // Adjustment Day Feature fields
  originalStatus?: string;
  isAdjustmentOriginal?: boolean;
  isAdjustmentTarget?: boolean;
  isHoliday?: boolean; // ADD THIS - Marks if date was set as holiday through Holiday Management
}

/**
 * Adjustment Day Record
 * Tracks a single adjustment made to swap a holiday to a different date
 */
export interface AdjustmentDay {
  originalDate: number; // Date that was originally a holiday/week-off
  adjustedDate: number; // Date that becomes the new holiday/week-off
  timestamp: string; // ISO timestamp of when adjustment was made
}

/**
 * Employee Data
 * Complete attendance and performance data for an employee for a period
 * Includes calculated totals and day-wise records
 */
export interface EmployeeData {
  // Basic Information
  companyName: string;
  department: string;
  empCode: string;
  empName: string;

  // Attendance Counts
  present: number;
  od: number;
  absent: number;
  weekOff: number;
  holiday: number;
  leave: number;

  // Calculated Totals
  totalOTHours: string; // Format: "HH:MM"
  totalWorkHours: string; // Format: "HH:MM"
  totalLateMins: number; // Total late minutes (excluding Saturdays and PA status)
  totalEarlyDep: number; // Total early departure minutes (excluding Saturdays and PA status)

  // Day-wise Records
  days: DayAttendance[];

  // Adjustment Day Feature
  adjustments?: AdjustmentDay[]; // Array of all adjustments made for this employee
}

/**
 * Processed Excel Data
 * The complete processed data from an uploaded Excel file
 */
export interface ProcessedExcelData {
  title: string; // Title from Excel file
  period: string; // Period for which attendance data is recorded
  employees: EmployeeData[]; // Array of all employees with their data
}

/**
 * Status Code Constants and Descriptions
 * Helps with consistent status handling across the application
 */
export const STATUS_CODES = {
  PRESENT: 'P',
  ABSENT: 'A',
  WEEK_OFF: 'WO',
  HOLIDAY: 'H',
  ON_DUTY: 'OD',
  LEAVE: 'Leave',
  ADJUSTMENT_PRESENT: 'adj-P', // Adjusted to working day
  ADJUSTMENT_HOLIDAY: 'adj-M/WO-I', // Adjusted to holiday
} as const;

export const STATUS_DESCRIPTIONS: Record<string, string> = {
  [STATUS_CODES.PRESENT]: 'Present',
  [STATUS_CODES.ABSENT]: 'Absent',
  [STATUS_CODES.WEEK_OFF]: 'Week Off',
  [STATUS_CODES.HOLIDAY]: 'Holiday',
  [STATUS_CODES.ON_DUTY]: 'On Duty',
  [STATUS_CODES.LEAVE]: 'Leave',
  [STATUS_CODES.ADJUSTMENT_PRESENT]: 'Adjusted to Working',
  [STATUS_CODES.ADJUSTMENT_HOLIDAY]: 'Adjusted to Holiday',
};

/**
 * Status Color Mapping for UI
 * Maps status codes to Tailwind CSS color classes
 */
export const STATUS_COLORS: Record<string, string> = {
  [STATUS_CODES.PRESENT]: 'bg-green-100 text-green-800 border-green-300',
  [STATUS_CODES.ABSENT]: 'bg-red-100 text-red-800 border-red-300',
  [STATUS_CODES.WEEK_OFF]: 'bg-gray-100 text-gray-800 border-gray-300',
  [STATUS_CODES.HOLIDAY]: 'bg-blue-100 text-blue-800 border-blue-300',
  [STATUS_CODES.ON_DUTY]: 'bg-purple-100 text-purple-800 border-purple-300',
  [STATUS_CODES.LEAVE]: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  [STATUS_CODES.ADJUSTMENT_PRESENT]:
    'bg-lime-100 text-lime-800 border-lime-300 ring-2 ring-lime-400',
  [STATUS_CODES.ADJUSTMENT_HOLIDAY]:
    'bg-orange-200 text-orange-800 border-orange-300 ring-2 ring-orange-400',
};

/**
 * Eligible statuses for original date (must be holiday or week off)
 */
export const ADJUSTMENT_ELIGIBLE_ORIGINAL = [
  STATUS_CODES.HOLIDAY,
  STATUS_CODES.WEEK_OFF,
];

/**
 * Status codes that cannot be adjusted to
 */
export const ADJUSTMENT_INELIGIBLE_STATUSES = [
  STATUS_CODES.ADJUSTMENT_PRESENT,
  STATUS_CODES.ADJUSTMENT_HOLIDAY,
];

/**
 * Helper type for UI state management
 * Used in modals and forms for adjustment day selection
 */
export interface AdjustmentState {
  employeeIndex: number;
  originalDate: number | null;
  adjustedDate: number | null;
  isOpen: boolean;
}

/**
 * Helper type for API responses or operations
 */
export interface AdjustmentResult {
  success: boolean;
  message: string;
  adjustment?: AdjustmentDay;
  error?: string;
}
