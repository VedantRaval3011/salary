import * as ExcelJS from "exceljs";

export interface OTGrantedEmployee {
  empCode: string;
  empName: string;
  otType: "staff" | "fullnight" | "special" | "09to06" | "maintenance"; // Added maintenance
  fromDate: number;
  toDate: number;
  totalHours?: number; // For full night stay and custom timing - total hours to add
  customTime?: string; // For displaying custom work hours (e.g., "9:00 TO 6:00")
}

export async function processOTSheet(
  file: File,
  sheetType: "staff" | "fullnight" | "special" | "09to06" | "maintenance" // Added maintenance
): Promise<OTGrantedEmployee[]> {
  try {
    console.log(`🔄 Processing ${sheetType} OT sheet: ${file.name}`);

    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      console.error("❌ No worksheet found in file");
      return [];
    }

    const employees: OTGrantedEmployee[] = [];

    // Find header row to identify column positions
    let headerRowIndex = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 10) return; // Check first 10 rows for header

      const firstCell = String(row.getCell(1).value || "").toUpperCase();
      const secondCell = String(row.getCell(2).value || "").toUpperCase();
      const thirdCell = String(row.getCell(3).value || "").toUpperCase();
      const fourthCell = String(row.getCell(4).value || "").toUpperCase();

      // Look for typical header patterns
      if (
        firstCell.includes("SR") ||
        secondCell.includes("EMP") ||
        secondCell.includes("CODE") ||
        thirdCell.includes("NAME") ||
        fourthCell.includes("NAME")
      ) {
        headerRowIndex = rowNumber;
        console.log(`✅ Found header at row ${rowNumber}`);
        return;
      }
    });

    if (headerRowIndex === 0) {
      console.warn("⚠️ Header row not found, assuming row 1 is header");
      headerRowIndex = 1;
    }

    // Process data rows
    let processedCount = 0;

    const isCustomTimingOT = sheetType === "09to06";
    const isFullNightOT = sheetType === "fullnight";
    const isMaintenance = sheetType === "maintenance";

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return; // Skip header and above

      // [NEW] Logic for Maintenance file (simple list of employees)
      if (isMaintenance) {
        const empCodeCell = row.getCell(2).value; // Col B
        const nameCell = row.getCell(3).value; // Col C

        if (empCodeCell && nameCell) {
          const empCode = String(empCodeCell).trim();
          const empName = String(nameCell).trim();

          if (empCode && empName && !empCode.toUpperCase().includes("CODE")) {
            employees.push({
              empCode,
              empName,
              fromDate: 1, // Not applicable
              toDate: 31, // Not applicable
              otType: sheetType,
            });
            processedCount++;
          }
        }
      }
      // [NEW] Logic for Full Night Stay (uses HOURS col G)
      else if (isFullNightOT) {
        const empCodeCell = row.getCell(2).value; // Col B
        const nameCell = row.getCell(4).value; // Col D
        const hoursCell = row.getCell(7).value; // Col G

        console.log(
          `Row ${rowNumber}: Code=${empCodeCell}, Name=${nameCell}, Hours=${hoursCell}`
        );

        if (empCodeCell && nameCell) {
          const empCode = String(empCodeCell).trim();
          const empName = String(nameCell).trim();
          const hours = Number(String(hoursCell || "0").trim()) || 0;

          // Skip header-like rows
          const upperCode = empCode.toUpperCase();
          const upperName = empName.toUpperCase();
          if (
            upperCode.includes("CODE") ||
            upperCode.includes("EMP") ||
            upperCode.includes("SR") ||
            upperName.includes("NAME") ||
            empCode === "" ||
            empName === ""
          ) {
            console.log(` 	 ⏭️ Skipping header/empty row`);
            return;
          }

          if (hours > 0) {
            console.log(
              ` 	 ✅ Adding employee: ${empName} (${empCode}) - ${hours} hours`
            );
            employees.push({
              empCode,
              empName,
              fromDate: 1,
              toDate: 31,
              totalHours: hours, // Use the value from HOURS column
              customTime: "", // Not applicable
              otType: sheetType,
            });
            processedCount++;
          } else {
            console.log(
              ` 	 ⚠️ Skipping employee with 0 hours: ${empName} (${empCode})`
            );
          }
        }
      }
      // Logic for 09to06 (uses TIME col D)
      else if (isCustomTimingOT) {
        const empCodeCell = row.getCell(2).value; // Col B
        const nameCell = row.getCell(3).value; // Col C
        const timeCell = row.getCell(4).value; // Col D

        console.log(
          `Row ${rowNumber}: Code=${empCodeCell}, Name=${nameCell}, Time=${timeCell}`
        );

        if (empCodeCell && nameCell) {
          const empCode = String(empCodeCell).trim();
          const empName = String(nameCell).trim();

          // Skip header-like rows
          const upperCode = empCode.toUpperCase();
          const upperName = empName.toUpperCase();
          if (
            upperCode.includes("CODE") ||
            upperCode.includes("EMP") ||
            upperCode.includes("SR") ||
            upperName.includes("NAME") ||
            empCode === "" ||
            empName === ""
          ) {
            console.log(` 	 ⏭️ Skipping header/empty row`);
            return;
          }

          // Parse the time value to get hours
          let hours = 0;
          let customTimeStr = ""; // 🆕 Store the original time string

          if (timeCell !== null && timeCell !== undefined) {
            const timeStr = String(timeCell).trim();
            customTimeStr = timeStr; // 🆕 Save the original string

            // Handle formats like "9:00 TO 6:00" or "8:45 TO 17:45"
            if (timeStr.includes("TO") || timeStr.includes("to")) {
              const parts = timeStr.split(/TO|to/i);
              if (parts.length === 2) {
                const startTime = parts[0].trim();
                const endTime = parts[1].trim();

                // Parse start and end times
                const parseTime = (timeStr: string): number => {
                  const match = timeStr.match(/(\d+):(\d+)/);
                  if (match) {
                    const hours = parseInt(match[1]);
                    const minutes = parseInt(match[2]);
                    return hours + minutes / 60;
                  }
                  return 0;
                };

                const startHours = parseTime(startTime);
                const endHours = parseTime(endTime);

                // Calculate duration
                if (endHours > startHours) {
                  hours = endHours - startHours;
                } else if (endHours < startHours) {
                  // Handle overnight shifts
                  hours = 24 - startHours + endHours;
                }

                console.log(
                  ` 	 📊 Parsed time: ${startTime} to ${endTime} = ${hours.toFixed(
                    2
                  )} hours`
                );
              }
            } else if (timeStr.includes(":")) {
              hours = parseFloat(timeStr) || 0;
            } else {
              hours = Number(timeStr) || 0;
            }
          }

          // Only add if hours > 0
          if (hours > 0 && customTimeStr) {
            // 🆕 Check for customTimeStr too
            console.log(
              ` 	 ✅ Adding employee: ${empName} (${empCode}) - ${hours.toFixed(
                2
              )} hours (${customTimeStr})`
            );

            employees.push({
              empCode,
              empName,
              fromDate: 1,
              toDate: 31,
              totalHours: hours,
              customTime: customTimeStr, // 🆕 Pass the actual time string
              otType: sheetType,
            });

            processedCount++;
          } else {
            console.log(
              ` 	 ⚠️ Skipping employee with 0 hours or missing time: ${empName} (${empCode})`
            );
          }
        }
      }
      // Logic for Staff OT Granted (default)
      else {
        // For Staff OT Granted and other types: Original logic
        let empCodeCell = row.getCell(2).value; // Try B first
        let nameCell = row.getCell(3).value;
        let fromCell = row.getCell(4).value;
        let toCell = row.getCell(5).value;

        // If column B looks like a name or is empty, try column A for code
        if (!empCodeCell || String(empCodeCell).length > 10) {
          empCodeCell = row.getCell(1).value;
          nameCell = row.getCell(2).value;
          fromCell = row.getCell(3).value;
          toCell = row.getCell(4).value;
        }

        if (empCodeCell && nameCell) {
          const empCode = String(empCodeCell).trim();
          const empName = String(nameCell).trim();

          // Skip header-like rows
          const upperCode = empCode.toUpperCase();
          if (
            upperCode.includes("CODE") ||
            upperCode.includes("SR") ||
            upperCode.includes("NO") ||
            empCode === "" ||
            empName === ""
          ) {
            return;
          }

          // Parse dates with fallback to 1 and 31
          let fromDate = 1;
          let toDate = 31;

          if (fromCell) {
            const fromNum = Number(fromCell);
            if (!isNaN(fromNum) && fromNum >= 1 && fromNum <= 31) {
              fromDate = fromNum;
            }
          }

          if (toCell) {
            const toNum = Number(toCell);
            if (!isNaN(toNum) && toNum >= 1 && toNum <= 31) {
              toDate = toNum;
            }
          }

          employees.push({
            empCode,
            empName,
            fromDate,
            toDate,
            otType: sheetType,
          });

          processedCount++;
        }
      }
    });

    console.log(
      `✅ Processed ${processedCount} ${sheetType} OT employees from ${file.name}`
    );

    if (processedCount > 0) {
      console.log("📋 First 5 employees:", employees.slice(0, 5));
    } else {
      console.warn("⚠️ No employees were processed! Check if:");
      console.warn(" 	 1. The sheet has data after the header row");
      console.warn(" 	 2. Employee codes are in the correct column");
      console.warn(" 	 3. Employee names are present");
      if (isCustomTimingOT) {
        console.warn(' 	 4. Time values are in the format "9:00 TO 6:00"');
      } else if (isFullNightOT) {
        console.warn(' 	 4. "Hours" values are in column G');
      } else if (isMaintenance) {
        console.warn(" 	 4. Employee codes/names are in columns B & C");
      } else {
        console.warn(" 	 4. Date ranges are provided");
      }
    }

    return employees;
  } catch (error) {
    console.error(`❌ Error processing OT sheet:`, error);
    return [];
  }
}
