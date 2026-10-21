import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ActionForm, PasswordInput } from "@/components/forms";
import { loginAction } from "@/app/actions/auth";
import { optionalUser, homeFor, safeNext } from "@/server/guards";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const user = await optionalUser();
  if (user) redirect(safeNext(sp.next) ?? (await homeFor(user)));
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">Sign in</h1>
      {sp.reset && <div className="mt-3"><Alert tone="ok">Your password was changed. Sign in with the new password.</Alert></div>}
      <ActionForm action={loginAction} submit="Sign in" className="mt-4" submitClass="w-full">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div><label className="label" htmlFor="identifier">Email or username</label><input id="identifier" name="identifier" className="input" autoComplete="username" required autoFocus /></div>
        <div><label className="label" htmlFor="password">Password</label><PasswordInput id="password" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" className="h-4 w-4" /> Keep me signed in on this device</label>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/forgot-password">Forgot your password?</Link></p>
      <hr className="my-4 border-line" />
      <p className="text-sm text-mist">New here? <Link href="/register" className="font-semibold">Create a member account</Link> to join your church, or <Link href="/register/church" className="font-semibold">register your church</Link>.</p>
    </div>
  );
}
