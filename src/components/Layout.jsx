import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Car,
  ChevronDown,
  ClipboardList,
  Printer,
  Droplets,
  LayoutDashboard,
  PlusCircle,
  History,
  QrCode,
  Settings as SettingsIcon,
  Menu,
  X,
  Cloud,
  CloudOff,
  RefreshCw,
  LogOut,
  CheckCircle2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { auth, drainQueue, useOnline, usePendingCount, onDataChange } from "../lib/db";
import { Button } from "./ui";
import VoiceAssistant from "./VoiceAssistant";
import { useBranding } from "../lib/branding";

const NAV_ITEMS = [
  { label: "Missions", path: "/", icon: ClipboardList },
  { label: "FO Dashboard", path: "/fo-dashboard", icon: LayoutDashboard },
  { label: "Fleet", path: "/fleet", icon: Car },
  { label: "Fuel", path: "/fuel", icon: Droplets },
  { label: "Reports", path: "/reports", icon: Printer },
  { label: "New Booking", path: "/new-booking", icon: PlusCircle },
  { label: "History", path: "/history", icon: History },
  { label: "QR Codes", path: "/qr-codes", icon: QrCode },
  { label: "Settings", path: "/settings", icon: SettingsIcon },
];

// --- toasts ---------------------------------------------------------------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastHost({ toasts, dismiss }) {
  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm print:hidden">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-white border border-sand rounded-xl shadow-lg p-4 flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-brand flex-none mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-cocoa">{t.title}</p>
            {t.description && (
              <p className="text-xs text-taupe mt-0.5">{t.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-taupe hover:text-mocha"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// --- sync indicator (mirrors the original header component) ---------------
function SyncIndicator() {
  const online = useOnline();
  const pending = usePendingCount();
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = onDataChange(() => force((x) => x + 1));
    return unsub;
  }, []);

  useEffect(() => {
    if (online && pending > 0 && !busy) drainQueue();
  }, [online, pending]); // eslint-disable-line

  const syncNow = async () => {
    setBusy(true);
    const n = await drainQueue();
    setBusy(false);
    return n;
  };

  if (!online)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-dark bg-accent/15 border border-accent/40 rounded-full px-2.5 py-1">
        <CloudOff className="w-3.5 h-3.5" />
        Offline{pending > 0 ? ` · ${pending} pending` : ""}
      </span>
    );
  if (pending > 0)
    return (
      <button
        onClick={syncNow}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand bg-mint/50 border border-brand/30 rounded-full px-2.5 py-1 hover:bg-mint"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", busy && "animate-spin")} />
        Sync {pending} item{pending > 1 ? "s" : ""}
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand bg-mint/60 border border-brand/30 rounded-full px-2.5 py-1">
      <Cloud className="w-3.5 h-3.5" />
      Online
    </span>
  );
}

