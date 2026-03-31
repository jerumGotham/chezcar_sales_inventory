import { NextResponse } from "next/server";
import { customers } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ data: customers });
}
