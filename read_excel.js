const XLSX = require('xlsx');
const path = require('path');

// Read Worker Tulsi
const workerFile = path.join(__dirname, '11. Worker Tulsi.xlsx');
const wb = XLSX.readFile(workerFile);

console.log('=== Worker Tulsi Sheets ===');
console.log('Sheet names:', wb.SheetNames);

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  console.log(`\nSheet: "${name}", Range: ${ws['!ref']}`);
  
  // Print first 80 rows to see the structure
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(data.length, 80); i++) {
    const row = data[i];
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length > 0) {
      console.log(`Row ${i+1}: ${JSON.stringify(row.slice(0, 20))}`);
    }
  }
  
  // Also check last rows for Grand Total
  console.log(`\n--- Last 30 rows of "${name}" ---`);
  for (let i = Math.max(0, data.length - 30); i < data.length; i++) {
    const row = data[i];
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length > 0) {
      console.log(`Row ${i+1}: ${JSON.stringify(row.slice(0, 20))}`);
    }
  }
}

// Read Month Wise Sheet  
console.log('\n\n=== Month Wise Sheet ===');
const monthFile = path.join(__dirname, '13.Month Wise Sheet.xlsx');
const wb2 = XLSX.readFile(monthFile);
console.log('Sheet names:', wb2.SheetNames);

for (const name of wb2.SheetNames) {
  const ws = wb2.Sheets[name];
  console.log(`\nSheet: "${name}", Range: ${ws['!ref']}`);
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length > 0) {
      console.log(`Row ${i+1}: ${JSON.stringify(row)}`);
    }
  }
}

// Staff Tulsi too
console.log('\n\n=== Staff Tulsi Sheets ===');
const staffFile = path.join(__dirname, '12. Staff Tulsi.xlsx');
const wb3 = XLSX.readFile(staffFile);
console.log('Sheet names:', wb3.SheetNames);

for (const name of wb3.SheetNames) {
  const ws = wb3.Sheets[name];
  console.log(`\nSheet: "${name}", Range: ${ws['!ref']}`);
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(data.length, 60); i++) {
    const row = data[i];
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length > 0) {
      console.log(`Row ${i+1}: ${JSON.stringify(row.slice(0, 20))}`);
    }
  }
  console.log(`\n--- Last 30 rows of "${name}" ---`);
  for (let i = Math.max(0, data.length - 30); i < data.length; i++) {
    const row = data[i];
    const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
    if (nonEmpty.length > 0) {
      console.log(`Row ${i+1}: ${JSON.stringify(row.slice(0, 20))}`);
    }
  }
}
