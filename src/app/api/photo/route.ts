import { NextResponse } from "next/server";
import { getGoogleProvider } from "@/server/places";

// Proxies Google Places photos so the API key never reaches the browser.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const w = Math.min(Number(url.searchParams.get("w")) || 900, 1600);
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return new NextResponse("Bad photo", { status: 400 });
  const google = getGoogleProvider();
  if (!google) return new NextResponse("Photos unavailable", { status: 404 });
  const photoUri = await google.photoUrl(name, w);
  if (!photoUri) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(photoUri, { status: 302, headers: { "Cache-Control": "public, max-age=3600" } });
}
