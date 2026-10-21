import { servePlacement } from "@/server/logo-serve";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return servePlacement(token);
}
