import { Link } from "react-router-dom";
import { Check, Minus, Sparkles } from "lucide-react";

// Public Pricing / Subscription page — reachable logged-out (like the landing)
// and logged-in. Plans mirror the real paywall tiers enforced by the platform
// (plan_type on organizations: trial / starter / pro / enterprise) — the caps
// shown here are what a new org actually gets, and the owner can tune any
// client's limits later in Console → Clients.

const PRIMARY_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";
const SECONDARY_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-sand bg-white px-6 text-xs font-bold uppercase tracking-wide text-cocoa transition-colors hover:bg-mint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

const PLANS = [
  {
    id: "trial",
    name: "Trial",
    tagline: "Kick the tires, free for 14 days",
    price: "₱0",
    per: "/ 14 days",
    cta: "Start free trial",
    highlight: false,
    caps: { vehicles: 2, users: 3 },
    includes: [
      "2 vehicles · 3 team seats",
      "Missions, New Booking & History",
      "QR-code booking links",
      "Fuel logging with price bands",
      "Odometer photo capture",
      "Email support",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For single-property hotels getting off paper",
    price: "₱1,500",
    per: "/ month",
    cta: "Choose Starter",
    highlight: false,
    caps: { vehicles: 5, users: 8 },
    includes: [
      "5 vehicles · 8 team seats",
      "Everything in Trial, plus:",
      "Driver management & assignments",
      "Service logs & renewal reminders",
      "Saved reports (print-ready)",
      "Role-based access (Supervisor+)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For growing fleets that need the full picture",
    price: "₱3,500",
    per: "/ month",
    cta: "Choose Pro",
    highlight: true,
    caps: { vehicles: 20, users: 25 },
    includes: [
      "20 vehicles · 25 team seats",
      "Everything in Starter, plus:",
      "Fuel integrity audit & fraud flags",
      "AI odometer photo scanning",
      "Booking location presets & client preferences",
      "Mileage analytics & per-department breakdowns",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For chains, transport firms & multi-site operations",
    price: "Custom",
    per: "talk to us",
    cta: "Contact us",
    highlight: false,
    caps: { vehicles: 100, users: 200 },
    includes: [
      "Up to 100 vehicles · 200 seats (or more)",
      "Everything in Pro, plus:",
      "Multi-organization management",
      "API access for PMS / website integration",
      "Custom onboarding & welcome kit",
      "Dedicated support channel",
    ],
  },
];

// Feature comparison — ✓ / — across the four tiers
const MATRIX = [
  { label: "Missions & bookings", trial: true, starter: true, pro: true, enterprise: true },
  { label: "QR booking codes", trial: true, starter: true, pro: true, enterprise: true },
  { label: "Fuel logging", trial: true, starter: true, pro: true, enterprise: true },
  { label: "Driver & vehicle management", trial: false, starter: true, pro: true, enterprise: true },
  { label: "Service logs & renewals board", trial: false, starter: true, pro: true, enterprise: true },
  { label: "Print-ready reports", trial: false, starter: true, pro: true, enterprise: true },
  { label: "Fuel fraud flags & audit", trial: false, starter: false, pro: true, enterprise: true },
  { label: "AI odometer photo scan", trial: false, starter: false, pro: true, enterprise: true },
  { label: "Booking presets & preferences", trial: false, starter: false, pro: true, enterprise: true },
  { label: "Mileage analytics", trial: false, starter: false, pro: true, enterprise: true },
  { label: "API access (PMS / website)", trial: false, starter: false, pro: false, enterprise: true },
  { label: "Multi-org management", trial: false, starter: false, pro: false, enterprise: true },
];

const FAQ = [
  {
    q: "How does billing work?",
    a: "Plans are billed monthly in Philippine pesos. Your FleetFlow operator records invoices per period — you receive them by email and can pay by bank transfer or e-wallet. Annual and quarterly cycles are available on request.",
  },
  {
    q: "What counts as a seat?",
    a: "Every team member who signs in — front office staff, supervisors, drivers, admins. Vehicles are counted separately, so adding one more car never costs you a user slot.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes — upgrades apply immediately, and your operator adjusts the caps on your organization the same day. Downgrades take effect at your next renewal.",
  },
  {
    q: "What happens when I hit a limit?",
    a: "The app tells you clearly — enrolling one more vehicle or team member above your cap asks you (or your FleetFlow operator) to raise the limit first. Nothing is silently blocked and no data is ever deleted.",
  },
  {
    q: "Is my data isolated from other clients?",
    a: "Completely. Every record belongs to your organization and is separated at the database level (row-level security) — not just hidden in the UI. Other clients, including us, cannot read your bookings, drivers, or staff directory.",
  },
  {
    q: "Is there an annual discount?",
    a: "Yes — ask for annual or quarterly billing when you sign up and your operator will set the cycle on your account.",
  },
];

export default function Pricing() {
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

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-12">
        {/* Hero */}
        <section className="text-center">
          <p className="mb-4 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
            Simple, per-fleet pricing
          </p>
          <h1 className="font-heading text-4xl font-extrabold leading-tight text-cocoa sm:text-5xl">
            Pay for your fleet, not for features
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-mocha">
            Every plan includes the full booking engine, offline-capable mobile app,
            and database-level data isolation. Pick the size that fits today —
            upgrade the day you need to.
          </p>
        </section>

        {/* Plan cards */}
        <section className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={
                "relative flex flex-col rounded-3xl border bg-white p-6 shadow-card " +
                (p.highlight
                  ? "border-brand ring-2 ring-brand/30"
                  : "border-sand/60")
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Most popular
                </span>
              )}
              <p className="font-heading text-lg font-bold text-cocoa">{p.name}</p>
              <p className="mt-1 min-h-[40px] text-xs leading-relaxed text-taupe">{p.tagline}</p>
              <p className="mt-4">
                <span className="font-heading text-4xl font-extrabold text-cocoa">{p.price}</span>
                <span className="ml-1 text-xs text-taupe">{p.per}</span>
              </p>
              <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-xs font-semibold text-brand">
                🚗 {p.caps.vehicles} vehicles · 👤 {p.caps.users} seats
              </p>
              <ul className="mt-4 flex-1 space-y-2.5">
                {p.includes.map((inc) => (
                  <li key={inc} className="flex items-start gap-2 text-sm text-mocha">
                    {inc.endsWith("plus:") ? (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-brand">{inc}</span>
                    ) : (
                      <>
                        <Check className="mt-0.5 h-4 w-4 flex-none text-brand" />
                        {inc}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                to="/register"
                className={`${p.highlight ? PRIMARY_BTN : SECONDARY_BTN} mt-6 w-full`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </section>

        {/* Comparison matrix */}
        <section className="mt-16">
          <h2 className="text-center font-heading text-2xl font-bold text-cocoa">
            Compare every feature
          </h2>
          <div className="mt-6 overflow-x-auto rounded-3xl border border-sand/60 bg-white shadow-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-taupe">
                  <th className="px-5 py-3.5 font-semibold">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="px-3 py-3.5 text-center font-semibold">
                      {p.name}
                      {p.highlight && <Sparkles className="ml-1 inline h-3.5 w-3.5 text-brand" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.label} className="border-b border-sand/60 last:border-0">
                    <td className="px-5 py-3 text-cocoa">{row.label}</td>
                    {(["trial", "starter", "pro", "enterprise"]).map((k) => (
                      <td key={k} className="px-3 py-3 text-center">
                        {row[k] ? (
                          <Check className="mx-auto h-4.5 w-4.5 h-[18px] w-[18px] text-brand" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-sand" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-center font-heading text-2xl font-bold text-cocoa">
            Questions, answered
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-sand/60 bg-white p-5 shadow-card">
                <summary className="cursor-pointer list-none font-semibold text-cocoa marker:hidden">
                  <span className="mr-2 inline-block text-brand transition-transform group-open:rotate-90">▸</span>
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-mocha">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto mt-16 max-w-3xl rounded-3xl border border-brand/30 bg-mint/40 p-8 text-center">
          <h2 className="font-heading text-2xl font-bold text-cocoa">
            Ready in one afternoon
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-mocha">
            Sign up with your client code, add your vehicles, and dispatch your
            first mission today. Your team can be onboarded from a single
            spreadsheet — we'll show you how.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
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
