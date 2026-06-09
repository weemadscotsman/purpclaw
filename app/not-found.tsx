import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
        <p className="text-sm uppercase tracking-[0.24em] text-fuchsia-300">PURPCLAW</p>
        <h1 className="mt-4 text-4xl font-bold">Route not found</h1>
        <p className="mt-3 text-zinc-300">
          This panel is not registered in the active control plane.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex w-fit border border-fuchsia-400/50 px-4 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/15"
        >
          Return to Mission Control
        </Link>
      </div>
    </main>
  );
}
