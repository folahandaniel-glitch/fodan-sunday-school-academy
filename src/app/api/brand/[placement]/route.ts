import { servePlacement } from "@/server/logo-serve";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ placement: string }> }) {
  const { placement } = await params;
  return servePlacement(placement);
}
