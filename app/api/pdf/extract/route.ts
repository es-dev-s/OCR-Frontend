import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxies full PDF extract to the PDF Extract API (server-side key).
 * Prefer `/api/pdf/title` for intake title detection.
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
  outbound.append(
    "include_pages",
    String(form.get("include_pages") ?? "true"),
  );
  outbound.append(
    "include_full_text",
    String(form.get("include_full_text") ?? "false"),
  );

  try {
    const res = await fetch(`${base}/v1/extract`, {
      method: "POST",
      headers: key ? { "X-API-Key": key } : undefined,
      body: outbound,
      signal: AbortSignal.timeout(120_000),
    });
    const data: unknown = await res.json().catch(() => ({
      ok: false,
      error: "invalid response from extract api",
    }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "extract api unreachable";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502 },
    );
  }
}
