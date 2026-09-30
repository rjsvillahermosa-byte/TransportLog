import { Link } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { useSiteContent, PRICING_DEFAULTS, PLAN_DEFAULTS } from "../lib/siteContent";

// Public Pricing / Subscription page. Every card element — name, tagline,
// price, period, caps line, CTA, inclusions, highlight flag — is editable
// from the Site Editor (pricing tab) and stored in site_content.

const PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-[11px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";
const SECONDARY_BTN =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-sand bg-white px-5 text-[11px] font-bold uppercase tracking-wide text-cocoa transition-colors hover:bg-mint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

export default function Pricing() {
  const c = useSiteContent("pricing", PRICING_DEFAULTS);
  const plans = Array.isArray(c.plans) && c.plans.length === 4 ? c.plans : PLAN_DEFAULTS;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sand/60 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-heading text-lg font-bold text-cocoa">FleetFlow</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-mocha md:flex">
            <Link to="/" className="hover:text-brand">Home</Link>
            <Link to="/pricing" className="font-semibold text-brand">Pricing</Link>
            <Link to="/faqs" className="hover:text-brand">FAQs</Link>
            <Link to="/reviews" className="hover:text-brand">Reviews</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-3 text-xs font-bold uppercase tracking-wide text-cocoa hover:text-brand">
              Sign in
            </Link>
            <Link to="/register" className={`${PRIMARY_BTN} !h-10 !px-4`}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-12">
        {/* Hero */}
        <section className="text-center">
          <p className="mb-3 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
            {c.pricing_badge}
          </p>
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-cocoa sm:text-4xl">
            {c.pricing_title}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-mocha">
            {c.pricing_body}
          </p>
        </section>

        {/* Plan cards — compact: 4 across on desktop, tighter padding/type */}
        <section className="mt-10 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id || p.name}
              className={
                "relative flex flex-col rounded-2xl border bg-white p-4 shadow-card " +
                (p.highlight
                  ? "border-brand ring-2 ring-brand/30"
                  : "border-sand/60")
              }
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  Most popular
                </span>
              )}
              <p className="font-heading text-base font-bold text-cocoa">{p.name}</p>
              <p className="mt-0.5 min-h-[32px] text-[11px] leading-snug text-taupe">{p.tagline}</p>
              <p className="mt-2.5">
                <span className="font-heading text-2xl font-extrabold text-cocoa">{p.price}</span>
                <span className="ml-1 text-[11px] text-taupe">{p.per}</span>
              </p>
              <p className="mt-2 rounded-lg bg-cream px-2.5 py-1.5 text-[11px] font-semibold text-brand">
                {p.caps}
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {(p.includes || []).map((inc) => (
                  <li key={inc} className="flex items-start gap-1.5 text-xs text-mocha">
                    {inc === inc.toUpperCase() ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-brand">{inc}</span>
                    ) : (
                      <>
                        <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" />
                        {inc}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`${p.highlight ? PRIMARY_BTN : SECONDARY_BTN} mt-4 w-full`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </section>

        {/* Final CTA */}
        <section className="mx-auto mt-14 max-w-3xl rounded-3xl border border-brand/30 bg-mint/40 p-7 text-center">
          <h2 className="font-heading text-xl font-bold text-cocoa">
            Ready in one afternoon
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-mocha">
            Sign up with your client code, add your vehicles, and dispatch your
            first mission today.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/register" className={PRIMARY_BTN}>Create your account</Link>
            <Link to="/login" className={SECONDARY_BTN}>Sign in</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-sand/60 py-8 text-center text-xs text-taupe">
        FleetFlow — intelligent fleet &amp; transport management system ·{" "}
        <Link to="/privacy" className="hover:text-brand">Privacy</Link> ·{" "}
        <Link to="/faqs" className="hover:text-brand">FAQs</Link> ·{" "}
        <Link to="/reviews" className="hover:text-brand">Reviews</Link>
      </footer>
    </div>
  );
}
