import { NextResponse } from "next/server";
import { parseLunchSheetFromBuffer } from "@/lib/parseLunchSheet";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  console.log("📥 Received file:", file?.name);

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const parsedData = parseLunchSheetFromBuffer(buf);

  const meta = {
    employeeCount: parsedData.length,
    totalDays: parsedData.reduce((sum, e) => sum + e.days.length, 0),
  };

  console.log("✅ Parsed employees:", meta.employeeCount);

  return NextResponse.json({ data: parsedData, meta });
}
