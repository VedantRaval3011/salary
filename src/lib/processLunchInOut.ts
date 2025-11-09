import * as XLSX from "xlsx";

export interface LunchInOutData {
  empCode: string;
  empName: string;
  dailyPunches: {
    date: string;
    punches: Array<{
      type: "In" | "Out";
      time: string;
    }>;
  }[];
}

export async function processLunchInOutFile(
  file: File
): Promise<LunchInOutData[]> {
  console.log("🍽️ Starting to process lunch file:", file.name);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { cellDates: true, cellNF: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  // Find the header row with "EMP Code"
  let headerRowIndex = -1;
  for (let row = 0; row < 20; row++) {
    const cellValue = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v;
    if (cellValue && String(cellValue).toUpperCase().includes("EMP CODE")) {
      headerRowIndex = row;
      console.log('✅ Found "EMP Code" header at row:', row);
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row with "EMP Code"');
  }

  const inOutRowIndex = headerRowIndex + 1; // Row with "In"/"Out"
  const dataStartIndex = headerRowIndex + 2; // First employee data row

  console.log("📊 Header row:", headerRowIndex);
  console.log("📊 In/Out row:", inOutRowIndex);
  console.log("📊 Data starts at row:", dataStartIndex);

  // Find date row (usually a few rows before header)
  let dateRowIndex = -1;
  for (let row = 0; row < headerRowIndex; row++) {
    // Check a few columns for dates
    for (let col = 3; col < 10; col++) {
      const cellValue =
        worksheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v;
      if (cellValue) {
        const str = String(cellValue);
        if (str.includes("/") || str.match(/\d{1,2}[/-]\d{1,2}/)) {
          dateRowIndex = row;
          console.log(`📅 Found dates at row ${row}, sample: "${str}"`);
          break;
        }
      }
    }
    if (dateRowIndex !== -1) break;
  }

  if (dateRowIndex === -1) {
    throw new Error("Could not find date row");
  }

  // Map columns to dates by checking the date row and In/Out row
  const columnToDate = new Map<number, string>();
  let currentDate: string | null = null;

  for (let col = 3; col < 200; col++) {
    const dateCell =
      worksheet[XLSX.utils.encode_cell({ r: dateRowIndex, c: col })]?.v;
    const inOutCell =
      worksheet[XLSX.utils.encode_cell({ r: inOutRowIndex, c: col })]?.v;

    // Check if this column has a date header
    if (dateCell) {
      const dateStr = formatDate(dateCell);
      if (
        dateStr &&
        (String(dateCell).includes("/") || dateCell instanceof Date)
      ) {
        currentDate = dateStr;
        console.log(`📅 Column ${col} starts date: ${currentDate}`);
      }
    }

    // If we have a current date and this column has In/Out data, map it
    if (currentDate && inOutCell) {
      const type = String(inOutCell).trim();
      if (type === "In" || type === "Out") {
        columnToDate.set(col, currentDate);
      }
    }
  }

  console.log(`📅 Found ${columnToDate.size} columns with dates`);
  console.log(
    "📅 Column to date mapping (sample):",
    Array.from(columnToDate.entries())
      .slice(0, 20)
      .map(([col, date]) => `${col}→${date}`)
  );

  const employees: LunchInOutData[] = [];

  // Process each employee row
  for (let row = dataStartIndex; row < 400; row++) {
    const empCodeCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v;
    const empNameCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 2 })]?.v;

    if (!empCodeCell || !empNameCell) continue;

    const empCode = String(empCodeCell).trim();
    const empName = String(empNameCell).trim();

    // Skip header rows
    if (
      empCode.toUpperCase().includes("EMP") ||
      empCode.toUpperCase().includes("CODE")
    )
      continue;

    console.log(`\n👤 Processing: ${empCode} - ${empName} (row ${row + 1})`);

    // Group punches by date
    const dateGroups = new Map<
      string,
      Array<{ type: "In" | "Out"; time: string; col: number }>
    >();
    let punchCount = 0;

    for (let col = 3; col < 200; col++) {
      const inOutType =
        worksheet[XLSX.utils.encode_cell({ r: inOutRowIndex, c: col })]?.v;
      const timeValue =
        worksheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v;

      if (!inOutType || !timeValue) continue;

      const type = String(inOutType).trim();
      if (type !== "In" && type !== "Out") continue;

      // Get the date for this column
      const date = columnToDate.get(col);
      if (!date) {
        console.log(`  ⚠️ Column ${col} has ${type} punch but no date mapping`);
        continue;
      }

      const timeStr = formatTime(timeValue);
      if (!timeStr) continue;

      if (!dateGroups.has(date)) {
        dateGroups.set(date, []);
      }

      dateGroups.get(date)!.push({
        type: type as "In" | "Out",
        time: timeStr,
        col,
      });

      punchCount++;
    }

    console.log(
      `  📊 Found ${punchCount} total punches across ${dateGroups.size} dates`
    );

    // Convert grouped data to dailyPunches format
    const dailyPunches: LunchInOutData["dailyPunches"] = [];

    for (const [date, punchesWithCol] of dateGroups.entries()) {
      // Sort by column order to maintain sequence
      const punches = punchesWithCol
        .sort((a, b) => a.col - b.col)
        .map((p) => ({ type: p.type, time: p.time }));

      if (punches.length > 0) {
        dailyPunches.push({ date, punches });
      }
    }

    if (dailyPunches.length > 0) {
      employees.push({ empCode, empName, dailyPunches });
      console.log(
        `✅ Added ${empCode} with ${dailyPunches.length} days of data`
      );
    } else {
      console.log(`⚠️ No punch data for ${empCode}`);
    }
  }

  console.log(`\n✅ Processed ${employees.length} employees with lunch data`);
  if (employees.length > 0) {
    console.log("📊 Sample employee:", {
      empCode: employees[0].empCode,
      empName: employees[0].empName,
      daysWithData: employees[0].dailyPunches.length,
      firstDay: employees[0].dailyPunches[0],
    });
  }

  return employees;
}

function formatDate(date: Date | string | number): string {
  if (date instanceof Date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const str = String(date).trim();
  // Already formatted as DD/MM/YYYY
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
    return str;
  }

  return str;
}

function formatTime(date: Date | string | number): string | null {
  // 1. Handle Date objects
  if (date instanceof Date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  // 2. Handle Excel serial time (0 to 1)
  if (typeof date === "number" && date >= 0 && date <= 1) {
    // --- THIS IS THE FIX ---
    // Add a small epsilon (1 second) to combat floating point imprecision
    // 1 second = 1 / (24 hours * 60 minutes * 60 seconds)
    const epsilon = 1 / 86400;
    const totalMinutes = Math.round((date + epsilon) * 24 * 60);
    // --- END OF FIX ---

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // Final sanity check for 24:00 (midnight)
    if (hours === 24) {
      return "00:" + minutes.toString().padStart(2, "0");
    }

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  // 3. Handle all string formats
  const str = String(date).trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);

  if (match) {
    const hours = match[1].padStart(2, "0");
    const minutes = match[2];
    return `${hours}:${minutes}`;
  }

  // 4. If no valid time is found, return null
  console.warn(`[formatTime] Could not parse time from: "${str}"`);
  return null;
}
