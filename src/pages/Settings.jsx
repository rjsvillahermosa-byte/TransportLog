import { useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  Crown,
  Droplets,
  ImagePlus,
  Loader2,
  Lock,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { auth, drainQueue, integrations, resetTransportData, useOnline, usePendingCount, userAdmin } from "../lib/db";
import { getFuelConfig, saveFuelConfig } from "../lib/fuel";
import { applyTheme, DEFAULT_THEME, getTheme, resetTheme, saveTheme, THEME_PRESETS } from "../lib/theme";
import {
  applyBranding,
  BACKGROUND_PRESETS,
  DEFAULT_BRANDING,
  FONT_OPTIONS,
  getBranding,
  LOGO_RECOMMEND,
  resetBranding,
  saveBranding,
} from "../lib/branding";
import { useEffect } from "react";
import { Button, Input, Label, Modal, Select, Spinner } from "../components/ui";
import { useToast } from "../components/Layout";
import { cn } from "../lib/utils";
import {
  isVoiceEnabled as getVoiceOn,
  getPreferredVoice,
  getVoicePreference,
  listVoices,
  recognitionSupported,
  setVoiceEnabled,
  setVoicePreference,
  speak,
  HELP_TEXT,
} from "../lib/voice";

// Shown when a user reaches a restricted area directly.
export function AdminOnlyNotice({
  title = "Admin access only",
  message = "Settings is restricted to the owner's admin account. Sign in with the admin login on any device — including mobile — to manage the system.",
}) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-mint/60 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-taupe" />
      </div>
      <h1 className="text-xl font-heading font-bold text-cocoa">{title}</h1>
      <p className="text-sm text-taupe mt-2 leading-relaxed">{message}</p>
      <Button variant="outline" size="sm" className="mt-5" onClick={() => (window.location.href = "/")}>
        Back to Missions
      </Button>
    </div>
  );
}

