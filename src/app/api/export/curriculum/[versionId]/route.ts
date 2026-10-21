import { COOKIE, resolveToken } from "@/server/auth/session";
import { cookies } from "next/headers";
import { platformCan } from "@/lib/permissions";
import { buildCurriculumDocx } from "@/server/export/docx";
import { NotFoundError } from "@/server/org";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** DOCX export for Super Admin / curriculum editors. Teacher guides contain facilitator notes; this route is staff-only. */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const s = await resolveToken((await cookies()).get(COOKIE)?.value);
  if (!s || (s.user.totpEnabled && !s.mfaOk) || !platformCan(s.user.platformRole, "curriculum.write")) return new Response("Not allowed.", { status: 403 });
  const mode = new URL(req.url).searchParams.get("mode") === "student" ? "student" : "teacher";
  const { versionId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(versionId)) return new Response("Not found.", { status: 404 });
  try {
    const { buffer, filename } = await buildCurriculumDocx(versionId, mode);
    await audit({ id: s.user.id, label: s.user.fullName, role: s.user.platformRole }, "curriculum.exported", { type: "version", id: versionId }, { mode });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NotFoundError) return new Response("Not found.", { status: 404 });
    throw e;
  }
}
