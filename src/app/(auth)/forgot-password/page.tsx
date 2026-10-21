import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/forms";
import { forgotAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Reset your password" };

export default function Forgot() {
  return (
    <div className="card card-pad mx-auto max-w-md">
      <h1 className="text-2xl">Reset your password</h1>
      <p className="mt-1 text-sm text-mist">Enter your email or username. If you registered without an email, ask your church administrator to reset it for you.</p>
      <ActionForm action={forgotAction} submit="Send reset link" className="mt-4" submitClass="w-full">
        <div><label className="label" htmlFor="identifier">Email or username</label><input id="identifier" name="identifier" className="input" required autoFocus /></div>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login">Back to sign in</Link></p>
    </div>
  );
}
