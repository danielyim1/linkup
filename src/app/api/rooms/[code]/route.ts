import { NextResponse } from "next/server";
import { roomExists } from "@/server/services/rooms";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = await roomExists(code);
  return room ? NextResponse.json(room) : NextResponse.json({ error: "No room with that code" }, { status: 404 });
}
