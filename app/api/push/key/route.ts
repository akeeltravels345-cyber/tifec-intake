import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// The VAPID public key the browser needs to create a push subscription. Public
// by design (it only lets a browser subscribe; sending needs the private key).
export async function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY || "" });
}