function VoiceCard() {
  const toast = useToast();
  const [on, setOn] = useState(getVoiceOn());
  const supported = recognitionSupported();
  const [voices, setVoices] = useState(() => listVoices());
  const [voicePref, setVoicePref] = useState(getVoicePreference());

  // browsers load the voice list asynchronously — refresh when ready
  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis?.addEventListener?.("voiceschanged", refresh);
    const t = setTimeout(refresh, 800);
    return () => {
      window.speechSynthesis?.removeEventListener?.("voiceschanged", refresh);
      clearTimeout(t);
    };
  }, []);

  const pickVoice = (name) => {
    setVoicePref(name);
    const resolved = getPreferredVoice();
    speak(`Voice set to ${resolved?.name || name}. Jarvis standing by.`);
    toast({
      title: "Voice updated",
      description: `Now speaking with: ${resolved?.name || "System default"}`,
    });
  };

  const toggle = () => {
    const next = !on;
    setOn(next);
    setVoiceEnabled(next);
    toast({
      title: next ? "Voice assistant on" : "Voice assistant muted",
      description: next ? "Tap the round mic button to give commands." : "Spoken replies are off; the assistant still works by text.",
    });
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cocoa flex items-center gap-2">
            🎙 Voice Assistant
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", supported ? "bg-mint/60 text-brand border-brand/30" : "bg-accent/15 text-accent-dark border-accent/40")}>
              {supported ? "mic ready" : "text only"}
            </span>
          </h3>
          <p className="text-xs text-taupe mt-1 max-w-md">
            Hands-free fleet control for drivers: start and end missions, dictate odometer
            readings, report incidents with time stamps, and hear briefings — powered by the
            browser's built-in speech engine, no cloud needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setOn(getVoiceOn()); speak("Voice check. I am reading this correctly."); toast({ title: "Voice test spoken" }); }}>
            Test Voice
          </Button>
          <Button variant={on ? "destructive" : "primary"} size="sm" onClick={toggle}>
            {on ? "Mute" : "Enable"}
          </Button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-sand/70">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px]">
            <Label className="text-[11px] text-taupe">Assistant voice</Label>
            <Select
              value={voicePref}
              onChange={(e) => pickVoice(e.target.value)}
              className="h-9 mt-1"
            >
              <option value="auto-male">🎙 Auto — Jarvis (male, recommended)</option>
              <option value="auto-female">Auto — female assistant</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Select>
            <p className="text-[10px] text-taupe mt-1">
              Active: <span className="font-semibold text-mocha">{getPreferredVoice()?.name || "System default"}</span>
              {" · "}male voices like Microsoft David / Guy or Google UK Male give the Jarvis sound.
            </p>
          </div>
          <div>
            <Label className="text-[11px] text-taupe">Hear it</Label>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => speak("Jarvis online. All systems operational, sir.")}
            >
              🔊 Speak sample
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-sand/70">
        <p className="text-[11px] font-semibold text-taupe uppercase tracking-wide mb-1.5">Say things like</p>
        <div className="flex flex-wrap gap-1.5">
          {["Start mission", "End mission", "Odometer 38400", "Report incident flat tire", "What are my missions", "What incidents were reported", "What time is it", "Navigate to fuel", "Help"].map((c) => (
            <span key={c} className="text-[10px] font-semibold bg-mint/50 text-mocha rounded-full px-2.5 py-1">
              &ldquo;{c}&rdquo;
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrandingCard() {
  const toast = useToast();
  const [draft, setDraft] = useState(getBranding());
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const apply = (next) => {
    setDraft(next);
    applyBranding(next); // live preview across the app
  };

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      apply({ ...draft, logo: file_url });
    } catch (err) {
      console.error("Logo upload failed:", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    saveBranding(draft);
    toast({
      title: "Branding applied",
      description: "Logo, name, font and text size now show for everyone on this device.",
    });
  };

  const reset = () => {
    resetBranding();
    setDraft({ ...DEFAULT_BRANDING });
    toast({ title: "Branding reset", description: "Back to the default TransportLog look." });
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-cocoa flex items-center gap-2">
            <Crown className="w-4 h-4 text-accent-dark" /> Branding Studio
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-accent/15 text-accent-dark border-accent/40">
              Super Admin
            </span>
          </h3>
          <p className="text-xs text-taupe mt-1">
            Make the app yours — upload your hotel logo, set the app name, pick the font and text size.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Apply Branding
          </Button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickLogo} />

      <div className="flex flex-wrap items-start gap-5 mt-4">
        {/* logo box — with recommended size + display-size slider */}
        <div>
          <Label className="text-[11px] text-taupe">Logo</Label>
          <div className="flex items-start gap-4 mt-1.5 flex-wrap">
            {draft.logo ? (
              <div className="relative">
                <img
                  src={draft.logo}
                  alt="Logo"
                  style={{ width: draft.logoSize || 36, height: draft.logoSize || 36 }}
                  className="rounded-2xl object-cover border border-sand bg-white"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={() => fileRef.current?.click()} className="text-[11px] font-semibold text-brand hover:underline">
                    Replace
                  </button>
                  <span className="text-sand">·</span>
                  <button onClick={() => apply({ ...draft, logo: "" })} className="text-[11px] font-semibold text-red-500 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-sand flex flex-col items-center justify-center text-taupe hover:border-brand/50 hover:text-brand transition-colors"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              </button>
            )}
            <div>
              <Label className="text-[11px] text-taupe">
                Display size — {draft.logoSize || 36}px
              </Label>
              <input
                type="range"
                min={LOGO_RECOMMEND.displayMin}
                max={LOGO_RECOMMEND.displayMax}
                step="2"
                value={draft.logoSize || 36}
                onChange={(e) => apply({ ...draft, logoSize: Number(e.target.value) })}
                className="w-36 mt-2 accent-[rgb(var(--brand))]"
              />
              <p className="text-[10px] text-taupe mt-1 max-w-[190px]">
                <span className="font-semibold text-brand">Recommended:</span>{" "}
                {LOGO_RECOMMEND.upload} — shown crisp at {draft.logoSize || 36}px ({LOGO_RECOMMEND.min} min).
              </p>
            </div>
          </div>
        </div>

        {/* name + font + size */}
        <div className="space-y-3 min-w-[220px] flex-1">
          <div>
            <Label className="text-[11px] text-taupe">App name</Label>
            <Input
              value={draft.name}
              onChange={(e) => apply({ ...draft, name: e.target.value })}
              placeholder="TransportLog"
              className="h-9 mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-[11px] text-taupe">Font style</Label>
              <Select
                value={draft.font}
                onChange={(e) => apply({ ...draft, font: e.target.value })}
                className="h-9 mt-1"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                    {f.recommended ? " ★ recommended" : ""}
                  </option>
                ))}
              </Select>
              {(() => {
                const rec = FONT_OPTIONS.find((f) => f.value === draft.font)?.rec;
                if (rec == null || Number(draft.size) === rec) return null;
                return (
                  <button
                    onClick={() => apply({ ...draft, size: rec })}
                    className="mt-1 text-[10px] font-semibold text-brand bg-mint/60 rounded-full px-2 py-0.5 hover:bg-mint"
                  >
                    ✨ Recommended for {draft.font}: {rec}px — apply
                  </button>
                );
              })()}
            </div>
            <div>
              <Label className="text-[11px] text-taupe">Text size — {draft.size}px</Label>
              <input
                type="range"
                min="14"
                max="18"
                step="0.5"
                value={draft.size}
                onChange={(e) => apply({ ...draft, size: Number(e.target.value) })}
                className="w-40 mt-3 accent-[rgb(var(--brand))]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* whole-app background */}
      <div className="mt-4 pt-4 border-t border-sand/70">
        <Label className="text-[11px] text-taupe">Whole-app background</Label>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {BACKGROUND_PRESETS.map((p) => {
            const active = draft.background?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => apply({ ...draft, background: { id: p.id, color: p.page } })}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all",
                  active ? "border-brand bg-brand/10 text-brand shadow-sm" : "border-sand text-mocha hover:bg-mint/40"
                )}
              >
                <span
                  className="w-4 h-4 rounded-full border border-black/10"
                  style={{ background: p.page }}
                />
                {p.label}
                {p.recommended && <span className="text-[9px] text-brand">★</span>}
              </button>
            );
          })}
          <span className="flex items-center gap-1.5 rounded-full border border-sand px-2.5 py-1">
            <input
              type="color"
              value={draft.background?.color || "#FAF3E7"}
              onChange={(e) => apply({ ...draft, background: { id: "custom", color: e.target.value } })}
              className="w-4 h-4 rounded-full border-0 cursor-pointer p-0 bg-transparent"
              aria-label="Custom background color"
            />
            <span className="text-[11px] font-semibold text-mocha">Custom</span>
          </span>
        </div>
        <p className="text-[10px] text-taupe mt-1.5">
          Changes the entire app canvas — header, cards and print sheets stay readable on every preset.
        </p>
      </div>

      {/* live preview strip */}
      <div className="mt-4 pt-4 border-t border-sand/70 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold text-taupe uppercase tracking-wide">Preview:</span>
        <span className="font-heading font-extrabold tracking-wider uppercase text-cocoa">{draft.name || "Your App"}</span>
        <span className="inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Primary
        </span>
        <span className="text-xs text-taupe">Applies live — tap “Apply Branding” to keep it.</span>
      </div>
    </div>
  );
}

