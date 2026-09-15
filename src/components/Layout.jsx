import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Car,
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
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm print:hidden">
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
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const isAdmin = user?.role === "Admin";
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

  const logout = () => {
    auth.logout();
    window.location.href = "/login";
  };

  return (
    <ToastCtx.Provider value={toast}>
      <div className="min-h-screen">
        <header className="bg-cream/85 backdrop-blur border-b border-sand sticky top-0 z-50 print:hidden">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-mint flex items-center justify-center">
                <Car className="w-5 h-5 text-brand" />
              </div>
              <span className="font-heading font-extrabold text-lg tracking-wider uppercase text-cocoa">
                Transport<span className="text-brand">Log</span>
              </span>
            </div>

            <nav className="hidden lg:flex items-center gap-0.5">
              {navItems.map((item) => {
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
            </nav>

            <div className="flex items-center gap-3">
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
