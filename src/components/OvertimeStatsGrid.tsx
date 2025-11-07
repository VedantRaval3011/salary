'use client';

import React, { useMemo, useState } from 'react';
import { EmployeeData, DayAttendance } from '@/lib/types';
import { useExcel } from '@/context/ExcelContext';

/* -------------------- shared helpers -------------------- */
const toHoursFromHHMM = (hhmm?: string): number => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h + (m / 60);
};

const canon = (s: string) => (s ?? '').toUpperCase().trim();
const isSaturday = (d?: string) => !!d && canon(d).startsWith('SAT');
const isPresent = (status?: string) => {
  const s = canon(status || '');
  return s === 'P' || s === 'ADJ-P';
};
const isHoliday = (status?: string) => {
  const s = canon(status || '');
  return s === 'H';
};

const parseExcelIsoDate = (s?: string | Date) => {
  try {
    if (!s) return undefined;
    if (s instanceof Date) return s;
    const d = new Date(s);
    return Number.isNaN(d.valueOf()) ? undefined : d;
  } catch {
    return undefined;
  }
};

const monthSpanFromDays = (days: DayAttendance[]) => {
  // construct an arbitrary month range from min/max calendar day numbers (1..31)
  // NOTE: your data probably also has a real "period"; adjust if you have date objects
  const minDate = Math.min(...days.map(d => d.date));
  const maxDate = Math.max(...days.map(d => d.date));
  // Year/Month cannot be inferred reliably from only day numbers; we treat overlap as "any day index in range"
  return { minDay: minDate, maxDay: maxDate };
};

const getIsStaff = (emp: EmployeeData): boolean => {
  const inStr = `${emp.companyName ?? ''} ${emp.department ?? ''}`.toLowerCase();
  if (inStr.includes('worker')) return false;
  if (inStr.includes('staff')) return true;
  // default to staff if not clear
  return true;
};

/* -------------------- OPTIONAL sheet lookups -------------------- */
/**
 * Staff OT Granted: returns an eligibility range if present.
 * Expected shape (example): [{ empCode, from: ISO, to: ISO }]
 * Currently returns undefined unless you wire in your parser.
 */
function useStaffOTGrantedLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    // If you’ve parsed this sheet elsewhere, store the normalized rows on file.custom.staffOTGrantedRows.
    // Fallback: return no range.
    const index = new Map<string, { from?: Date; to?: Date }>();

    // Example wiring (uncomment & adapt when you have parsed rows):
    // files.forEach(f => {
    //   if (/staff\s*ot\s*granted/i.test(f.categoryName || '') && Array.isArray((f as any).staffOTGrantedRows)) {
    //     (f as any).staffOTGrantedRows.forEach((r: any) => {
    //       const code = canon(r.empCode);
    //       index.set(code, { from: parseExcelIsoDate(r.from), to: parseExcelIsoDate(r.to) });
    //     });
    //   }
    // });

    const getRange = (empCode: string) => index.get(canon(empCode)); // undefined if none
    return { getRange };
  }, [getAllUploadedFiles]);
}

/**
 * Full Night Stay OT: returns total extra OT hours for given Emp Code.
 * Expected shape (example): [{ empCode, hours: number }], where hours = sum of Column G.
 */
function useFullNightStayOTLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const index = new Map<string, number>();

    // Example wiring (uncomment & adapt when you have parsed rows):
    // files.forEach(f => {
    //   if (/full\s*night\s*stay/i.test(f.categoryName || '') && Array.isArray((f as any).fullNightStayRows)) {
    //     (f as any).fullNightStayRows.forEach((r: any) => {
    //       const code = canon(r.empCode);
    //       const hrs = Number(r.hours) || 0;
    //       index.set(code, (index.get(code) || 0) + hrs);
    //     });
    //   }
    // });

    const getHours = (empCode: string) => index.get(canon(empCode)) ?? 0;
    return { getHours };
  }, [getAllUploadedFiles]);
}

/**
 * Maintenance Employee OT Deduct: returns deduction hours for given Emp Code.
 * Expected shape (example): [{ empCode, deductHours: number }]
 */
function useMaintenanceOTDeductLookup() {
  const { getAllUploadedFiles } = useExcel();

  return useMemo(() => {
    const files = getAllUploadedFiles?.() ?? [];
    const index = new Map<string, number>();

    // Example wiring (uncomment & adapt when you have parsed rows):
    // files.forEach(f => {
    //   if (/maintenance\s*employee\s*ot\s*deduct/i.test(f.categoryName || '') && Array.isArray((f as any).maintenanceOTDeductRows)) {
    //     (f as any).maintenanceOTDeductRows.forEach((r: any) => {
    //       const code = canon(r.empCode);
    //       const hrs = Number(r.deductHours) || 0.5; // default 0.5 if specified
    //       index.set(code, hrs);
    //     });
    //   }
    // });

    const getDeduct = (empCode: string) => index.get(canon(empCode)) ?? 0;
    return { getDeduct };
  }, [getAllUploadedFiles]);
}

/* -------------------- UI -------------------- */
interface OvertimeStatsGridProps {
  employee: EmployeeData;
}

