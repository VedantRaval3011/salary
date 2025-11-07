// lib/types.ts

/**
 * ============================================================================
 * CORE ATTENDANCE DATA TYPES
 * ============================================================================
 */

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
export interface DayAttendance {
  date: number;
  day: string;
  attendance: AttendanceData;

  // Adjustment Day Feature fields
  originalStatus?: string;
  isAdjustmentOriginal?: boolean;
  isAdjustmentTarget?: boolean;
  isHoliday?: boolean; // Marks if date was set as holiday through Holiday Management
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
  paidLeave?: number;

  // Adjustment Day Feature
  adjustments?: AdjustmentDay[]; // Array of all adjustments made for this employee
}

// Add new type for paid leave data
export interface PaidLeaveData {
  empCode: string;
  empName: string;
  paidDays: number;
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
 * ============================================================================
 * MULTI-FILE UPLOAD TYPES
 * ============================================================================
 */

/**
 * Uploaded File Metadata and Context
 * Stores information about each uploaded file including its processing status
 * and the data extracted from it
 */
export interface UploadedFile {
  id: string; // Unique identifier for this upload (UUID v4)
  fileName: string; // Original file name as uploaded
  categoryName: string; // Category name (from REQUIRED_FILES or OPTIONAL_FILES)
  fileType: 'required' | 'optional'; // Whether this file is mandatory or optional
  uploadedAt: string; // ISO timestamp of when file was uploaded
  data: ProcessedExcelData | null; // Processed data from the file (null until processing completes)
  status: 'pending' | 'processing' | 'success' | 'error'; // Current processing status
  error?: string; // Error message if status is 'error'
  paidLeaveData?: PaidLeaveData[];
}

/**
 * File Context Storage
 * Maps file IDs to their UploadedFile metadata
 * Used to maintain context for all uploaded files
 */
export interface FileContext {
  [fileId: string]: UploadedFile;
}

/**
 * File Category Configuration
 * Defines the list of required and optional files
 */
export const REQUIRED_FILES = [
  'Monthly Attendance Tulsi Sheet',
] as const;

export const OPTIONAL_FILES = [
  'Late Arrival Sheet',
  'Early Departure Sheet',
  'Lunch In-Out Time Sheet',
  'Full Night Stay Emp. OT Sheet',
  'Staff OT Granted',
  'Staff Paid Leave Sheet',
  '09 to 06 Time Granted Emp. Sheet',
  'Loan+TDS+Extra Paid',
  'Maintenance Employee OT Deduct',
  'Worker Tulsi',
  'Staff Tulsi',
] as const;

/**
 * Union type for all valid file categories
 */
export type FileCategory = typeof REQUIRED_FILES[number] | typeof OPTIONAL_FILES[number];

/**
 * ============================================================================
 * STATUS CODE CONSTANTS AND DESCRIPTIONS
 * ============================================================================
 */

/**
 * Status Code Constants
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

/**
 * Status Descriptions
 * Maps status codes to human-readable descriptions
 */
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
 * Maps status codes to Tailwind CSS color classes for consistent styling
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
 * ============================================================================
 * ADJUSTMENT DAY FEATURE VALIDATION CONSTANTS
 * ============================================================================
 */

/**
 * Eligible statuses for original date
 * Must be holiday or week off to be eligible for adjustment
 */
export const ADJUSTMENT_ELIGIBLE_ORIGINAL = [
  STATUS_CODES.HOLIDAY,
  STATUS_CODES.WEEK_OFF,
] as const;

/**
 * Status codes that cannot be adjusted to
 * Prevents creating adjustments for already adjusted dates
 */
export const ADJUSTMENT_INELIGIBLE_STATUSES = [
  STATUS_CODES.ADJUSTMENT_PRESENT,
  STATUS_CODES.ADJUSTMENT_HOLIDAY,
] as const;

/**
 * ============================================================================
 * UI STATE MANAGEMENT TYPES
 * ============================================================================
 */

/**
 * Adjustment State for Modal/Form
 * Used in modals and forms for adjustment day selection
 */
export interface AdjustmentState {
  employeeIndex: number;
  originalDate: number | null;
  adjustedDate: number | null;
  isOpen: boolean;
}

/**
 * Adjustment Result for API Operations
 * Used for API responses or operation results
 */
export interface AdjustmentResult {
  success: boolean;
  message: string;
  adjustment?: AdjustmentDay;
  error?: string;
}

/**
 * ============================================================================
 * FILE UPLOAD UI STATE TYPES
 * ============================================================================
 */

/**
 * File Upload Progress State
 * Tracks the overall progress of file uploads
 */
export interface FileUploadProgress {
  totalFiles: number;
  uploadedFiles: number;
  processingFiles: number;
  errorFiles: number;
  requiredFilesMissing: string[]; // Names of missing required files
}

/**
 * File Upload Summary
 * Provides a summary view of all uploaded files
 */
export interface FileUploadSummary {
  requiredCount: number;
  requiredUploaded: number;
  optionalCount: number;
  optionalUploaded: number;
  totalEmployees: number;
  lastUpdated: string;
}

/**
 * ============================================================================
 * HELPER TYPE GUARDS AND UTILITY TYPES
 * ============================================================================
 */

/**
 * Type to ensure file categories are valid
 */
export type ValidFileCategory = FileCategory;

/**
 * Type for status code
 */
export type StatusCode = typeof STATUS_CODES[keyof typeof STATUS_CODES];

/**
 * Type for file processing action
 */
export type FileProcessingAction =
  | { type: 'UPLOAD'; fileId: string; file: UploadedFile }
  | { type: 'REMOVE'; fileId: string }
  | { type: 'UPDATE_STATUS'; fileId: string; status: UploadedFile['status']; error?: string }
  | { type: 'UPDATE_DATA'; fileId: string; data: ProcessedExcelData }
  | { type: 'CLEAR_ALL' };

/**
 * ============================================================================
 * UTILITY FUNCTIONS FOR TYPE VALIDATION
 * ============================================================================
 */

/**
 * Validates if a file category is required
 */
export const isRequiredFile = (category: string): boolean => {
  return REQUIRED_FILES.includes(category as typeof REQUIRED_FILES[number]);
};

/**
 * Validates if a file category is optional
 */
export const isOptionalFile = (category: string): boolean => {
  return OPTIONAL_FILES.includes(category as typeof OPTIONAL_FILES[number]);
};

/**
 * Validates if a status code is valid
 */
export const isValidStatus = (status: string): status is StatusCode => {
  return Object.values(STATUS_CODES).includes(status as StatusCode);
};

/**
 * Gets all file categories
 */
export const getAllFileCategories = (): ValidFileCategory[] => {
  return [...REQUIRED_FILES, ...OPTIONAL_FILES] as ValidFileCategory[];
};

/**
 * Gets only required file categories
 */
export const getRequiredFileCategories = (): typeof REQUIRED_FILES => {
  return REQUIRED_FILES;
};

/**
 * Gets only optional file categories
 */
export const getOptionalFileCategories = (): typeof OPTIONAL_FILES => {
  return OPTIONAL_FILES;
};

