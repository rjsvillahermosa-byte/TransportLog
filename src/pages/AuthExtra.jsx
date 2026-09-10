import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, KeyRound, ShieldQuestion } from "lucide-react";
import { Button, Input, Label } from "../components/ui";
import { auth } from "../lib/db";
import { AuthLayout } from "./Auth";

export function RegisterPage() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await auth.register(form);
      window.location.href = "/";
    } catch (p) {
      setError(p.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create an account"
      subtitle="Fill in your details to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-brand font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Full name</Label>
          <Input required value={form.full_name} onChange={set("full_name")} placeholder="John Smith" />
        </div>
        <div className="space-y-2">
          <Label>Email address</Label>
          <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@hotel.com" />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" required value={form.password} onChange={set("password")} placeholder="••••••••" />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
        )}
        <Button variant="primary" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create Account"}
        </Button>
        <p className="text-xs text-taupe text-center">
          New accounts start as Staff — an admin can promote you from Settings.
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    await auth.resetPasswordRequest(email);
    setSent(true);
  };

  return (
    <AuthLayout
      icon={ShieldQuestion}
      title="Forgot password"
      subtitle="We'll email you a reset link"
      footer={
        <Link to="/login" className="text-brand font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-mocha bg-mint/60 border border-mintdark rounded-md px-3 py-3">
          If an account exists for {email}, a reset link has been sent. Check your inbox.
        </p>
      ) : (
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
          <Button variant="primary" className="w-full">
            Send Reset Link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [form, setForm] = useState({ reset_token: "", new_password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await auth.resetPassword(form);
      setDone(true);
    } catch (p) {
      setError(p.message || "Reset failed");
    }
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Reset password"
      subtitle="Enter your reset token and new password"
      footer={
        <Link to="/login" className="text-brand font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <p className="text-sm text-mocha bg-mint/60 border border-mintdark rounded-md px-3 py-3">
          Password updated. You can now sign in with your new password.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Reset token</Label>
            <Input required value={form.reset_token} onChange={set("reset_token")} placeholder="Paste token from email" />
          </div>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" required value={form.new_password} onChange={set("new_password")} placeholder="••••••••" />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>
          )}
          <Button variant="primary" className="w-full">
            Reset Password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
