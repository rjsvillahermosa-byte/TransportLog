import { Link } from "react-router-dom";

// Public Privacy Policy — aligned with the Philippines' Data Privacy Act
// (RA 10173). Written to match what the system ACTUALLY does: org-scoped
// RLS isolation, audit logs, odometer photos, guest names on bookings.

const SECTIONS = [
  {
    title: "1. Who we are",
    body: [
      "FleetFlow (\"we\", \"the Platform\") is a Fleet & Transport Management System operated from the Philippines. For the purposes of the Data Privacy Act of 2012 (RA 10173), we act as a personal information processor on behalf of our client organizations, and as a personal information controller for the account data of client team members.",
      "Your client organization (the company whose staff booked the transport) is the controller of the transport records it creates. Inquiries about records held by your employer or hotel should go to their data protection officer; inquiries about the Platform itself may be sent to our contact below.",
    ],
  },
  {
    title: "2. What data we process",
    body: [
      "Account data — name, email, role, and employment organization for every team member registered under a client code.",
      "Transport records — booking details (guest name, party size, pickup and destination, schedule), driver assignments, vehicle assignments, and mission status.",
      "Mileage and vehicle data — odometer photos and readings, pre-mission checklist results, GPS traces during active missions (drivers, with device permissions), vehicle registration and insurance details.",
      "Fuel data — fill-up records with receipt photos, amounts, and computed consumption, used for integrity auditing.",
      "Security data — audit logs of sensitive changes (who changed what, when, old and new values), and authentication events.",
    ],
  },
  {
    title: "3. Why we process it",
    body: [
      "To operate the transport service your organization enrolled in: dispatching missions, verifying mileage, auditing fuel expenses, and keeping vehicles roadworthy.",
      "To keep each client organization's records isolated and secure: access is enforced at the database level so that staff of one client cannot read another client's records.",
      "To comply with our client organization's instructions and with applicable law, including obligations to preserve accurate transport and fuel records.",
    ],
  },
  {
    title: "4. Photos and location",
    body: [
      "Odometer photos are taken by drivers to verify vehicle usage. They capture the vehicle's instrument panel; drivers should avoid framing people in the photo.",
      "Location data is collected only while a mission is actively running, only from the driver's device, and only to record the route of the mission. It is not used to track employees outside working missions.",
    ],
  },
  {
    title: "5. Who can see what",
    body: [
      "Your organization's team members see records belonging to their organization, according to their role (staff, driver, supervisor, admin).",
      "Platform operators may access client data only to operate and support the service, for troubleshooting you request, or as required by law — and every sensitive change is written to a tamper-evident audit log.",
      "We do not sell personal data. We do not use client transport records to advertise to anyone.",
    ],
  },
  {
    title: "6. Storage, retention and security",
    body: [
      "Data is stored on Supabase infrastructure (PostgreSQL with row-level security) with encrypted connections in transit.",
      "We keep transport, mileage and audit records for as long as your organization's account is active. When an organization is deleted, its records are deleted; audit logs may be retained in aggregate form for security compliance.",
      "Passwords are stored only as modern hashes. Sessions are encrypted at rest on devices.",
    ],
  },
  {
    title: "7. Your rights (RA 10173)",
    body: [
      "You have the right to be informed, to access your data, to correct inaccuracies, to have data erased or blocked where lawful, to object to processing, to data portability, and to damages, and to file a complaint with the National Privacy Commission.",
      "Team members: request access or correction through your organization's admin or our contact below. We respond within 30 days.",
    ],
  },
  {
    title: "8. Contact",
    body: [
      "Privacy questions and requests: support@flowworkssystems.com",
      "National Privacy Commission: privacy.gov.ph",
    ],
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sand/60 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-heading text-lg font-bold text-cocoa">FleetFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="px-3 text-xs font-bold uppercase tracking-wide text-cocoa hover:text-brand">
              Sign in
            </Link>
            <Link to="/register" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-brand-dark">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12">
        <p className="mb-3 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
          Data Privacy
        </p>
        <h1 className="font-heading text-4xl font-extrabold text-cocoa">Privacy Policy</h1>
        <p className="mt-3 text-sm text-taupe">
          Plain-language summary of what FleetFlow collects, why, and the guarantees
          your data enjoys. Effective date: October 2026 · Compliant with RA 10173.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="font-heading text-lg font-bold text-cocoa">{s.title}</h2>
              <div className="mt-2 space-y-2.5">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-mocha">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-3xl border border-brand/30 bg-mint/30 p-6 text-sm text-mocha">
          <b className="text-cocoa">The one-paragraph version:</b> your organization's
          transport records belong to your organization — isolated at the database
          level, readable only by your team and the platform staff who operate the
          service, with every sensitive change audit-logged. We don't sell data, and
          drivers are only located during active missions.
        </div>

        <footer className="mt-12 border-t border-sand/70 pt-6 text-center text-xs text-taupe">
          <Link to="/pricing" className="mr-4 hover:text-brand">Pricing</Link>
          <Link to="/" className="hover:text-brand">Home</Link>
        </footer>
      </main>
    </div>
  );
}