const emptyUser = {
  full_name: "",
  email: "",
  password: "",
  role: "Staff",
  status: "Active",
};

function UserModal({ open, onClose, initial, currentEmail, actorRole, onSaved }) {
  const [form, setForm] = useState(initial || emptyUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSuperRow = initial?.role === "Super Admin";
  const roleOptions =
    actorRole === "Super Admin" ? ["Staff", "Supervisor", "Admin"] : ["Staff", "Supervisor"];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setError("");
    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    try {
      if (initial?.id) {
        const patch = { ...form };
        if (!patch.password) delete patch.password; // blank = keep current
        userAdmin.update(initial.id, patch, actorRole);
      } else {
        userAdmin.create(form, actorRole); // blank password = auto-generated
      }
      setBusy(false);
      onSaved();
    } catch (e2) {
      setBusy(false);
      setError(e2.message || "Failed to save user.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Edit User" : "Add User"}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Full Name *</Label>
          <Input value={form.full_name} onChange={set("full_name")} placeholder="Juan Dela Cruz" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Email *</Label>
          <Input type="email" value={form.email} onChange={set("email")} placeholder="juan@hotel.com" />
        </div>
        <div className="space-y-1.5">
          <Label>{initial?.id ? "New Password" : "Password"}</Label>
          <Input
            type="text"
            value={form.password}
            onChange={set("password")}
            placeholder={initial?.id ? "Leave blank to keep" : "Leave blank to auto-generate"}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select
            value={form.role}
            onChange={set("role")}
            disabled={isSuperRow}
            className={isSuperRow ? "opacity-70" : ""}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r === "Supervisor"
                  ? "Supervisor — can build & print reports"
                  : r === "Admin"
                  ? "Admin — manages the system"
                  : r}
              </option>
            ))}
          </Select>
          {actorRole !== "Super Admin" && !isSuperRow && (
            <p className="text-[10px] text-taupe">Only the Super Admin can grant the Admin role.</p>
          )}
          {isSuperRow && (
            <p className="text-[10px] text-taupe">👑 Super Admin — there can only be one, and it's you.</p>
          )}
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onChange={set("status")}>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled — cannot sign in</option>
          </Select>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 mt-3">{error}</p>
      )}
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
          {busy && <Spinner className="w-4 h-4" />} Save User
        </Button>
      </div>
    </Modal>
  );
}

