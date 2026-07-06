import { createAssistantText } from "@/lib/openai";
import { streamPlainText } from "@/lib/stream";
import { requireStudioApiAccess, studioRoleGroups } from "@/lib/studio-auth";

export async function POST(request: Request) {
  const access = await requireStudioApiAccess(studioRoleGroups.contentEditors);
  if (access instanceof Response) {
    return access;
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
  };
  const message = body.message?.trim();

  if (!message) {
    return Response.json({ error: "Chybí zpráva pro asistenta." }, { status: 400 });
  }

  if (message.length > 2000) {
    return Response.json({ error: "Zpráva je příliš dlouhá." }, { status: 413 });
  }

  const assistantText = await createAssistantText(message).catch((error: unknown) => {
    console.error(error);
    return "AI služba teď není dostupná. Návrh nebyl aplikován a nic se nepublikovalo.";
  });

  return new Response(streamPlainText(assistantText), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
