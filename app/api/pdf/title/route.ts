import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxies PDF title detection to the PDF Extract API.
 * Keeps PDF_API_KEY server-side (never NEXT_PUBLIC_*).
 */
export async function POST(req: NextRequest) {
  const base = (
    process.env.PDF_API_URL ||
    "https://web-production-05065.up.railway.app"
  ).replace(/\/$/, "");
  const key = process.env.PDF_API_KEY ?? "";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid multipart body" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file is required" },
      { status: 400 },
    );
  }

  const outbound = new FormData();
  outbound.append("file", file, file.name || "document.pdf");
  const titleMax = form.get("title_max_pages");
  if (typeof titleMax === "string" && titleMax.trim()) {
    outbound.append("title_max_pages", titleMax.trim());
  }

  try {
    const res = await fetch(`${base}/v1/title`, {
      method: "POST",
      headers: key ? { "X-API-Key": key } : undefined,
      body: outbound,
      // Title peek is fast; keep a tight budget so the form stays snappy.
      signal: AbortSignal.timeout(20_000),
    });

    const data: unknown = await res.json().catch(() => ({
      ok: false,
      error: "invalid response from title api",
    }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "title api unreachable";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502 },
    );
  }
}