export default function Settings({ user }) {
  const online = useOnline();
  const pending = usePendingCount();
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [cfg, setCfg] = useState(getFuelConfig());
  const [theme, setTheme] = useState(getTheme());

  const pickPreset = (preset) => {
    const next = { primary: preset.primary, accent: preset.accent };
    setTheme(next);
    applyTheme(next); // live preview — buttons, nav, chips recolor instantly
  };

  const pickCustom = (key) => (e) => {
    const next = { ...theme, [key]: e.target.value };
    setTheme(next);
    applyTheme(next);
  };

  const saveBrandTheme = () => {
    saveTheme(theme);
    toast({
      title: "Brand theme applied",
      description: "The whole app now follows this palette. Charts refresh on your next visit to each page.",
    });
  };

  const resetBrandTheme = () => {
    setTheme({ ...DEFAULT_THEME });
    resetTheme();
    toast({ title: "Theme reset", description: "Back to the default deep-teal TransportLog palette." });
  };
  const [users, setUsers] = useState([]);
  const [userModal, setUserModal] = useState(null); // {initial?}

  const refreshUsers = () => {
    Promise.resolve(userAdmin.list())
      .then((rows) => setUsers([...rows]))
      .catch((e) => console.error(e));
  };
  useEffect(() => {
    refreshUsers();
  }, []);

  const removeUser = (u) => {
    const isDemo = u.is_demo || /@fleetflow\.test$/i.test(u.email || "");
    const msg = isDemo
      ? `Delete the demo account "${u.full_name}"?\n\nAll bookings, missions, fuel logs and entries created by this demo account will also be wiped from the database.`
      : `Delete the account for ${u.full_name}? They will no longer be able to sign in.`;
    if (!window.confirm(msg)) return;
    try {
      userAdmin.remove(u.id, user.email, user.role, isDemo);
      refreshUsers();
      toast({
        title: isDemo ? "Demo account deleted" : "User deleted",
        description: isDemo ? "Everything they created was wiped from the database." : "",
      });
    } catch (e2) {
      alert(e2.message);
    }
  };

  const addDemoAccount = async () => {
    try {
      const acc = await userAdmin.addDemoUser();
      refreshUsers();
      toast({
        title: "🎭 Demo account created",
        description: `Email: ${acc.email} · Password: ${acc.password}`,
      });
    } catch (e2) {
      toast({ title: "Couldn't create demo account", description: e2.message });
    }
  };

  const setBand = (fuel, key) => (e) =>
    setCfg((c) => ({ ...c, [fuel]: { ...c[fuel], [key]: Number(e.target.value) || 0 } }));

  const saveBands = () => {
    saveFuelConfig(cfg);
    toast({ title: "Fuel price bands saved", description: "New fill-ups will be audited against these bands." });
  };

  const syncNow = async () => {
    setSyncing(true);
    const n = await drainQueue();
    setSyncing(false);
    toast({
      title: n > 0 ? `Synced ${n} item${n > 1 ? "s" : ""}` : "Nothing to sync",
      description: n > 0 ? "All pending actions saved." : "You're up to date.",
    });
  };

  const reset = async () => {
    if (!window.confirm("Are you absolutely sure? All trip history will be lost.")) return;
    setResetting(true);
    try {
      resetTransportData();
      alert("All transport data has been reset.");
    } catch (v) {
      alert("Failed to reset: " + (v.message || "Unknown error"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-brand" />
        <p className="text-[11px] font-medium text-brand uppercase tracking-wide">
          Admin area — {user?.full_name}
        </p>
      </div>
      <h1 className="text-2xl font-heading font-bold text-cocoa">Settings</h1>
      <p className="text-sm text-taupe mt-1 mb-6">Brand theme, team accounts, sync status & data management</p>

      {/* Brand theme — match the hotel / company palette */}
      <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-cocoa">Brand Theme</h3>
            </div>
            <p className="text-xs text-taupe mt-1">
              Match the app to your hotel or company colors — buttons, nav, chips and charts follow.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetBrandTheme}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
            <Button variant="primary" size="sm" onClick={saveBrandTheme}>
              Apply Theme
            </Button>
          </div>
        </div>

        {/* presets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {THEME_PRESETS.map((p) => {
            const active = p.primary.toLowerCase() === theme.primary.toLowerCase();
            return (
              <button
                key={p.name}
                onClick={() => pickPreset(p)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all",
                  active ? "border-brand bg-brand/10 shadow-sm" : "border-sand hover:bg-mint/40"
                )}
              >
                <span className="flex flex-none -space-x-1.5">
                  <span
                    className="w-5 h-5 rounded-full border-2 border-white"
                    style={{ background: p.primary }}
                  />
                  <span
                    className="w-5 h-5 rounded-full border-2 border-white"
                    style={{ background: p.accent }}
                  />
                </span>
                <span className={cn("text-xs font-semibold", active ? "text-brand" : "text-mocha")}>
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* custom pickers + live preview */}
        <div className="flex flex-wrap items-end gap-5 mt-4 pt-4 border-t border-sand/70">
          <div>
            <Label className="text-xs">Primary Color</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="color"
                value={theme.primary}
                onChange={pickCustom("primary")}
                className="w-10 h-10 rounded-lg border border-sand cursor-pointer bg-white p-1"
                aria-label="Primary color"
              />
              <span className="text-xs font-mono text-taupe">{theme.primary.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Accent Color</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="color"
                value={theme.accent}
                onChange={pickCustom("accent")}
                className="w-10 h-10 rounded-lg border border-sand cursor-pointer bg-white p-1"
                aria-label="Accent color"
              />
              <span className="text-xs font-mono text-taupe">{theme.accent.toUpperCase()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="inline-flex items-center rounded-lg bg-brand px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Primary
            </span>
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[10px] font-semibold text-accent-dark">
              Pending
            </span>
            <span className="inline-flex items-center rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">
              Completed
            </span>
          </div>
        </div>
      </div>

      {user.role === "Super Admin" && <BrandingCard />}

      {/* User accounts — quick enrollment, same flow as vehicle registration */}
      <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
          <div>
            <h3 className="text-sm font-semibold text-cocoa">
              User Accounts
              {user.role === "Super Admin" && (
                <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-accent/15 text-accent-dark border-accent/40 align-middle">
                  👑 you are the Super Admin
                </span>
              )}
            </h3>
            <p className="text-xs text-taupe mt-1">
              Enroll your team in seconds — leave the password blank to auto-generate one.
              Admins see this Settings area. Supervisors get the Reports builder. Staff see neither.
            </p>
          </div>
          <div className="flex gap-2 flex-none">
            <Button
              size="sm"
              variant="outline"
              onClick={addDemoAccount}
              title="One click — creates a throwaway Staff account for testing"
            >
              🎭 Add Demo
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setUserModal({})}
              disabled
              title="In Supabase mode, invite users from the Supabase Dashboard → Authentication"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add User
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 bg-mint/40 border border-sand/70 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-cocoa truncate">
                  {u.full_name}
                  {u.email === user?.email && (
                    <span className="text-xs font-normal text-taupe"> · you</span>
                  )}
                  {u.is_demo || /@fleetflow\.test$/i.test(u.email || "") ? (
                    <span className="ml-1.5 text-[10px] font-semibold text-accent-dark">🎭 demo</span>
                  ) : null}
                </p>
                <p className="text-xs text-taupe truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-none">
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                    u.role === "Super Admin"
                      ? "bg-accent/15 text-accent-dark border-accent/40"
                      : u.role === "Admin"
                      ? "bg-orange/10 text-orange border-orange/30"
                      : "bg-mint/60 text-taupe border-sand"
                  )}
                >
                  {u.role}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                    u.status === "Active"
                      ? "bg-mint/60 text-brand border-brand/30"
                      : "bg-red-50 text-red-600 border-red-200"
                  )}
                >
                  {u.status}
                </span>
                <button
                  onClick={() => setUserModal({ initial: u })}
                  className="text-taupe hover:text-brand p-1"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {u.email !== user?.email && (
                  <button onClick={() => removeUser(u)} className="text-sand hover:text-red-500 p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {online ? (
              <Cloud className="w-5 h-5 text-brand" />
            ) : (
              <CloudOff className="w-5 h-5 text-accent-dark" />
            )}
            <div>
              <p className="text-sm font-semibold text-cocoa">
                {online ? "Online" : "Offline"}
              </p>
              <p className="text-xs text-taupe">
                {online
                  ? pending > 0
                    ? `${pending} action${pending > 1 ? "s" : ""} waiting to sync`
                    : "All data synced"
                  : `${pending} action${pending > 1 ? "s" : ""} queued — will sync when back online`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing || pending === 0}>
            {syncing ? <Spinner className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync Now
          </Button>
        </div>
      </div>

      {/* Voice assistant */}
      <VoiceCard />

      <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Droplets className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-cocoa">Fuel Price Bands (₱/L)</h3>
        </div>
        <p className="text-xs text-taupe mb-4">
          Receipt prices outside these market bands are flagged on the Fuel page. Defaults follow
          the DOE / GasWatch PH Metro Manila averages.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {(["gasoline", "diesel"]).map((fuel) => (
            <div key={fuel}>
              <Label className="text-xs capitalize">{fuel}</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input
                  type="number"
                  value={cfg[fuel].min}
                  onChange={setBand(fuel, "min")}
                  className="h-9"
                  aria-label={`${fuel} minimum`}
                />
                <span className="text-xs text-taupe">to</span>
                <Input
                  type="number"
                  value={cfg[fuel].max}
                  onChange={setBand(fuel, "max")}
                  className="h-9"
                  aria-label={`${fuel} maximum`}
                />
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={saveBands}>
          Save Bands
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h3>
        <p className="text-xs text-taupe mb-4">
          Permanently delete all transport requests, mileage logs, fuel logs, and service records.
          This will reset the app to a clean state. Driver and Vehicle records will be preserved.
        </p>
        <Button variant="destructive" onClick={reset} disabled={resetting}>
          {resetting ? <Spinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
          Reset All Transport Data
        </Button>
      </div>

      <p className="text-xs text-taupe mt-6">
        FleetFlow duplicate · demo data lives in your browser's localStorage · AI ODO extraction,
        casa-report OCR and FO emails are simulated locally · Settings is admin-only on every device
      </p>

      {userModal && (
        <UserModal
          open
          onClose={() => setUserModal(null)}
          initial={userModal.initial}
          currentEmail={user.email}
          actorRole={user.role}
          onSaved={() => {
            setUserModal(null);
            refreshUsers();
            toast({ title: userModal.initial ? "User updated" : "User enrolled", description: "They can sign in immediately." });
          }}
        />
      )}
    </div>
  );
}
