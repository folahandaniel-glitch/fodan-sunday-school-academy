import { servePlacement } from "@/server/logo-serve";

export const dynamic = "force-dynamic";
export async function GET() { return servePlacement("favicon-ico"); }