export default function Layout({ user, children }) {
  const brand = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [fitCount, setFitCount] = useState(NAV_ITEMS.length);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const headerInnerRef = useRef(null);
  const brandRef = useRef(null);
  const rightRef = useRef(null);
  const measureRef = useRef(null);
  const moreWrapRef = useRef(null);
  const isSuper = user?.role === "Super Admin";
  const isAdmin = isSuper || user?.role === "Admin";
  const canReports = isAdmin || user?.role === "Supervisor";
  const navItems = NAV_ITEMS.filter((i) =>
    i.path === "/settings" ? isAdmin : i.path === "/reports" ? canReports : true
  );

  const toast = useCallback((t) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismiss = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const logout = async () => {
    await auth.logout();
    window.location.href = "/login";
  };

  // --- auto-fit: measure how many nav buttons fit; the rest fold into "More".
  // Re-runs on resize, branding changes (name/logo/font/size) and role changes,
  // so the menu always looks composed no matter who signs in.
  useEffect(() => {
    const compute = () => {
      const inner = headerInnerRef.current;
      const measure = measureRef.current;
      if (!inner || !measure) return;
      const total = inner.clientWidth;
      const brandW = brandRef.current?.offsetWidth || 0;
      const rightW = rightRef.current?.offsetWidth || 0;
      let avail = total - brandW - rightW - 36; // justify-between slack
      const widths = navItems.map((item) => {
        const el = measure.querySelector(`[data-navkey="${item.path}"]`);
        return el ? el.offsetWidth + 2 : 0; // + gap
      });
      const moreW = 92;
      let acc = 0;
      let count = 0;
      for (let i = 0; i < navItems.length; i++) {
        const remaining = navItems.length - (i + 1);
        const reserve = remaining > 0 ? moreW : 0;
        if (acc + widths[i] + reserve <= avail) {
          acc += widths[i];
          count = i + 1;
        } else break;
      }
      setFitCount(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (headerInnerRef.current) ro.observe(headerInnerRef.current);
    window.addEventListener("resize", compute);
    const t = setTimeout(compute, 400); // after webfonts settle
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
      clearTimeout(t);
    };
  }, [navItems, brand]); // eslint-disable-line

  // close the More dropdown on any navigation
  useEffect(() => setMoreOpen(false), [location.pathname]);

  const visibleNav = navItems.slice(0, fitCount);
  const overflowNav = navItems.slice(fitCount);

  return (
    <ToastCtx.Provider value={toast}>
      <div className="min-h-screen">
        {/* safe-area padding keeps the header below the phone status bar */}
        {/* guaranteed clearance below the phone status bar, even when the
            device reports no safe-area inset */}
        <header
          className="bg-cream/85 backdrop-blur border-b border-sand sticky top-0 z-50 print:hidden pt-[max(1.75rem,env(safe-area-inset-top))]"
        >
          <div ref={headerInnerRef} className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
            {/* hidden measuring strip — zero-footprint wrapper so it never
                expands the page on mobile (the pinch-zoom bug) */}
            <div className="w-0 h-0 overflow-hidden" aria-hidden="true">
              <div
                ref={measureRef}
                className="flex gap-0.5 opacity-0 pointer-events-none"
              >
                {navItems.map((item) => (
                  <span
                    key={item.path}
                    data-navkey={item.path}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg h-8 px-3 text-xs font-bold uppercase tracking-wide"
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div ref={brandRef} className="flex items-center gap-2.5 min-w-0 flex-none">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt="Logo"
                  style={{ width: brand.logoSize || 36, height: brand.logoSize || 36 }}
                  className="rounded-2xl object-cover border border-sand bg-white flex-none"
                />
              ) : (
                <div className="w-9 h-9 rounded-2xl bg-mint flex items-center justify-center flex-none">
                  <Car className="w-5 h-5 text-brand" />
                </div>
              )}
              <span className="font-heading font-extrabold text-base sm:text-lg tracking-wider uppercase text-cocoa truncate max-w-[170px] xl:max-w-[240px]">
                {!brand.logo && brand.name === "TransportLog" ? (
                  <>
                    Transport<span className="text-brand">Log</span>
                  </>
                ) : (
                  brand.name
                )}
              </span>
            </div>

            <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 justify-end">
              {/* overflow must stay visible — the More dropdown renders here */}
              {visibleNav.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link to={item.path} key={item.path}>
                    <Button
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      className="gap-1"
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
              {overflowNav.length > 0 && (
                <div className="relative" ref={moreWrapRef}>
                  <Button
                    variant={overflowNav.some((i) => i.path === location.pathname) ? "default" : "ghost"}
                    size="sm"
                    className="gap-1"
                    onClick={() => setMoreOpen((v) => !v)}
                  >
                    More
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  {moreOpen &&
                    createPortal(
                      <>
                        {/* full-screen click-away shield, above everything */}
                        <div
                          className="fixed inset-0 z-[190]"
                          onClick={() => setMoreOpen(false)}
                        />
                        <div
                          className="fixed z-[200] w-52 bg-white rounded-2xl shadow-lift border border-sand/70 p-1.5"
                          style={{
                            top: (moreWrapRef.current?.getBoundingClientRect().bottom ?? 48) + 6,
                            right: Math.max(8, window.innerWidth - (moreWrapRef.current?.getBoundingClientRect().right ?? 16)),
                          }}
                        >
                          {overflowNav.map((item) => {
                            const active = location.pathname === item.path;
                            return (
                              <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
                                  active ? "bg-brand text-white" : "text-mocha hover:bg-mint/60"
                                )}
                              >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                              </Link>
                            );
                          })}
                        </div>
                      </>,
                      document.body
                    )}
                </div>
              )}
            </nav>

            <div ref={rightRef} className="flex items-center gap-2 sm:gap-3 flex-none">
              <SyncIndicator />
              <div className="hidden sm:block text-right leading-tight">
                <p className="text-xs font-semibold text-cocoa truncate max-w-[140px]">
                  {user?.full_name}
                </p>
                <button
                  onClick={logout}
                  className="text-[11px] text-taupe hover:text-red-600 inline-flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" /> Sign out
                </button>
              </div>
              <button
                className="lg:hidden text-mocha p-1"
                onClick={() => setMenuOpen((v) => !v)}
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <nav className="lg:hidden border-t border-sand/70 bg-white px-3 py-2 space-y-1">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium",
                      active ? "bg-brand text-white" : "text-mocha hover:bg-mint/60"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
        <ToastHost toasts={toasts} dismiss={dismiss} />
        <VoiceAssistant user={user} />
      </div>
    </ToastCtx.Provider>
  );
}
