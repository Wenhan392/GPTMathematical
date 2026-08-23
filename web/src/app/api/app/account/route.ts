import { NextResponse } from "next/server";
import {
  bearerToken,
  getAppAccountState,
  getLicenseForAccountToken
} from "../../../../lib/fulfillment";

export async function GET(request: Request) {
  try {
    const license = await getLicenseForAccountToken(bearerToken(request));
    if (!license) {
      return NextResponse.json({
        ok: false,
        account: {
          signedIn: false,
          plan: "signed_out",
          status: "signed_out",
          billingPortalAvailable: false,
          message: "Start a free account to export Word and PDF files."
        }
      }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      account: await getAppAccountState(license)
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Could not load account." },
      { status: 500 }
    );
  }
}
