import { NextResponse } from "next/server";
import {
  createAppAccountSession,
  ensureFreeLicenseForEmail,
  normalizeEmail
} from "../../../../lib/fulfillment";

interface FreeAccountRequest {
  email?: string;
  deviceIdHash?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as FreeAccountRequest;
    const email = normalizeEmail(body.email);
    const deviceIdHash = String(body.deviceIdHash || "").trim();

    if (!email || !deviceIdHash) {
      return NextResponse.json({ ok: false, message: "Enter your email to start the free plan." }, { status: 400 });
    }

    const license = await ensureFreeLicenseForEmail({ email });
    const session = await createAppAccountSession({ license, deviceIdHash });

    return NextResponse.json({
      ok: true,
      accountToken: session.accountToken,
      account: session.account
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Could not start free account." },
      { status: 500 }
    );
  }
}
