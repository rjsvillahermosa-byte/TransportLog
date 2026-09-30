import { Link } from "react-router-dom";

// Public FAQs — standalone page (the Pricing page keeps its short FAQ; this
// is the full one). Grouped by theme, plain language, honest answers that
// match how the system actually works.

const GROUPS = [
  {
    group: "Getting started",
    items: [
      {
        q: "How do we sign up?",
        a: "Your FleetFlow operator creates a client code for your company. You register on the Register page with that code — your first signup becomes your organization's owner, and everyone after joins your team.",
      },
      {
        q: "How long does setup take?",
        a: "One afternoon. Vehicles are added with photos and expiry dates, drivers enroll by scanning their license, and your team can be bulk-enrolled from a single spreadsheet by your operator.",
      },
      {
        q: "Does it work on our existing phones?",
        a: "Yes — the driver app installs on any modern Android phone, and the full system runs in any browser. No special hardware, no servers to buy.",
      },
      {
        q: "What if the internet drops mid-mission?",
        a: "The driver app keeps working offline: odometer entries, photos and checklists are saved on the device and sync automatically when connection returns.",
      },
    ],
  },
  {
    group: "Daily use",
    items: [
      {
        q: "How does a mission actually run?",
        a: "Book → assign driver and vehicle → driver scans the vehicle's QR and completes the pre-mission checklist (tires, fuel, lights, brakes, fluids, documents) → snaps the odometer → drives → snaps the odometer at drop-off. Distance is computed automatically.",
      },
      {
        q: "Why the vehicle QR code?",
        a: "It binds the mission to the exact physical vehicle — no more 'I think it was the white van'. The system always knows who is driving which vehicle on which booking, and when it started.",
      },
      {
        q: "Can drivers edit the odometer reading?",
        a: "Drivers enter what the dashboard shows, verified by photo. Only admins can change a vehicle's baseline odometer, and every change is written to a tamper-evident audit log.",
      },
      {
        q: "How does the fuel audit work?",
        a: "Every fill-up is cross-checked against the odometer and the vehicle's tank size. The system flags ghost fills, abnormal consumption, impossible efficiency and non-advancing odometers — with the receipt photo on file.",
      },
    ],
  },
  {
    group: "Billing & plans",
    items: [
      {
        q: "What does it cost?",
        a: "Trial is free for 14 days (2 vehicles, 3 seats). Starter is ₱1,500/month (5 vehicles, 8 seats), Pro is ₱3,500/month (20 vehicles, 25 seats), and Enterprise is custom. See the Pricing page for the full comparison.",
      },
      {
        q: "What counts as a seat?",
        a: "Every person who signs in — front office, drivers, supervisors, admins. Vehicles are counted separately, so adding a car never consumes a user slot.",
      },
      {
        q: "What happens if we hit our limit?",
        a: "The app tells you clearly and asks your operator to raise the cap. Nothing is blocked silently and no data is ever deleted.",
      },
      {
        q: "Can we change plans or cancel?",
        a: "Upgrades apply immediately; downgrades take effect at renewal. Your data remains exportable — it's your data.",
      },
    ],
  },
  {
    group: "Privacy & security",
    items: [
      {
        q: "Can another company see our bookings?",
        a: "No — and not just in the interface. Every record is isolated at the database level with row-level security, verified by independent penetration testing. A direct API request from another company's admin returns nothing.",
      },
      {
        q: "Are drivers tracked all day?",
        a: "No. Location is recorded only while a mission is actively running, from the driver's own device, to log the route. Outside missions, no tracking.",
      },
      {
        q: "Is there an audit trail?",
        a: "Yes — every sensitive change (roles, limits, odometer baselines, member changes) is logged with who, when, and old → new values, and the log itself cannot be edited through the app.",
      },
      {
        q: "Where is our data stored?",
        a: "On managed PostgreSQL infrastructure (Supabase) with encrypted connections. Read the full Privacy Policy for the complete picture.",
      },
    ],
  },
];

export default function Faqs() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sand/60 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-heading text-lg font-bold text-cocoa">FleetFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/pricing" className="px-3 text-xs font-bold uppercase tracking-wide text-cocoa hover:text-brand">
              Pricing
            </Link>
            <Link to="/register" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12">
        <section className="text-center">
          <p className="mb-3 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
            Help center
          </p>
          <h1 className="font-heading text-4xl font-extrabold text-cocoa">
            Frequently asked questions
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-mocha">
            Straight answers about daily use, billing, and how your data is protected.
          </p>
        </section>

        <div className="mt-10 space-y-10">
          {GROUPS.map((g) => (
            <section key={g.group}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-taupe">
                {g.group}
              </h2>
              <div className="space-y-2.5">
                {g.items.map((f) => (
                  <details key={f.q} className="group rounded-2xl border border-sand/60 bg-white p-5 shadow-card">
                    <summary className="cursor-pointer list-none font-semibold text-cocoa">
                      <span className="mr-2 inline-block text-brand transition-transform group-open:rotate-90">▸</span>
                      {f.q}
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-mocha">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-14 rounded-3xl border border-brand/30 bg-mint/30 p-8 text-center">
          <h2 className="font-heading text-xl font-bold text-cocoa">Still have questions?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-mocha">
            Ask us directly — support@flowworkssystems.com — and you'll hear back within one business day.
          </p>
          <Link
            to="/register"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-6 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark"
          >
            Create an account
          </Link>
        </section>

        <footer className="mt-12 border-t border-sand/70 pt-6 text-center text-xs text-taupe">
          <Link to="/privacy" className="mr-4 hover:text-brand">Privacy</Link>
          <Link to="/pricing" className="mr-4 hover:text-brand">Pricing</Link>
          <Link to="/" className="hover:text-brand">Home</Link>
        </footer>
      </main>
    </div>
  );
}
