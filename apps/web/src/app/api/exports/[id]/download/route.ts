import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  demoDataEnabled,
  isUuidLike
} from "@/lib/security";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";
import { getSupabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase-admin";

type ExportRow = {
  bucket: string;
  object_path: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireStudioApiAccess(studioRoleGroups.all);
  if (access instanceof Response) {
    return access;
  }

  const { id } = await params;
  if (demoDataEnabled() && id === "export-demo") {
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return localDemoExportResponse(request, inline);
  }

  if (!isUuidLike(id)) {
    return Response.json({ error: "Neplatné ID exportu." }, { status: 400 });
  }

  if (access.mode !== "authenticated") {
    return Response.json(
      {
        error: "Stažení produkčního exportu vyžaduje přihlášení do TV Studia.",
        code: "authenticated_export_required"
      },
      { status: 501 }
    );
  }

  if (!supabaseAdminConfigured()) {
    return Response.json(
      {
        error: "Stažení exportu zatím není napojené na produkční Supabase/worker integraci.",
        code: "integration_required"
      },
      { status: 501 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: exportRow, error } = await supabase!
    .from("exports")
    .select("bucket, object_path")
    .eq("id", id)
    .eq("org_id", access.orgId)
    .eq("format", "mp4")
    .maybeSingle<ExportRow>();

  if (error) {
    return Response.json({ error: `Export lookup failed: ${error.message}` }, { status: 500 });
  }

  if (!exportRow) {
    return Response.json({ error: "Export nebyl nalezen." }, { status: 404 });
  }

  if (!isOrgScopedStoragePath(exportRow.object_path, access.orgId)) {
    return Response.json(
      {
        error: "Export má neplatnou Storage cestu pro tuto organizaci.",
        code: "export_storage_scope_mismatch"
      },
      { status: 500 }
    );
  }

  const { data: signedUrl, error: signedUrlError } = await supabase!.storage
    .from(exportRow.bucket)
    .createSignedUrl(exportRow.object_path, 15 * 60, {
      download: `masico-${id}.mp4`
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return Response.json(
      { error: `Signed URL failed: ${signedUrlError?.message ?? "missing URL"}` },
      { status: 500 }
    );
  }

  return Response.redirect(signedUrl.signedUrl, 302);
}

async function localDemoExportResponse(request: Request, inline: boolean) {
  const path = join(process.cwd(), "../../audit-artifacts/final-smoke-render.mp4");

  try {
    const [file, stats] = await Promise.all([readFile(path), stat(path)]);
    const contentDisposition = `${inline ? "inline" : "attachment"}; filename="masico-demo-loop.mp4"`;
    const baseHeaders = {
      "accept-ranges": "bytes",
      "cache-control": "no-store",
      "content-disposition": contentDisposition,
      "content-type": "video/mp4"
    };
    const range = request.headers.get("range");

    if (range) {
      const parsedRange = parseByteRange(range, stats.size);
      if (!parsedRange) {
        return new Response(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "content-range": `bytes */${stats.size}`
          }
        });
      }

      const chunk = file.subarray(parsedRange.start, parsedRange.end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-length": String(chunk.length),
          "content-range": `bytes ${parsedRange.start}-${parsedRange.end}/${stats.size}`
        }
      });
    }

    return new Response(file, {
      headers: {
        ...baseHeaders,
        "content-length": String(stats.size)
      }
    });
  } catch {
    return Response.json(
      {
        error: "Demo MP4 export zatím neexistuje. Spusťte `pnpm worker:smoke-render`.",
        code: "demo_export_missing"
      },
      { status: 404 }
    );
  }
}

function parseByteRange(range: string, size: number) {
  if (!range.startsWith("bytes=")) {
    return null;
  }

  const firstRange = range.slice("bytes=".length).split(",")[0]?.trim();
  if (!firstRange) {
    return null;
  }

  const [startText, endText] = firstRange.split("-");
  if (startText === "" && endText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

function isOrgScopedStoragePath(path: string, orgId: string) {
  return path === `org/${orgId}` || path.startsWith(`org/${orgId}/`);
}
