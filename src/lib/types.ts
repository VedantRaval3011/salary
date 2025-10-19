export interface AttendanceData {
  shift: string;
  inTime: string;
  outTime: string;
  lateMins: string | number;
  earlyDep: string | number;
  otHrs: string;
  workHrs: string;
  status: string;
}

export interface DayAttendance {
  date: number;
  day: string;
  attendance: AttendanceData;
}

export interface EmployeeData {
  companyName: string;
  department: string;
  empCode: string;
  empName: string;
  present: number;
  od: number;
  absent: number;
  weekOff: number;
  holiday: number;
  leave: number;          // ADD THIS
  totalOTHours: string;   // ADD THIS
  totalWorkHours: string; // ADD THIS
  days: DayAttendance[];
}



export interface ProcessedExcelData {
  title: string;
  period: string;
  employees: EmployeeData[];
}
