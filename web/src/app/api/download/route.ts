import { NextResponse } from "next/server";
import { getAppDownloadUrl } from "../../../lib/download";

export function GET(request: Request) {
  return NextResponse.redirect(getAppDownloadUrl(request.url));
}
