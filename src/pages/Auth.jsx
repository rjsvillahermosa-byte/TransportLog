import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Car, Mail } from "lucide-react";
import { Button, Input, Label } from "../components/ui";
import { auth } from "../lib/db";
import { useBranding } from "../lib/branding";
import { getSupabaseClient } from "../lib/supabaseClient";
import LiveBackground from "../components/LiveBackground";

const CLIENT_CODE_KEY = "fleetflow:clientCode";

// White-label lookup for the login/register screens: an org's own client
// code (same one used to join via Register) resolves that org's real logo +
// name from the DB — unlike the Super Admin's Branding Studio (localStorage,
// device-local, platform-wide), this is per-client and works for anyone on
// any device who knows/remembers the code. Remembered locally so a returning
// user of that org sees their branding again without retyping it.
function useClientBrand() {
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem(CLIENT_CODE_KEY) || ""; } catch { return ""; }
  });
  const [org, setOrg] = useState(null); // { client_code, name, plan_status, logo_url }
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    const trimmed = code.trim();
    if (trimmed.length < 3) {
      setOrg(null);
      return;
    }
    let alive = true;
    setLooking(true);
    const t = setTimeout(async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.rpc("lookup_client_code", { p_code: trimmed });
        const row = Array.isArray(data) ? data[0] : data;
        if (!alive) return;
        setOrg(row || null);
        if (row) {
          try { localStorage.setItem(CLIENT_CODE_KEY, trimmed); } catch {}
        }
      } catch {
        if (alive) setOrg(null);
      } finally {
        if (alive) setLooking(false);
      }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [code]);

  return { code, setCode, org, looking };
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}

export function AuthLayout({ icon: Icon = Car, title, subtitle, footer, children }) {
  const brand = useBranding();
  const { code, setCode, org, looking } = useClientBrand();
  const logoUrl = org?.logo_url || brand.logo;
  const displayName = org?.name || brand.name;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <LiveBackground />
      <div className="w-full max-w-sm">
        <div className="mb-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Company code (optional)"
            className="text-center text-xs !h-8"
          />
          {org && (
            <p className="text-center text-[11px] text-brand mt-1 font-medium">
              Signing in to {org.name}
            </p>
          )}
          {!org && !looking && code.trim().length >= 3 && (
            <p className="text-center text-[11px] text-taupe mt-1">Code not recognized</p>
          )}
        </div>
        <div className="flex flex-col items-center mb-6">
          {logoUrl ? (
            <img src={logoUrl} alt={`${displayName} logo`} className="w-14 h-14 rounded-3xl object-cover border border-sand mb-3 shadow-card" />
          ) : (
            // No custom logo uploaded — show the TransportLog Brand Kit mark
            // (navy tile / orange pin / white arc), same asset as the favicon.
            <img src="/logo.svg" alt="FleetFlow brand mark" className="w-14 h-14 rounded-3xl border border-sand mb-3 shadow-card" />
          )}
          <h1 className="text-2xl font-heading font-bold text-cocoa">{title}</h1>
          <p className="text-sm text-taupe mt-1">{subtitle}</p>
        </div>
        <div className="bg-white rounded-3xl border border-sand/70 p-6 shadow-card">{children}</div>
        {footer && <div className="text-center text-sm text-taupe mt-4">{footer}</div>}
        <p className="text-center text-xs text-taupe mt-6">
          {displayName} — intelligent fleet & transport management system
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.loginViaEmailPassword(email, password);
      // Vehicle-QR scans bounce through login with a stashed destination —
      // return the driver to their scan instead of the missions list.
      const postLogin = sessionStorage.getItem("ff:postLoginRedirect");
      sessionStorage.removeItem("ff:postLoginRedirect");
      window.location.href = postLogin || "/";
    } catch (p) {
      setError(p.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    try {
      await auth.loginWithProvider();
      // signInWithOAuth navigates the browser to Google itself — nothing to do after it resolves.
    } catch (err) {
      setError(err.message || "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-brand font-medium hover:underline">
            Register
          </Link>
        </>
      }
    >
      <Button variant="outline" className="w-full mb-6" onClick={google} disabled={loading}>
        <GoogleIcon />
        Continue with Google
      </Button>
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-sand" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-taupe">or continue with email</span>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Email address</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@hotel.com"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Password</Label>
            <Link to="/forgot-password" className="text-xs text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <Button variant="primary" className="w-full" disabled={loading}>
          <Mail className="w-4 h-4" />
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </AuthLayout>
  );
}
