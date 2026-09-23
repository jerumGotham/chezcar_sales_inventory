import Image from "next/image";

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
            Predator Operations
          </p>

          <h1 className="max-w-xl text-5xl font-bold leading-tight">
            Sales, inventory, and monitoring in one place.
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-300">
            Monitor sales, manage inventory across branches, track stock
            movements, and keep daily operations organized in one secure system.
          </p>
        </section>
        {/* The repo's predator-mark.png is dark ink for light surfaces, which
            is right for the sidebar and wrong here. This light variant, drawn
            from the same original, is the one that reads on the dark page.
            It also sits in the card's own column, so it survives the
            breakpoint that hides the copy beside it. */}
        <div className="flex w-full max-w-md flex-col items-center gap-8">
          <Image
            src="/predator-mark-light.png"
            alt="Predator Offroad PH"
            width={2029}
            height={369}
            className="h-auto w-[320px] max-w-full"
            priority
          />
          <SignInForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  );
}
