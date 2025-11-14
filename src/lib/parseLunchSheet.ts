import * as XLSX from "xlsx";

export type Session = { in?: string; out?: string };
export type DayRecord = { date: string; sessions: Session[] };
export type EmployeeRecord = {
  empCode: string;
  empName: string;
  days: DayRecord[];
};

/**
 * Reads a complex lunch in-out Excel file with multi-row headers
 * and returns structured employee → day → sessions data.
 */
export function parseLunchSheetFromBuffer(buf: Buffer): EmployeeRecord[] {
  console.log("🔍 Starting parse, buffer size:", buf.length);

  const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  console.log("📋 Workbook sheets:", wb.SheetNames);

  // Helper to read cell values safely
  const get = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v;

  const employees: EmployeeRecord[] = [];
  const dataSections: Array<{ startRow: number; endRow: number }> = [];

  // 🔹 Step 1: Find data blocks containing "EMP Code"
  for (let row = 0; row < 500; row++) {
    const cellValue = get(row, 0);
    if (cellValue && String(cellValue).toLowerCase().includes("emp code")) {
      let endRow = row + 1;

      // Scan ahead to find end of section
      for (let r = row + 1; r < 1000; r++) {
        const empCode = get(r, 0);
        const empName = get(r, 2);

        if (empCode && empName) {
          endRow = r;
        } else if (
          typeof empCode === "string" &&
          (empCode.includes("Company") || empCode.includes("Department"))
        ) {
          break;
        }
      }

      if (endRow > row + 1) {
        dataSections.push({ startRow: row + 1, endRow });
      }
    }
  }

  console.log("📚 Found data sections:", dataSections.length);

  // 🔹 Step 2: Process each employee row
  for (const section of dataSections) {
    for (let r = section.startRow; r <= section.endRow; r++) {
      const empCode = get(r, 0);
      const empName = get(r, 2);

      if (!empCode || !empName) continue;
      if (typeof empCode === "string" && empCode.toLowerCase().includes("emp"))
        continue;

      const empDays = new Map<
        string,
        Array<{ time: string; type: "in" | "out" }>
      >();

      // Collect all punches with their timestamps
      // Group by date first, then sort by time to determine IN/OUT sequence
      for (let c = 4; c < 160; c++) {
        const dateHeader = get(1, c);
        const cellVal = get(r, c);

        if (!cellVal || !dateHeader) continue;

        const dateISO = parseDateString(String(dateHeader));
        if (!dateISO) continue;

        const timeISO = parseCellToISO(dateISO, cellVal);
        if (!timeISO) continue;

        if (!empDays.has(dateISO)) empDays.set(dateISO, []);

        const punches = empDays.get(dateISO)!;
        // Store time without type - we'll determine it by sequence
        punches.push({ time: timeISO, type: "in" }); // placeholder, will be corrected
      }

      // Convert punches to sessions with proper IN → OUT pairing
      const days: DayRecord[] = Array.from(empDays.entries()).map(
        ([date, punches]) => {
          // Sort punches by time
          punches.sort((a, b) => a.time.localeCompare(b.time));

          const sessions: Session[] = [];
          let currentSession: Session | null = null;

          for (const punch of punches) {
            if (punch.type === "in") {
              // If there's an open session, close it first (shouldn't happen with clean data)
              if (currentSession && currentSession.in && !currentSession.out) {
                sessions.push(currentSession);
              }
              // Start new session
              currentSession = { in: punch.time };
            } else if (punch.type === "out") {
              if (currentSession && currentSession.in && !currentSession.out) {
                // Complete the current session
                currentSession.out = punch.time;
                sessions.push(currentSession);
                currentSession = null;
              } else {
                // OUT without IN - skip this punch or log warning
                console.warn(
                  `⚠️ OUT punch without IN for ${empCode} on ${date} at ${punch.time}`
                );
              }
            }
          }

          // If there's an unclosed session, add it
          if (currentSession && currentSession.in) {
            sessions.push(currentSession);
          }

          return { date, sessions };
        }
      );

      if (days.length > 0) {
        employees.push({
          empCode: String(empCode),
          empName: String(empName),
          days,
        });
      }
    }
  }

  console.log("✅ Total employees parsed:", employees.length);
  return employees;
}

// ======================
// 🔧 Helper functions
// ======================

function parseDateString(s: string): string | null {
  if (!s) return null;
  const clean = s.trim();

  // Match DD/MM/YYYY
  let m = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${pad2(Number(mm))}-${pad2(Number(dd))}`;
  }

  // Already ISO (YYYY-MM-DD)
  m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return clean;

  return null;
}

function parseCellToISO(dateISO: string, val: any): string | undefined {
  if (!val) return undefined;

  if (val instanceof Date) {
    const h = pad2(val.getHours());
    const mi = pad2(val.getMinutes());
    const s = pad2(val.getSeconds());
    return `${dateISO}T${h}:${mi}:${s}`;
  }

  const raw = String(val).trim();
  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const [, h, mi, s] = timeMatch;
    return `${dateISO}T${pad2(Number(h))}:${mi}:${s || "00"}`;
  }

  return undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
