"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="container-page py-24 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-mist">The problem has been logged. Please try again; if it keeps happening, contact the Academy.</p>
      <button className="btn btn-primary mt-6" onClick={() => reset()}>Try again</button>
    </main>
  );
}
