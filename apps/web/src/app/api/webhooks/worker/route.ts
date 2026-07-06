import { verifyWorkerSignature } from "@/lib/security";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWorkerSignature(request, rawBody)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = rawBody ? safeJsonParse(rawBody) : null;
  if (rawBody && body === null) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    accepted: body,
    note: "Worker callback přijat. Produkční verze aktualizuje render_jobs, exports a audit_log."
  });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
