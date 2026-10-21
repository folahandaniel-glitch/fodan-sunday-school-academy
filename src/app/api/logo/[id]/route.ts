import { logoById, serveLogoRow } from "@/server/logo-serve";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await logoById(id);
  return l ? serveLogoRow(l) : new Response("Not found", { status: 404 });
}
