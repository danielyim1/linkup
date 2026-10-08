import { NextResponse } from "next/server";
import { UserError } from "@/server/services/rooms";

export function handleError(e: unknown) {
  if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
