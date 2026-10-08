import { NextResponse } from "next/server";
import { createRoom } from "@/server/services/rooms";
import { handleError } from "@/server/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const creds = await createRoom({
      hostName: body.name,
      location: body.location,
      lat: body.lat,
      lng: body.lng,
      filters: body.filters,
    });
    return NextResponse.json(creds);
  } catch (e) {
    return handleError(e);
  }
}
