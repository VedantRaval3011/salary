import * as ExcelJS from 'exceljs';
import { ProcessedExcelData, EmployeeData } from '@/lib/types';

export async function exportToExcel(data: ProcessedExcelData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Attendance Report');

  let currentRow = 1;

  // Row 1: Title
  const titleCell = worksheet.getCell(currentRow, 1);
  worksheet.mergeCells(currentRow, 1, currentRow, 31);
  titleCell.value = `Employee's Performance Register\nFor Period   : ${data.period}`;
  titleCell.alignment = { wrapText: true, vertical: 'top' };
  titleCell.font = { bold: true, size: 12 };
  worksheet.getRow(currentRow).height = 30;
  currentRow++;

  // Row 2: Empty
  currentRow++;

  // Row 3: Empty
  currentRow++;

  // Row 4: Empty
  currentRow++;

  // Track last company name to know when to show it
  let lastCompanyName = '';

  // Process each employee
  data.employees.forEach((employee: EmployeeData, index: number) => {
    // Check if employee has a company name
    const hasCompanyName = employee.companyName && employee.companyName.trim() !== '';
    
    // Show company name if:
    // 1. It's the first employee, OR
    // 2. This employee's company is different from the last shown company
    const showCompanyName = hasCompanyName && (employee.companyName !== lastCompanyName);
    
    // Only add company name row if employee has a company name and it's different from last
    if (showCompanyName) {
      const companyCell = worksheet.getCell(currentRow, 1);
      companyCell.value = `Company Name :  ${employee.companyName}`;
      currentRow++;
      
      // Empty row after company name
      currentRow++;
      
      // Update last company name
      lastCompanyName = employee.companyName;
    }

    // Check if employee has a department
    const hasDepartment = employee.department && employee.department.trim() !== '';
    
    // Only add department row if employee has a department
    if (hasDepartment) {
      const deptCell = worksheet.getCell(currentRow, 1);
      deptCell.value = `Department  :   ${employee.department}`;
      currentRow++;
      
      // Empty row after department
      currentRow++;
    }

    // Employee Info Row (always shown)
    const empInfoRow = worksheet.getRow(currentRow);
    empInfoRow.getCell(1).value = `Emp Code :  ${employee.empCode}`;
    empInfoRow.getCell(4).value = `Emp Name :  ${employee.empName}`;
    empInfoRow.getCell(9).value = `Present : ${employee.present.toFixed(2)}`;
    empInfoRow.getCell(11).value = `OD : ${employee.od.toFixed(2)}`;
    empInfoRow.getCell(13).value = `Absent : ${employee.absent.toFixed(2)}`;
    empInfoRow.getCell(15).value = `Holidays : ${employee.holiday.toFixed(2)}`;
    empInfoRow.getCell(17).value = `Weekly Off : ${employee.weekOff.toFixed(2)}`;
    
    // Calculate totals
    const totalOTHrs = employee.days.reduce((sum, day) => {
      const otHrs = day.attendance.otHrs;
      if (otHrs && otHrs !== '0:00') {
        const [hours, mins] = otHrs.split(':').map(Number);
        return sum + hours * 60 + mins;
      }
      return sum;
    }, 0);
    
    const totalWorkHrs = employee.days.reduce((sum, day) => {
      const workHrs = day.attendance.workHrs;
      if (workHrs && workHrs !== '0:00') {
        const [hours, mins] = workHrs.split(':').map(Number);
        return sum + hours * 60 + mins;
      }
      return sum;
    }, 0);
    
    empInfoRow.getCell(19).value = `Leave : 0.00`;
    empInfoRow.getCell(21).value = `OT Hrs : ${Math.floor(totalOTHrs / 60)}:${String(totalOTHrs % 60).padStart(2, '0')}`;
    empInfoRow.getCell(23).value = `Work Hrs : ${Math.floor(totalWorkHrs / 60)}:${String(totalWorkHrs % 60).padStart(2, '0')}`;
    currentRow++;

    // Empty row
    currentRow++;

    // Date numbers row
    const dateRow = worksheet.getRow(currentRow);
    dateRow.getCell(1).value = '';
    employee.days.forEach((day, idx) => {
      dateRow.getCell(idx + 2).value = day.date;
    });
    currentRow++;

    // Day names row
    const dayRow = worksheet.getRow(currentRow);
    dayRow.getCell(1).value = '';
    employee.days.forEach((day, idx) => {
      dayRow.getCell(idx + 2).value = day.day;
    });
    currentRow++;

    // Shift row
    const shiftRow = worksheet.getRow(currentRow);
    shiftRow.getCell(1).value = 'Shift';
    employee.days.forEach((day, idx) => {
      shiftRow.getCell(idx + 2).value = day.attendance.shift;
    });
    currentRow++;

    // In Time row
    const inTimeRow = worksheet.getRow(currentRow);
    inTimeRow.getCell(1).value = 'In Time';
    employee.days.forEach((day, idx) => {
      inTimeRow.getCell(idx + 2).value = day.attendance.inTime;
    });
    currentRow++;

    // Out Time row
    const outTimeRow = worksheet.getRow(currentRow);
    outTimeRow.getCell(1).value = 'Out Time';
    employee.days.forEach((day, idx) => {
      outTimeRow.getCell(idx + 2).value = day.attendance.outTime;
    });
    currentRow++;

    // Late Mins row
    const lateMinsRow = worksheet.getRow(currentRow);
    lateMinsRow.getCell(1).value = 'Late Mins';
    employee.days.forEach((day, idx) => {
      lateMinsRow.getCell(idx + 2).value = day.attendance.lateMins;
    });
    currentRow++;

    // Early Dep row
    const earlyDepRow = worksheet.getRow(currentRow);
    earlyDepRow.getCell(1).value = 'Early Dep';
    employee.days.forEach((day, idx) => {
      earlyDepRow.getCell(idx + 2).value = day.attendance.earlyDep;
    });
    currentRow++;

    // OT Hrs row
    const otHrsRow = worksheet.getRow(currentRow);
    otHrsRow.getCell(1).value = 'OT Hrs';
    employee.days.forEach((day, idx) => {
      otHrsRow.getCell(idx + 2).value = day.attendance.otHrs;
    });
    currentRow++;

    // Work Hrs row
    const workHrsRow = worksheet.getRow(currentRow);
    workHrsRow.getCell(1).value = 'Work Hrs';
    employee.days.forEach((day, idx) => {
      workHrsRow.getCell(idx + 2).value = day.attendance.workHrs;
    });
    currentRow++;

    // Status row
    const statusRow = worksheet.getRow(currentRow);
    statusRow.getCell(1).value = 'Status';
    employee.days.forEach((day, idx) => {
      statusRow.getCell(idx + 2).value = day.attendance.status;
    });
    currentRow++;

    // Two empty rows after each employee
    currentRow++;
    currentRow++;
  });

  // Set column widths
  worksheet.getColumn(1).width = 15;
  for (let i = 2; i <= 32; i++) {
    worksheet.getColumn(i).width = 10;
  }

  // Generate and download file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Employee_Attendance_Improved_${data.period.replace(/\//g, '-').replace(/\s+/g, '_')}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}
