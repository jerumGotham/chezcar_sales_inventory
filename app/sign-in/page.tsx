import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl: requestedCallbackUrl } = await searchParams;
  const callbackUrl =
    requestedCallbackUrl?.startsWith("/") &&
    !requestedCallbackUrl.startsWith("//")
      ? requestedCallbackUrl
      : "/dashboard";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.28),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,116,144,0.22),transparent_38%)]" />
      <div className="relative z-10 grid w-full max-w-5xl items-center justify-items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden text-white lg:block">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Chezcar Operations
          </p>

          <h1 className="max-w-xl text-5xl font-bold leading-tight">
            Sales, inventory, and operations in one place.
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
            Monitor sales, manage inventory across branches, track stock
            movements, and keep daily operations organized in one secure system.
          </p>
        </section>
        <SignInForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
