import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  console.log("📥 Received file:", file.name);

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  console.log("✅ Workbook loaded:", sheetName);
  console.log("📊 Sheet range:", worksheet["!ref"]);

  // Your same process logic here (logs will appear in terminal)
  return NextResponse.json({ success: true });
}
