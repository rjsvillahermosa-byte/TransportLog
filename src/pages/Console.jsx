import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Building2,
  Car,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  LifeBuoy,
  Palette,
  Printer,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useBranding } from "../lib/branding";
import { PlatformTeamCard, ApiKeysCard } from "./PlatformAccessCard";

// Super Admin Console — the grouped platform map. Sections mirror the nav
// groups; cards cover everything that exists today plus clearly-marked
// roadmap items so the console doubles as the platform's public roadmap.
const SECTIONS = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/fo-dashboard", icon: Gauge, desc: "Missions, mileage and fleet at a glance" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Missions", path: "/", icon: ClipboardList, desc: "All bookings from pending to completed" },
      { label: "New Booking", path: "/new-booking", icon: FileText, desc: "Guest transfers & department errands" },
      { label: "History", path: "/history", icon: FileText, desc: "Completed mission archive" },
      { label: "QR Codes", path: "/qr-codes", icon: KeyRound, desc: "Front-desk & in-vehicle booking links" },
    ],
  },
  {
    label: "Fleet & Fuel",
    items: [
      { label: "Fleet", path: "/fleet", icon: Car, desc: "Vehicles, drivers, service & renewals" },
      { label: "Fuel", path: "/fuel", icon: Printer, desc: "Fill-ups, consumption audit & fraud flags" },
      { label: "Reports", path: "/reports", icon: BarChart3, desc: "Print-ready builder for finance & supervisors" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Clients", path: "/organizations", icon: Building2, desc: "Client codes, plans, members & status" },
      { label: "Onboarding", path: "/onboarding", icon: Users, desc: "Guided tenant creation with welcome kits" },
      { label: "Subscriptions", path: "/subscriptions", icon: CreditCard, desc: "Plan billing, invoices & upgrade flow per client" },
      { label: "Master Permissions", path: "/permissions", icon: UserCog, desc: "Role matrix editor beyond the fixed roles" },
      { label: "R&D Lab", path: "/lab", icon: FlaskConical, desc: "Feature flags & experimental rollouts" },
      { label: "Audit Logs", path: "/audit-logs", icon: ScrollText, desc: "Who changed what, across every tenant" },
      { label: "System Usage", path: "/system-usage", icon: Activity, desc: "Seats, vehicles & activity per organization" },
      { label: "Settings", path: "/settings", icon: Palette, desc: "Branding, fuel bands, users & data tools" },
    ],
  },
];

export default function Console({ user }) {
  const brand = useBranding();
  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-brand" />
        <p className="text-[11px] font-medium text-brand uppercase tracking-wide">
          Super Admin — {user?.email}
        </p>
      </div>
      <h1 className="text-2xl font-heading font-bold text-cocoa">Console</h1>
      <p className="text-sm text-taupe mt-1 mb-6">
        The full platform map for {brand.name}. Every section of the product, grouped the way it's operated.
      </p>

      {/* Platform team roles + API integration (0014) */}
      <PlatformTeamCard />
      <ApiKeysCard />

      {SECTIONS.map((section) => (
        <div key={section.label} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-taupe">{section.label}</h2>
            {section.soon && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-accent-dark bg-accent/20 border border-accent/50 rounded-full px-2 py-0.5">
                Coming soon
              </span>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {section.items.map((item) => {
              const Card = item.path ? Link : "div";
              const cardProps = item.path ? { to: item.path } : {};
              return (
                <Card
                  key={item.label}
                  {...cardProps}
                  className={
                    "bg-white rounded-2xl shadow-card border border-sand/60 p-4 flex items-start gap-3 group " +
                    (item.path ? "hover:border-brand/50 hover:shadow-lift transition-all" : "opacity-70")
                  }
                >
                  <div className="w-9 h-9 rounded-xl bg-mint/50 border border-brand/20 flex items-center justify-center flex-none group-hover:bg-mint transition-colors">
                    <item.icon className="w-5 h-5 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-cocoa flex items-center gap-2">
                      {item.label}
                      {!item.path && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-taupe bg-sand/70 rounded px-1.5 py-0.5">
                          Soon
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-taupe mt-0.5">{item.desc}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
