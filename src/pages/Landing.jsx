import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Camera,
  Check,
  ClipboardList,
  Droplets,
  Mic,
  Palette,
  Printer,
  QrCode,
  ScanLine,
  Smartphone,
  Users,
  WifiOff,
} from "lucide-react";

const PRIMARY_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";
const SECONDARY_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-sand bg-white px-6 text-xs font-bold uppercase tracking-wide text-cocoa transition-colors hover:bg-mint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Bookings & dispatch",
    body: "Log guest transfers and department errands in seconds, assign a driver and vehicle, and follow every mission from pending to completed.",
  },
  {
    icon: Camera,
    title: "Photo-verified mileage",
    body: "Drivers snap the odometer before and after each trip. The reading is captured from the photo, so distances are on record instead of on memory.",
  },
  {
    icon: ScanLine,
    title: "License scan enrollment",
    body: "Photograph a driver's license and the name, number and expiry fill in for you — along with a profile avatar made from the same photo.",
  },
  {
    icon: CalendarClock,
    title: "Renewals & servicing",
    body: "License, registration and insurance expiries are tracked in one place, alongside service history and next-service reminders read from casa reports.",
  },
  {
    icon: Droplets,
    title: "Fuel & reports",
    body: "Log fill-ups per vehicle with a consumption audit that spots anomalies, and produce print-ready reports for supervisors and finance, or save them straight to PDF.",
  },
  {
    icon: QrCode,
    title: "QR codes & voice",
    body: "Print QR codes for a front-desk booking link and an in-vehicle driver dashboard, and let drivers log an odometer reading by voice when their hands are busy.",
  },
];

const STEPS = [
  {
    title: "Book the trip",
    body: "Front desk or staff creates a guest booking or department errand with pickup, destination and schedule.",
  },
  {
    title: "Drive and verify",
    body: "The assigned driver starts the mission with an odometer photo, and ends it with another. Mileage is calculated automatically.",
  },
  {
    title: "Review and report",
    body: "Supervisors see completed missions, mileage and fuel at a glance, and export reports when the month closes.",
  },
];

const ROLES = [
  { name: "Staff", body: "Create bookings and follow their status." },
  { name: "Driver", body: "Start and end assigned missions with odometer photos." },
  { name: "Supervisor", body: "Oversee missions, fleet and the report builder." },
  { name: "Admin", body: "Manage users, vehicles and company settings." },
  { name: "Super Admin", body: "Full control, including other admins." },
];

const ALSO = [
  { icon: WifiOff, text: "Keeps working with a weak connection" },
  { icon: Smartphone, text: "Installs on your phone like an app" },
  { icon: Palette, text: "Matches your hotel's colors and logo" },
  { icon: BellRing, text: "A renewals board that flags expiring documents" },
  { icon: Printer, text: "Print or save reports as PDF" },
  { icon: Users, text: "Role-based access for every team member" },
];

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-mint/70 blur-2xl" />
      <div className="relative rounded-3xl bg-white p-5 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-taupe">Mission 000124</p>
            <p className="font-heading text-base font-bold text-cocoa">Airport transfer</p>
          </div>
          <span className="rounded-full bg-accent/25 px-3 py-1 text-xs font-bold text-accent-dark">In progress</span>
        </div>
        <div className="space-y-2 rounded-2xl bg-cream p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-taupe">Pickup</span>
            <span className="font-medium text-cocoa">Hotel lobby</span>
          </div>
          <div className="flex justify-between">
            <span className="text-taupe">Destination</span>
            <span className="font-medium text-cocoa">Airport Terminal 3</span>
          </div>
          <div className="flex justify-between">
            <span className="text-taupe">Vehicle</span>
            <span className="font-medium text-cocoa">Van · NAC 1234</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-sand p-3">
            <p className="text-xs text-taupe">Start ODO</p>
            <p className="font-heading text-lg font-bold text-cocoa">38,412 km</p>
          </div>
          <div className="rounded-2xl border border-dashed border-brand/40 p-3">
            <p className="flex items-center gap-1 text-xs text-brand">
              <Camera className="h-3.5 w-3.5" /> End ODO
            </p>
            <p className="font-heading text-lg font-bold text-taupe">Snap photo</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  // Smooth-scroll for the in-page nav anchors, without touching the rest of the app.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";
    return () => {
      root.style.scrollBehavior = prev;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-sand/60 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-heading text-lg font-bold text-cocoa">FleetFlow</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-mocha md:flex">
            <a href="#features" className="hover:text-brand">Features</a>
            <a href="#how" className="hover:text-brand">How it works</a>
            <a href="#roles" className="hover:text-brand">Roles</a>
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

      <main id="top">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-2 md:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
              Hotel transport management
            </p>
            <h1 className="font-heading text-4xl font-extrabold leading-tight text-cocoa sm:text-5xl">
              Every trip logged. Every kilometer verified.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-mocha">
              FleetFlow keeps your hotel's drivers, vehicles and missions in one place — dispatch a trip, capture the
              odometer by photo, and know exactly where every kilometer went.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={PRIMARY_BTN}>
                Create an account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={SECONDARY_BTN}>
                Sign in
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mocha">
              {["Works on any phone", "Photo-verified mileage", "Role-based access"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-brand" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-white/60 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold text-cocoa">Everything the motor pool needs</h2>
              <p className="mt-3 text-mocha">
                Replace the paper logbook, the spreadsheet and the group chat with one system your whole team can use.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-3xl bg-white p-6 shadow-card">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-mint">
                    <Icon className="h-5 w-5 text-brand" />
                  </div>
                  <h3 className="font-heading text-lg font-bold text-cocoa">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mocha">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-cocoa">From booking to report in three steps</h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-3xl bg-white p-6 shadow-card">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-heading text-lg font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="font-heading text-lg font-bold text-cocoa">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mocha">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-20 bg-white/60 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold text-cocoa">The right access for every person</h2>
              <p className="mt-3 text-mocha">Drivers see their missions. Supervisors see the fleet. Admins run the system.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {ROLES.map((r) => (
                <div key={r.name} className="rounded-3xl bg-white p-5 shadow-card">
                  <h3 className="font-heading text-base font-bold text-brand">{r.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mocha">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Also included */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ALSO.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 rounded-2xl border border-sand bg-white/70 px-4 py-3.5">
                <Icon className="h-5 w-5 shrink-0 text-brand" />
                <span className="text-sm font-medium text-cocoa">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="rounded-[2rem] bg-brand px-6 py-14 text-center shadow-lift">
            <h2 className="font-heading text-3xl font-bold text-white">Ready to see where every trip goes?</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">
              Sign in to your account, or create one to start logging missions today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-xs font-bold uppercase tracking-wide text-brand transition-colors hover:bg-cream"
              >
                Create an account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-white/50 px-6 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-sand/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-taupe sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" />
            <span className="font-medium text-mocha">FleetFlow</span>
            <span>— intelligent hotel transport management</span>
          </div>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-brand">Sign in</Link>
            <Link to="/register" className="hover:text-brand">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
