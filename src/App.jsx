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
import Settings, { AdminOnlyNotice } from "./pages/Settings";
import Reports from "./pages/Reports";
import { LoginPage } from "./pages/Auth";
import { RegisterPage, ForgotPasswordPage, ResetPasswordPage } from "./pages/AuthExtra";

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function Shell() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const location = useLocation();
  const isAuthPath = AUTH_PATHS.includes(location.pathname);

  useEffect(() => {
    seedIfNeeded();
    auth.currentUser().then((u) => {
      setUser(u);
      setBooting(false);
    });
  }, []);

  if (booting) return null;

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

  return (
    <Layout user={user}>
      {/* Role gates — login-based, so they behave the same on any device. */}
      {location.pathname === "/settings" && user.role !== "Admin" ? (
        <AdminOnlyNotice />
      ) : location.pathname === "/reports" &&
        !["Admin", "Supervisor"].includes(user.role) ? (
        <AdminOnlyNotice
          title="Supervisor access only"
          message="The report builder is limited to Supervisor and Admin accounts. Ask your administrator for access."
        />
      ) : (
        <Routes>
          <Route path="/" element={<Missions user={user} />} />
          <Route path="/mission/:id" element={<MissionDetail />} />
          <Route path="/fo-dashboard" element={<FoDashboard />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/fuel" element={<Fuel />} />
          <Route path="/new-booking" element={<NewBooking />} />
          <Route path="/history" element={<History />} />
          <Route path="/qr-codes" element={<QrCodes />} />
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