export const OvertimeStatsGrid: React.FC<OvertimeStatsGridProps> = ({ employee }) => {
  const [tips, setTips] = useState<Record<string, boolean>>({});
  const { getRange } = useStaffOTGrantedLookup();
  const { getHours: getFNSHours } = useFullNightStayOTLookup();
  const { getDeduct: getMaintDeduct } = useMaintenanceOTDeductLookup();

  const {
    baseOT,
    addlOTAttendance,
    otWithinGrantedRange,
    fullNightStayOT,
    lateDeduction,
    maintenanceDeduction,
    finalOT,
  } = useMemo(() => {
    // 1) Base OT from attendance (HH:MM -> hours)
    const baseOT = toHoursFromHHMM(employee.totalOTHours);

    // 2) Additional OT based on attendance (Staff only): +1.0 hr for each Sat present or present-on-holiday
    const isStaff = getIsStaff(employee);
    let addlOTAttendance = 0;
    if (isStaff) {
      const ADDL_PER_DAY = 1.0; // <— tweak if your business rule differs
      employee.days.forEach((d) => {
        const pres = isPresent(d.attendance?.status);
        if (!pres) return;
        if (isSaturday(d.day) || isHoliday(d.attendance?.status)) {
          addlOTAttendance += ADDL_PER_DAY;
        }
      });
    }

    // 3) Apply Staff OT Granted (date range)
    //    If a range exists for this employee, keep base OT; else 0 for staff.
    //    (We cannot split OT by day without per-day OT; this keeps logic defensively simple.)
    let otWithinGrantedRange = baseOT;
    if (isStaff) {
      const range = getRange(employee.empCode);
      if (range && (range.from || range.to)) {
        // Optionally, you can check overlap against actual day indexes (if you store real dates).
        // We assume the month is eligible when a range exists for this employee.
        otWithinGrantedRange = baseOT;
      } else {
        // no eligibility rows found => exclude staff base OT
        otWithinGrantedRange = 0;
      }
    }

    // 4) Full Night Stay OT
    const fullNightStayOT = getFNSHours(employee.empCode);

    // Raw OT before deductions
    const otBeforeDeduct = otWithinGrantedRange + addlOTAttendance + fullNightStayOT;

    // 5) Late deduction rule
    // If OT < Late Minutes (in hours), deduct 0.5 * ceil((late - ot)/4)
    const lateHours = (employee.totalLateMins || 0) / 60;
    let lateDeduction = 0;
    if (otBeforeDeduct < lateHours) {
      const diff = lateHours - otBeforeDeduct;
      lateDeduction = 0.5 * Math.ceil(diff / 4);
    }

    // 6) Maintenance OT Deduct
    const maintenanceDeduction = getMaintDeduct(employee.empCode);

    // 7) Final OT
    const finalOT = Math.max(otBeforeDeduct - lateDeduction - maintenanceDeduction, 0);

    return {
      baseOT,
      addlOTAttendance,
      otWithinGrantedRange,
      fullNightStayOT,
      lateDeduction,
      maintenanceDeduction,
      finalOT,
    };
  }, [employee, getRange, getFNSHours, getMaintDeduct]);

  const tipsText: Record<string, string> = {
    baseOT:
      'Base OT imported from Monthly Attendance Tulsi (HH:MM converted to hours).',
    addlOT:
      'Additional OT (Staff only): +1.0 hour for each present Saturday or present-on-holiday.',
    granted:
      'Staff OT Granted range: if present for employee, base OT is included; otherwise excluded.',
    fullNight:
      'Full Night Stay OT added (sum of Hours column for the employee).',
    lateDeduct:
      'Late deduction: if OT < Late minutes, deduction = 0.5 × ceil((LateHrs − OTHrs)/4).',
    maintDeduct:
      'Maintenance OT Deduct: extra manual deduction from the “Maintenance Employee OT Deduct” sheet.',
    final:
      'Final OT = (Base/Granted OT + Additional + Full Night) − (Late Deduction + Maintenance Deduction).',
  };

  const toggle = (k: string) => setTips((p) => ({ ...p, [k]: !p[k] }));

  const Box = ({
    label,
    value,
    bg,
    tone,
    tipKey,
  }: {
    label: string;
    value: number | string;
    bg: string;
    tone: string;
    tipKey: keyof typeof tipsText;
  }) => (
    <div className={`relative text-center p-2 w-[130px] ${bg} rounded-md border ${tone} transition-all hover:shadow`}>
      <div className="absolute top-1 right-1">
        <button
          onClick={() => toggle(tipKey)}
          className="w-4 h-4 bg-gray-400 hover:bg-gray-600 text-white rounded-full text-[10px]"
        >
          ?
        </button>
        {tips[tipKey] && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-gray-900 text-white p-2 rounded shadow-lg z-50 text-xs">
            {tipsText[tipKey]}
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray-600">{label}</div>
      <div className="text-xl font-bold mt-1">{typeof value === 'number' ? Number(value).toFixed(2) : value}</div>
    </div>
  );

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span className="text-indigo-600">⏱️</span>
        Overtime (OT) Calculation
      </h4>

      {/* HORIZONTAL, SMALL CARDS */}
      <div className="flex flex-wrap gap-2">
        <Box label="Base OT" value={baseOT} bg="bg-green-50" tone="text-green-700" tipKey="baseOT" />
        <Box label="Additional OT (Attendance)" value={addlOTAttendance} bg="bg-teal-50" tone="text-teal-700" tipKey="addlOT" />
        <Box label="OT within Granted Range" value={otWithinGrantedRange} bg="bg-blue-50" tone="text-blue-700" tipKey="granted" />
        <Box label="Full Night Stay OT" value={fullNightStayOT} bg="bg-indigo-50" tone="text-indigo-700" tipKey="fullNight" />
        <Box label="Late Deduction" value={lateDeduction} bg="bg-amber-50" tone="text-amber-700" tipKey="lateDeduct" />
        <Box label="Maintenance Deduction" value={maintenanceDeduction} bg="bg-rose-50" tone="text-rose-700" tipKey="maintDeduct" />
        <Box label="Final OT" value={finalOT} bg="bg-emerald-50" tone="text-emerald-700" tipKey="final" />
      </div>
    </div>
  );
};
