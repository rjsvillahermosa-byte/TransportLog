import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { auth, seedIfNeeded } from "./lib/db";
import Layout from "./components/Layout";
import Missions from "./pages/Missions";
import MissionDetail from "./pages/MissionDetail";
import FoDashboard from "./pages/FoDashboard";
import Fleet from "./pages/Fleet";
import Fuel from "./pages/Fuel";
import NewBooking from "./pages/NewBooking";
import History from "./pages/History";
import QrCodes from "./pages/QrCodes";
import TagEditor from "./pages/TagEditor";
import Settings, { AdminOnlyNotice } from "./pages/Settings";
import Reports from "./pages/Reports";
import Organizations from "./pages/Organizations";
import Console from "./pages/Console";
import AuditLogs from "./pages/AuditLogs";
import Onboarding from "./pages/Onboarding";
import SystemUsage from "./pages/SystemUsage";
import Subscriptions from "./pages/Subscriptions";
import MasterPermissions from "./pages/MasterPermissions";
import RandDLab from "./pages/RandDLab";
import SiteEditor from "./pages/SiteEditor";
import ReviewApprovals from "./pages/ReviewApprovals";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Privacy from "./pages/Privacy";
import Faqs from "./pages/Faqs";
import Reviews from "./pages/Reviews";
import VehicleScan from "./pages/VehicleScan";
import VehicleStickerPrint from "./pages/VehicleStickerPrint";
import TagPrint from "./pages/TagPrint";
import { LoginPage } from "./pages/Auth";
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/AuthExtra";
import { useAccessMatrix } from "./lib/access";

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

// True when the site was installed to the home screen (PWA) and opened from there.
function isInstalledApp() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone);
}

function Shell() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const location = useLocation();
  // 0029 Master Permissions: same matrix the nav uses, so the URL-bar route
  // gates stay in lockstep with what the user can see.
  const matrix = useAccessMatrix();
  const isAuthPath = AUTH_PATHS.includes(location.pathname);
  // Public landing page for logged-out web visitors only. An installed PWA
  // goes straight to login.
  const isLanding = !user && location.pathname === "/" && !isInstalledApp();

  useEffect(() => {
    seedIfNeeded();
    auth.currentUser().then((u) => {
      setUser(u);
      setBooting(false);
    });
  }, []);

  if (booting) return null;

  if (isLanding) return <Landing />;
  // Public pricing page — visible logged-out (marketing surface) and in-app.
  if (location.pathname === "/pricing") return <Pricing />;
  if (location.pathname === "/privacy") return <Privacy />;
  if (location.pathname === "/faqs") return <Faqs />;
  if (location.pathname === "/reviews") return <Reviews />;
  // Vehicle QR landing (/v/<token>): requires login (the page redirects to
  // /login itself and returns post-login), but must be reachable BEFORE the
  // generic auth redirect so the token survives.
  if (location.pathname.startsWith("/v/")) return <VehicleScan />;
  // Printable vehicle sticker — pure render of query-string values Fleet's
  // Asset Record modal already has in hand, no DB access, so no auth gate.
  // Opened in its own tab precisely to stay outside the app's nav chrome.
  if (location.pathname === "/print/vehicle-sticker") return <VehicleStickerPrint />;
  // Tag Editor's own print output — renders the actual designed layout via
  // TagView, unlike the fixed-template route above.
  if (location.pathname === "/print/tag") return <TagPrint />;
  if (!user && !isAuthPath) return <Navigate to="/login" replace />;
  if (user && isAuthPath) return <Navigate to="/" replace />;

  if (isAuthPath)
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  // Approval gate (0032): a signed-in user whose membership is Pending sees
  // this instead of the app, until their org's admin approves them.
  if (user.membership_status === "Pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-10 text-center shadow-card">
          <img src="/logo.svg" alt="" className="mx-auto h-12 w-12 rounded-2xl" />
          <h1 className="mt-4 font-heading text-xl font-bold text-cocoa">
            Account created — awaiting approval
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-mocha">
            Your request to join your company's FleetFlow workspace is with their
            administrator. You'll have full access as soon as they approve you.
          </p>
          <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-xs text-taupe">
            Signed in as <b className="text-cocoa">{user.email}</b>
            <br />
            Wrong company, or waiting too long? Contact your fleet administrator,
            or sign out and register with your correct client code.
          </p>
          <button
            onClick={async () => {
              await auth.logout();
              window.location.href = "/login";
            }}
            className="mt-6 text-xs font-bold uppercase tracking-wide text-brand hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user}>
      {/* Role gates — login-based, so they behave the same on any device. */}
      {location.pathname === "/settings" && !matrix.manage_settings?.includes(user.role) ? (
        <AdminOnlyNotice />
      ) : location.pathname === "/reports" &&
        !matrix.view_reports?.includes(user.role) ? (
        <AdminOnlyNotice
          title="Supervisor access only"
          message="The report builder is limited to Supervisor and Admin accounts. Ask your administrator for access."
        />
      ) : location.pathname === "/organizations" ? (
        <Organizations user={user} />
      ) : location.pathname === "/console" ? (
        user.role === "Super Admin" ? (
          <Console user={user} />
        ) : (
          <AdminOnlyNotice
            title="Super Admin only"
            message="The Console maps the entire platform and is limited to Super Admin accounts."
          />
        )
      ) : location.pathname === "/site-editor" ? (
        user.role === "Super Admin" ? (
          <SiteEditor />
        ) : (
          <AdminOnlyNotice
            title="Platform owner only"
            message="The Site Editor changes the public marketing pages and is limited to the platform owner."
          />
        )
      ) : location.pathname === "/review-approvals" ? (
        user.role === "Super Admin" ? (
          <ReviewApprovals />
        ) : (
          <AdminOnlyNotice
            title="Platform team only"
            message="Review moderation is limited to the platform owner and platform admins."
          />
        )
      ) : location.pathname === "/subscriptions" || location.pathname === "/permissions" || location.pathname === "/lab" ? (
        user.role === "Super Admin" ? (
          location.pathname === "/subscriptions" ? (
            <Subscriptions />
          ) : location.pathname === "/permissions" ? (
            <MasterPermissions />
          ) : (
            <RandDLab />
          )
        ) : (
          <AdminOnlyNotice
            title="Super Admin only"
            message="This console page is limited to Super Admin accounts."
          />
        )
      ) : location.pathname === "/audit-logs" || location.pathname === "/onboarding" || location.pathname === "/system-usage" ? (
        user.role === "Super Admin" ? (
          location.pathname === "/audit-logs" ? (
            <AuditLogs />
          ) : location.pathname === "/onboarding" ? (
            <Onboarding />
          ) : (
            <SystemUsage />
          )
        ) : (
          <AdminOnlyNotice
            title="Super Admin only"
            message="This console page is limited to Super Admin accounts."
          />
        )
      ) : (
        <Routes>
          <Route path="/" element={<Missions user={user} />} />
          <Route path="/mission/:id" element={<MissionDetail />} />
          <Route path="/fo-dashboard" element={<FoDashboard />} />
          <Route path="/fleet" element={<Fleet user={user} />} />
          <Route path="/fuel" element={<Fuel />} />
          <Route path="/new-booking" element={<NewBooking user={user} />} />
          <Route path="/history" element={<History />} />
          <Route path="/qr-codes" element={<QrCodes />} />
          <Route path="/tag-editor" element={<TagEditor />} />
          <Route path="/reports" element={<Reports user={user} />} />
          <Route path="/settings" element={<Settings user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
