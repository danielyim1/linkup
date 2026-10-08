import { NextResponse } from "next/server";
import { joinRoom } from "@/server/services/rooms";
import { handleError } from "@/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await req.json();
    return NextResponse.json(await joinRoom(code, body.name));
  } catch (e) {
    return handleError(e);
  }
}
