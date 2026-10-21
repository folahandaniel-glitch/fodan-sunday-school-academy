import { redirect } from "next/navigation";
import { requireOrg } from "@/server/guards";
import { confirmReturn } from "@/server/services/billing";
import { NotFoundError } from "@/server/org";

export const dynamic = "force-dynamic";

/** Landing page after checkout. The redirect itself grants nothing: access is activated only if the provider verifies the payment. */
export default async function BillingReturn({ searchParams }: { searchParams: Promise<{ ref?: string; reference?: string; trxref?: string; simulate?: string }> }) {
  const { ctx } = await requireOrg("billing.manage");
  const sp = await searchParams;
  const ref = sp.ref ?? sp.reference ?? sp.trxref;
  if (!ref) redirect("/church/billing");
  try {
    const r = await confirmReturn(ctx, ref, sp.simulate === "1");
    if (r.ok) redirect("/church/billing?paid=1");
    redirect(`/church/billing?error=${encodeURIComponent(r.reason === "pending" ? "We have not received confirmation of your payment yet. If you were charged, your plan will activate automatically within a few minutes." : "The payment could not be confirmed.")}`);
  } catch (e) {
    if (e instanceof NotFoundError) redirect("/church/billing?error=" + encodeURIComponent("Payment not found."));
    throw e;
  }
}
