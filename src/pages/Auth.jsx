import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Car, Mail } from "lucide-react";
import { Button, Input, Label } from "../components/ui";
import { auth } from "../lib/db";
import { useBranding } from "../lib/branding";
import LiveBackground from "../components/LiveBackground";

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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <LiveBackground />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          {brand.logo ? (
            <img src={brand.logo} alt="Logo" className="w-14 h-14 rounded-3xl object-cover border border-sand mb-3 shadow-card" />
          ) : (
            <div className="w-14 h-14 rounded-3xl bg-mint flex items-center justify-center mb-3 shadow-card">
              <Icon className="w-7 h-7 text-brand" />
            </div>
          )}
          <h1 className="text-2xl font-heading font-bold text-cocoa">{title}</h1>
          <p className="text-sm text-taupe mt-1">{subtitle}</p>
        </div>
        <div className="bg-white rounded-3xl border border-sand/70 p-6 shadow-card">{children}</div>
        {footer && <div className="text-center text-sm text-taupe mt-4">{footer}</div>}
        <p className="text-center text-xs text-taupe mt-6">
          {brand.name} — intelligent hotel transport management
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
      window.location.href = "/";
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
