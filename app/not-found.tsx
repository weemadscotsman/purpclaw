import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0">
      <p className="text-xs uppercase tracking-[0.24em] text-fuchsia-400 font-mono mb-2">PURPCLAW</p>
      <h1 className="text-2xl font-bold text-white/80">Route not found</h1>
      <p className="mt-2 text-sm text-white/40 max-w-md text-center">
        This panel is not registered in the active control plane.
      </p>
      <Link
        href="/mission"
        className="mt-6 inline-flex border border-fuchsia-400/40 px-5 py-2 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/15 transition-colors rounded-lg"
      >
        Return to Mission Control
      </Link>
    </div>
  );
}
