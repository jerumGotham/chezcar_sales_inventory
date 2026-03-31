import { NextResponse } from "next/server";
import { orders } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({ data: orders });
}
