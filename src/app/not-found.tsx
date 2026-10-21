import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container-page py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-gold-700">404</p>
      <h1 className="mt-2 text-3xl">We could not find that page</h1>
      <p className="mx-auto mt-2 max-w-md text-mist">It may have moved, or you may not have access to it.</p>
      <Link className="btn btn-primary mt-6" href="/">Go to the home page</Link>
    </main>
  );
}
