import { useEffect, useState } from "react";
import { supabaseActive, getSupabaseClient, getSupabaseConfig } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Mock Base44 backend — mirrors the live app's SDK surface
// ($t.entities.*, $t.auth.*, $t.integrations.Core.*) backed by localStorage,
// including the same offline action-queue design
// (create_mileage_log / update_request + pendingUploads) used by the original.
// ---------------------------------------------------------------------------

const PREFIX = "fleetflow";
const SEQ_KEY = "fleetflow:missionseq";

// Sequential mission numbers for real operations: 000001, 000002, …
// The counter survives page reloads and only resets via Danger Zone.
function nextMissionId() {
  const n = (parseInt(localStorage.getItem(SEQ_KEY) || "0", 10) || 0) + 1;
  localStorage.setItem(SEQ_KEY, String(n));
  return String(n).padStart(6, "0");
}
export { nextMissionId };

// ---------------------------------------------------------------------------
// Supabase adapters — same surface as the local entity/auth implementations.
// Enabled when the Super Admin connects a project (Settings → Database).
// ---------------------------------------------------------------------------
const SB_TABLES = {
  TransportRequest: "transport_requests",
  MileageLog: "mileage_logs",
  Vehicle: "vehicles",
  Driver: "drivers",
  ServiceLog: "service_logs",
  FuelLog: "fuel_logs",
  IncidentLog: "incidents",
  User: "profiles",
};

function sbEntity(entityName) {
  const table = SB_TABLES[entityName];
  const sb = getSupabaseClient();
  const order = (q, sort) => {
    if (!sort) return q;
    const desc = sort.startsWith("-");
    return q.order(sort.slice(1), { ascending: !desc });
  };
  const limit = (q, n) => (n ? q.limit(n) : q);
  return {
    async list(sort, n = 200) {
      const { data, error } = await limit(order(sb.from(table).select("*"), sort), n);
      if (error) throw new Error(error.message);
      return data;
    },
    async filter(query = {}, sort, n = 200) {
      let q = sb.from(table).select("*");
      for (const [k, v] of Object.entries(query)) if (v != null) q = q.eq(k, v);
      const { data, error } = await limit(order(q, sort), n);
      if (error) throw new Error(error.message);
      return data;
    },
    async get(id) {
      const { data, error } = await sb.from(table).select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      return data;
    },
    async create(data) {
      // stamp the creator so demo accounts can be wiped cleanly later
      if (!data.created_by) {
        const { data: sess } = await sb.auth.getSession();
        if (sess?.session?.user) data.created_by = sess.session.user.id;
      }
      let attempt = await sb.from(table).insert(data).select().single();
      // self-healing: older projects may not have the created_by column yet
      if (attempt.error && /created_by/i.test(attempt.error?.message || "")) {
        delete data.created_by;
        attempt = await sb.from(table).insert(data).select().single();
      }
      if (attempt.error) throw new Error(attempt.error.message);
      return attempt.data;
    },
    async update(id, data) {
      const { data: row, error } = await sb.from(table).update(data).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return row;
    },
    async delete(id) {
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async deleteMany() {
      const { error } = await sb.from(table).delete().not("id", "is", null);
      if (error) throw new Error(error.message);
    },
  };
}

function supabaseEntities() {
  const out = {};
  for (const name of Object.keys(SB_TABLES)) out[name] = sbEntity(name);
  return out;
}

const supabaseAuth = {
  async currentUser() {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    const session = data?.session;
    if (!session) return null;
    const { data: prof } = await sb
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (prof && prof.status === "Disabled") {
      await sb.auth.signOut();
      return null;
    }
    return (
      prof ?? {
        id: session.user.id,
        email: session.user.email,
        full_name: session.user.email?.split("@")[0] || "User",
        role: "Staff",
        status: "Active",
      }
    );
  },
  async loginViaEmailPassword(email, password) {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return true;
  },
  async loginWithProvider() {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signInWithOAuth({ provider: "google" });
    if (error) throw new Error(error.message);
    return true; // OAuth redirects — session lands after the round-trip
  },
  async register({ full_name, email, password }) {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error) throw new Error(error.message);
    // profile auto-created by the on_auth_user_created trigger (Staff)
    // No session yet means email confirmation is required before login will work.
    return { needsEmailConfirmation: !data.session };
  },
  async resetPasswordRequest(email) {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  },
  async resetPassword({ new_password }) {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.updateUser({ password: new_password });
    if (error) throw new Error(error.message);
  },
  logout() {
    getSupabaseClient()?.auth.signOut();
  },
};

const supabaseUserAdmin = {
  list() {
    // async-compatible caller uses .map sync — return rows; Settings refreshes
    // after every mutation, and this path is only hit in Supabase mode where
    // loadUsers awaits. (Made async below via userAdmin proxy wrapper.)
    return read("users");
  },
};

// Creates a user via the admin-create-user Edge Function, which uses the
// service-role Admin API (auth.admin.createUser with email_confirm: true).
// This never sends a confirmation email, so it can't be blocked by Supabase's
// shared email rate limit the way the public signUp() path can — that limit
// is what was breaking demo-account creation.
async function callEdgeFunction(name, body) {
  const sb = getSupabaseClient();
  const { data: sessData } = await sb.auth.getSession();
  const token = sessData?.session?.access_token;
  if (!token) throw new Error("You must be signed in to do this.");
  const { url } = getSupabaseConfig();
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

const callAdminCreateUser = (body) => callEdgeFunction("admin-create-user", body);

const supabaseUserAdminAsync = {
  async addDemoUser() {
    const result = await callAdminCreateUser({ mode: "demo" });
    return { id: result.id, email: result.email, password: result.password, name: result.full_name };
  },
  async list() {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from("profiles").select("*").order("created_date");
    if (error) throw new Error(error.message);
    return data.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      status: p.status,
      created_date: p.created_date,
    }));
  },
  async create(form, actorRole = "Staff") {
    const result = await callAdminCreateUser({
      mode: "user",
      full_name: form.full_name,
      email: form.email,
      password: form.password || undefined,
    });
    if (form.role && form.role !== "Staff") {
      await this.update(result.id, { role: form.role, status: form.status }, actorRole);
    }
    return result;
  },
  async update(id, patch, actorRole = "Staff") {
    const sb = getSupabaseClient();
    const allowed = {};
    if (patch.full_name != null) allowed.full_name = patch.full_name;
    if (patch.role != null) allowed.role = patch.role;
    if (patch.status != null) allowed.status = patch.status;
    if (allowed.role === "Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can grant Admin access.");
    if (allowed.role === "Super Admin")
      throw new Error("There can only be one Super Admin.");
    const { data: prof } = await sb.from("profiles").select("role").eq("id", id).single();
    if (prof?.role === "Super Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can edit this account.");
    const { data, error } = await sb.from("profiles").update(allowed).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async remove(id, currentEmail, actorRole = "Staff", wipeData = false) {
    // Auth users can't be deleted with the anon key — disable instead.
    const sb = getSupabaseClient();
    if (wipeData) await wipeCreatedDataSb(id);
    const { data: prof } = await sb.from("profiles").select("role, email").eq("id", id).single();
    if (prof?.role === "Super Admin") throw new Error("The Super Admin account cannot be deleted.");
    if (prof?.role === "Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can remove an Admin account.");
    if (prof?.email === currentEmail)
      throw new Error("You can't delete the account you're signed in with.");
    const { error } = await sb.from("profiles").update({ status: "Disabled" }).eq("id", id);
    if (error) throw new Error(error.message);
    return "disabled";
  },
};

const K = (name) => `${PREFIX}:${name}`;

const read = (col, fallback = []) => {
  try {
    const raw = localStorage.getItem(K(col));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (col, rows) => localStorage.setItem(K(col), JSON.stringify(rows));
export const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function sortBy(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    if (av === bv) return 0;
    const r = av > bv ? 1 : -1;
    return desc ? -r : r;
  });
}

function makeEntity(name) {
  const col = `entity:${name}`;
  return {
    async list(sort, limit = 200) {
      await delay();
      let rows = sortBy(read(col), sort);
      if (limit) rows = rows.slice(0, limit);
      return rows;
    },
    async filter(query = {}, sort, limit = 200) {
      await delay();
      let rows = read(col).filter((r) =>
        Object.entries(query).every(
          ([k, v]) => r[k] === v || (v == null && r[k] == null)
        )
      );
      rows = sortBy(rows, sort);
      if (limit) rows = rows.slice(0, limit);
      return rows;
    },
    async get(id) {
      await delay();
      const row = read(col).find((r) => r.id === id);
      if (!row) throw new Error(`${name} ${id} not found`);
      return row;
    },
    async create(data) {
      await delay();
      // stamp the creator (local mode: the signed-in user's id)
      if (!data.created_by) {
        const email = localStorage.getItem(K("session"));
        const u = read("users").find((x) => x.email === email);
        if (u) data.created_by = u.id;
      }
      const rows = read(col);
      const row = {
        id: uid(),
        created_date: nowIso(),
        ...data,
      };
      rows.push(row);
      write(col, rows);
      emitChange();
      return row;
    },
    async update(id, data) {
      await delay();
      const rows = read(col);
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) throw new Error(`${name} ${id} not found`);
      rows[i] = { ...rows[i], ...data };
      write(col, rows);
      emitChange();
      return rows[i];
    },
    async delete(id) {
      await delay();
      write(
        col,
        read(col).filter((r) => r.id !== id)
      );
      emitChange();
    },
    async deleteMany() {
      await delay();
      write(col, []);
      emitChange();
    },
  };
}

// --- change notifications (stand-in for Base44 realtime) -------------------
const listeners = new Set();
export function onDataChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emitChange() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

// --- offline action queue (same action shapes as the original app) --------
// type: "create_mileage_log" | "update_request", id_ref, data, pendingUploads
const QUEUE_COL = "sync:queue";
export const getQueue = () => read(QUEUE_COL);
export function enqueueAction(action) {
  const q = getQueue();
  q.push({ timestamp: nowIso(), ...action });
  write(QUEUE_COL, q);
  emitChange();
}
export async function drainQueue() {
  const q = getQueue();
  let synced = 0;
  for (const item of q) {
    try {
      if (item.type === "create_mileage_log") {
        await api.entities.MileageLog.create(item.data);
      } else if (item.type === "update_request") {
        await api.entities.TransportRequest.update(item.id_ref, item.data);
      }
      synced++;
    } catch (e) {
      console.error("Sync item failed:", e);
      break;
    }
  }
  if (synced > 0) {
    write(
      QUEUE_COL,
      getQueue().slice(synced)
    );
    emitChange();
    window.dispatchEvent(new CustomEvent("app:synced"));
  }
  return synced;
}
export const isOnline = () => navigator.onLine;

// --- integrations (stubs of Core.UploadFile / SendEmail / InvokeLLM) ------
async function fileToDownscaledDataUrl(file, maxSize = 640) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return dataUrl;
  }
}

export const integrations = {
  Core: {
    // Original uploads to Base44 media; here we keep a downscaled data URL.
    async UploadFile({ file }) {
      if (supabaseActive()) {
        const sb = getSupabaseClient();
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `uploads/${uid()}.${ext}`;
        const { error } = await sb.storage.from("fleetflow-media").upload(path, file);
        if (error) throw new Error(error.message);
        const { data } = sb.storage.from("fleetflow-media").getPublicUrl(path);
        return { file_url: data.publicUrl };
      }
      await delay(400);
      const file_url = await fileToDownscaledDataUrl(file);
      return { file_url };
    },
    // Original emails every app User with an "[FO]" subject prefix.
    async SendEmail({ to, subject, body }) {
      await delay(200);
      console.info("[SendEmail simulated]", { to, subject, body });
      return { ok: true };
    },
    // Document/odometer OCR. `kind` is one of license | registration |
    // insurance | casa | odometer. With Supabase active this calls the
    // ocr-extract Edge Function (real vision model) and throws on failure —
    // it must never fall back to invented data, or a fake license would be
    // saved as if it were read. Without Supabase (offline demo mode) we
    // simulate plausible extractions below.
    async InvokeLLM({ prompt, kind, image_urls }) {
      if (supabaseActive()) {
        if (!kind) throw new Error("InvokeLLM requires a document kind.");
        return callEdgeFunction("ocr-extract", { kind, image_urls });
      }
      console.info("[InvokeLLM simulated]", prompt.slice(0, 120));
      await delay(1800);
      const isoInDays = (n) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      if (/casa report/i.test(prompt)) {
        return {
          service_date: isoInDays(-1),
          odometer_at_service: 52380 + Math.floor(Math.random() * 120),
          service_type: "Preventive Maintenance (PMS)",
          casa: "Toyota Casa — Pasig",
          cost: 3500 + Math.floor(Math.random() * 14) * 100,
          next_service_km: 10000,
          next_service_date: isoInDays(182),
          parts: ["Engine oil 5W-30 (8L)", "Oil filter", "Drain washer"],
          recommendations: [
            "Brake pads at 60% — monitor next visit",
            "Front wiper blades due for replacement",
          ],
          confidence: 0.93,
        };
      }
      if (/driver'?s? license/i.test(prompt)) {
        return {
          full_name: "JUAN DELA CRUZ",
          license_number: "G11-10-012345",
          license_expiry: isoInDays(330 + Math.floor(Math.random() * 300)),
          license_code: "Professional — Restriction 1,2",
          confidence: 0.91,
        };
      }
      if (/certificate of registration|or\/?cr|official receipt/i.test(prompt)) {
        return {
          plate_number: "NAC 1234",
          cr_number: "0123456789",
          registration_expiry: isoInDays(200 + Math.floor(Math.random() * 200)),
          confidence: 0.9,
        };
      }
      if (/insurance/i.test(prompt)) {
        return {
          provider: "Philippine Charter (PGAI)",
          policy_number: `PIC-2026-${100000 + Math.floor(Math.random() * 899999)}`,
          insurance_expiry: isoInDays(150 + Math.floor(Math.random() * 200)),
          confidence: 0.9,
        };
      }
      const reading = 38000 + Math.floor(Math.random() * 52000);
      return { odo_reading: reading };
    },
  },
};

// --- auth ------------------------------------------------------------------
const USERS_COL = "users";
const SESSION_KEY = K("session");

const localAuth = {
  __local: true,
  async currentUser() {
    const email = localStorage.getItem(SESSION_KEY);
    if (!email) return null;
    const u = read(USERS_COL).find((x) => x.email === email);
    if (u && u.status === "Disabled") {
      // deactivated while logged in — end the session
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return u ?? { email, full_name: email.split("@")[0], role: "Staff", status: "Active" };
  },
  async loginViaEmailPassword(email, password) {
    await delay(300);
    const users = read(USERS_COL);
    const u = users.find((x) => x.email === email);
    if (!u || (u.password && u.password !== password))
      throw new Error("Invalid email or password");
    if (u.status === "Disabled")
      throw new Error("This account has been disabled. Contact your administrator.");
    localStorage.setItem(SESSION_KEY, email);
    return u;
  },
  async loginWithProvider() {
    await delay(500);
    const demo = read(USERS_COL)[0];
    localStorage.setItem(SESSION_KEY, demo.email);
    return demo;
  },
  async register({ full_name, email, password }) {
    await delay(300);
    const users = read(USERS_COL);
    if (users.some((x) => x.email === email))
      throw new Error("An account with this email already exists");
    // Self-service signups are always Staff — only an admin can promote.
    const u = {
      id: uid(),
      full_name,
      email,
      password,
      role: "Staff",
      status: "Active",
      created_date: nowIso(),
    };
    users.push(u);
    write(USERS_COL, users);
    localStorage.setItem(SESSION_KEY, email);
    return u;
  },
  async resetPasswordRequest(email) {
    await delay(300);
    console.info("[Reset link simulated]", email);
  },
  async resetPassword({ reset_token, new_password }) {
    await delay(300);
    if (!reset_token) throw new Error("Invalid reset token");
    console.info("[Password reset simulated]");
  },
  logout() {
    localStorage.removeItem(SESSION_KEY);
  },
};

// auth: local implementation when offline, Supabase Auth when connected.
export const auth = new Proxy(
  {},
  { get: (_, p) => (supabaseActive() ? supabaseAuth : localAuth)[p] }
);

// --- admin user management (same easy flow as vehicle registration) --------
const PROTECTED_ROLES = ["Admin", "Super Admin"];

// wipe every record a user created (demo-account cleanup)
async function wipeCreatedDataLocal(userId) {
  for (const k of ["entity:TransportRequest", "entity:MileageLog", "entity:FuelLog", "entity:IncidentLog", "entity:ServiceLog"]) {
    write(k, read(k).filter((r) => r.created_by !== userId));
  }
}
async function wipeCreatedDataSb(userId) {
  const sb = getSupabaseClient();
  for (const t of ["transport_requests", "mileage_logs", "fuel_logs", "incidents", "service_logs"]) {
    const { error } = await sb.from(t).delete().eq("created_by", userId);
    if (error) throw new Error(error.message);
  }
}

const localUserAdmin = {
  list() {
    return read(USERS_COL);
  },
  create({ full_name, email, password, role = "Staff", status = "Active" }, actorRole = "Staff") {
    if (role === "Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can grant Admin access.");
    if (role === "Super Admin")
      throw new Error("There can only be one Super Admin.");
    const users = read(USERS_COL);
    if (users.some((x) => x.email === email))
      throw new Error("An account with this email already exists");
    const u = {
      id: uid(),
      full_name,
      email,
      password: password || Math.random().toString(36).slice(2, 10), // seamless: no password? generate one
      role,
      status,
      created_date: nowIso(),
    };
    users.push(u);
    write(USERS_COL, users);
    return u;
  },
  update(id, patch, actorRole = "Staff") {
    const users = read(USERS_COL);
    const i = users.findIndex((x) => x.id === id);
    if (i === -1) throw new Error("User not found");
    const u = users[i];
    if (u.role === "Super Admin") {
      if (patch.role && patch.role !== "Super Admin")
        throw new Error("The Super Admin role is fixed — there can only be one.");
      if (actorRole !== "Super Admin")
        throw new Error("Only the Super Admin can edit this account.");
    }
    if (patch.role === "Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can grant Admin access.");
    if (patch.role === "Super Admin")
      throw new Error("There can only be one Super Admin.");
    users[i] = { ...u, ...patch };
    // never strand the fleet without an admin
    const admins = users.filter(
      (x) => PROTECTED_ROLES.includes(x.role) && x.status === "Active"
    );
    if (PROTECTED_ROLES.includes(u.role) && u.status === "Active" && admins.length === 0)
      throw new Error("Can't remove the last active admin account.");
    write(USERS_COL, users);
    return users[i];
  },
  remove(id, currentEmail, actorRole = "Staff", wipeData = false) {
    const users = read(USERS_COL);
    const u = users.find((x) => x.id === id);
    if (!u) return;
    if (u.email === currentEmail)
      throw new Error("You can't delete the account you're signed in with.");
    if (u.role === "Super Admin")
      throw new Error("The Super Admin account cannot be deleted.");
    if (u.role === "Admin" && actorRole !== "Super Admin")
      throw new Error("Only the Super Admin can remove an Admin account.");
    const admins = users.filter(
      (x) => PROTECTED_ROLES.includes(x.role) && x.status === "Active" && x.id !== id
    );
    if (PROTECTED_ROLES.includes(u.role) && u.status === "Active" && admins.length === 0)
      throw new Error("Can't delete the last active admin account.");
    if (wipeData) wipeCreatedDataLocal(id);
    write(
      USERS_COL,
      users.filter((x) => x.id !== id)
    );
  },

  // one-click demo account for testing (local mode)
  addDemoUser(actorRole = "Staff") {
    const users = read(USERS_COL);
    const n = users.filter((x) => x.is_demo).length + 1;
    const password = "demo" + Math.random().toString(36).slice(2, 8);
    const u = {
      id: uid(),
      full_name: "Demo User " + n,
      email: "demo." + Math.random().toString(36).slice(2, 6) + "@fleetflow.test",
      password,
      role: "Staff",
      status: "Active",
      is_demo: true,
      created_date: nowIso(),
    };
    users.push(u);
    write(USERS_COL, users);
    return { id: u.id, email: u.email, password };
  },
};

// --- seed demo data --------------------------------------------------------
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoDaysAgo(n, h, m) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function seedIfNeeded() {
  // Supabase mode: schema + accounts live in the cloud — nothing to seed.
  if (supabaseActive()) return;

  // Migration: the owner account is always the Super Admin (one-way).
  const existing = read(USERS_COL);
  if (existing.length) {
    const owner = existing.find((u) => u.email === "demo@fleetflow.local");
    if (owner && owner.role !== "Super Admin") {
      owner.role = "Super Admin";
      write(USERS_COL, existing);
    }
    return;
  }

  write(USERS_COL, [
    {
      id: uid(),
      full_name: "Rhex Jun Villahermosa",
      email: "demo@fleetflow.local",
      password: "demo1234",
      role: "Super Admin",
      status: "Active",
      created_date: nowIso(),
    },
    {
      id: uid(),
      full_name: "Front Office",
      email: "fo@hotel.local",
      password: "staff1234",
      role: "Staff",
      status: "Active",
      created_date: nowIso(),
    },
    {
      id: uid(),
      full_name: "Ana Supervisor",
      email: "supervisor@hotel.local",
      password: "super1234",
      role: "Supervisor",
      status: "Active",
      created_date: nowIso(),
    },
  ]);

  write("entity:Driver", [
    {
      id: uid(),
      full_name: "Edward Sacil",
      employee_id: "MS-00005",
      contact_number: "",
      email: "",
      license_number: "G11-10-000495",
      license_expiry: "2033-06-05",
      assigned_vehicle_plate: "NAC 1234",
      status: "Active",
      notes: "",
      created_date: nowIso(),
    },
    {
      id: uid(),
      full_name: "Miguel Torres",
      employee_id: "MS-00011",
      contact_number: "+63 917 000 0011",
      email: "miguel@hotel.local",
      license_number: "G11-08-221104",
      license_expiry: daysAgo(-38),
      assigned_vehicle_plate: "NAC 5678",
      status: "Active",
      notes: "Airport specialist",
      created_date: nowIso(),
    },
    {
      id: uid(),
      full_name: "Ana Dela Cruz",
      employee_id: "MS-00018",
      contact_number: "+63 917 000 0018",
      email: "ana@hotel.local",
      license_number: "G11-05-337891",
      license_expiry: "2028-11-30",
      assigned_vehicle_plate: "",
      status: "Active",
      notes: "",
      created_date: nowIso(),
    },
  ]);

  write("entity:Vehicle", [
    {
      id: uid(),
      plate_number: "NAC 1234",
      unit_name: "Van 01",
      model: "Toyota Hiace Grandia",
      status: "available",
      image_url: "",
      fuel_type: "diesel",
      tank_liters: 60,
      rated_km_per_liter: 9,
      pms_interval_km: 10000,
      pms_interval_months: 6,
      registration_expiry: daysAgo(25),
      insurance_expiry: daysAgo(-190),
      registration_photo: "",
      insurance_photo: "",
      tire_life_km: 40000,
      tire_changed_odometer: 34500,
      created_date: nowIso(),
    },
    {
      id: uid(),
      plate_number: "NAC 5678",
      unit_name: "Sedan 02",
      model: "Toyota Vios 1.5 G",
      status: "available",
      image_url: "",
      fuel_type: "gasoline",
      tank_liters: 45,
      rated_km_per_liter: 11,
      pms_interval_km: 10000,
      pms_interval_months: 6,
      registration_expiry: daysAgo(-42),
      insurance_expiry: daysAgo(11),
      registration_photo: "",
      insurance_photo: "",
      tire_life_km: 40000,
      tire_changed_odometer: 20000,
      created_date: nowIso(),
    },
    {
      id: uid(),
      plate_number: "NAC 9012",
      unit_name: "Van 03",
      model: "Hyundai H-100",
      status: "maintenance",
      image_url: "",
      fuel_type: "diesel",
      tank_liters: 60,
      rated_km_per_liter: 9,
      pms_interval_km: 10000,
      pms_interval_months: 6,
      registration_expiry: daysAgo(-280),
      insurance_expiry: daysAgo(-150),
      registration_photo: "",
      insurance_photo: "",
      tire_life_km: 4500, // recapped tires, urban duty — short life
      tire_changed_odometer: 47500,
      created_date: nowIso(),
    },
  ]);

  write("entity:ServiceLog", [
    {
      id: uid(),
      vehicle_plate: "NAC 1234",
      service_type: "Preventive Maintenance",
      service_date: daysAgo(60),
      odometer_at_service: 37950,
      next_service_km: 10000,
      next_service_date: daysAgo(-120),
      service_provider: "AutoCare Center",
      cost: 4500,
      notes: "Oil change, brake check",
      source: "manual",
      created_date: nowIso(),
    },
    {
      id: uid(),
      vehicle_plate: "NAC 5678",
      service_type: "General Inspection",
      service_date: daysAgo(9),
      odometer_at_service: 38000,
      next_service_km: 10000,
      next_service_date: daysAgo(-170),
      service_provider: "Hotel Motorpool",
      cost: 1200,
      notes: "",
      source: "manual",
      created_date: nowIso(),
    },
    {
      id: uid(),
      vehicle_plate: "NAC 9012",
      service_type: "Preventive Maintenance (PMS)",
      service_date: daysAgo(210),
      odometer_at_service: 51700,
      next_service_km: 10000,
      next_service_date: daysAgo(-30),
      service_provider: "Hyundai Casa — Pasig",
      cost: 4800,
      notes: "PMS 10k km package",
      source: "ocr",
      created_date: nowIso(),
    },
  ]);

  // Fuel logs — full-to-full segments with deliberate fraud cases:
  //  • NAC 1234 last fill = inflated liters (20.9 km/L → impossible)
  //  • NAC 9012 = siphon pattern (4.1 km/L) + off-market price + unaccounted km
  const fuelRows = [
    ["NAC 1234", 10, 38200, 46.2, 4241, "Petron NLEX"],
    ["NAC 1234", 7, 38410, 23.4, 2160, "Shell Tabang"],
    ["NAC 1234", 4, 38544, 15.0, 1385, "Caltex Macapagal"],
    ["NAC 1234", 1, 38680, 6.5, 605, "Petron Buendia"],
    ["NAC 5678", 9, 38260, 30.0, 2460, "Shell EDSA"],
    ["NAC 5678", 5, 38360, 9.1, 752, "Petron Roxas"],
    ["NAC 5678", 2, 38452, 8.6, 698, "Seaox Libertad"],
    ["NAC 9012", 8, 52110, 55.0, 5005, "Flying V C5"],
    ["NAC 9012", 5, 52240, 31.8, 2928, "Shell Taguig"],
    ["NAC 9012", 1, 52395, 17.0, 1020, "Unbranded station — Pasay"],
  ].map(([plate, dAgo, odo, liters, cost, station]) => ({
    id: uid(),
    vehicle_plate: plate,
    fill_date: daysAgo(dAgo),
    odometer: odo,
    liters,
    cost,
    full_tank: true,
    station,
    receipt_photo: "",
    encoded_by: "Driver",
    created_date: isoDaysAgo(dAgo, 18, 30),
  }));
  write("entity:FuelLog", fuelRows);

  // Incident log — voice-reported events with timestamps
  write("entity:IncidentLog", [
    {
      id: uid(),
      type: "Breakdown",
      detail: "Van 03 stalled at EDSA — towed to shop",
      mission_id: "",
      vehicle_plate: "NAC 9012",
      reported_by: "Miguel Torres",
      source: "voice",
      created_date: isoDaysAgo(5, 16, 42),
    },
    {
      id: uid(),
      type: "Flat Tire",
      detail: "Rear-left tire punctured on NLEX",
      mission_id: "",
      vehicle_plate: "NAC 1234",
      reported_by: "Edward Sacil",
      source: "voice",
      created_date: isoDaysAgo(2, 9, 15),
    },
  ]);

  // Completed missions with mileage logs so History / FO Dashboard have data.
  // Odometer ranges are chosen to interleave with the fuel-fill windows below,
  // so the "unaccounted km" audit only fires where it tells the fraud story.
  const completed = [
    ["Martha Lane", 2, "Airport Pick-up", "NAIA Terminal 3", "Hotel Lobby", 1, 7, 30, 38210, 38280],
    ["Kenji Watanabe", 1, "Drop-off", "Hotel Lobby", "Makati CBD", 1, 14, 5, 38260, 38330],
    ["Priya Nair", 3, "Special Request", "Hotel Lobby", "Mall of Asia", 2, 10, 15, 38290, 38318],
    ["Diego Ramos", 1, "Drop-off", "Hotel Lobby", "NAIA Terminal 1", 3, 16, 45, 38365, 38425],
    ["Sarah Kim", 2, "Airport Pick-up", "NAIA Terminal 2", "Hotel Lobby", 4, 9, 20, 38415, 38460],
    ["Hotel Guest — Room 512", 4, "Other", "Hotel Lobby", "Bonifacio Global City", 6, 19, 0, 38430, 38452],
    ["Elaine Cruz", 1, "Drop-off", "Hotel Lobby", "Quezon City", 8, 8, 40, 38470, 38510],
    ["Tom Becker", 2, "Airport Pick-up", "Hotel Lobby", "NAIA Terminal 3", 10, 5, 55, 38480, 38520],
  ];
  const requests = [];
  const logs = [];
  completed.forEach(
    ([guest, pax, type, pickup, dest, dAgo, hh, mm, odoStart, odoEnd], i) => {
      const reqId = uid() + i;
      const mid = (100000 + Math.floor(Math.random() * 899999)).toString();
      requests.push({
        id: reqId,
        mission_id: mid,
        guest_name: guest,
        booked_by: i % 2 ? "Liza Manalo" : "Grace Uy",
        requester_type: "Guest",
        pax_count: pax,
        booking_type: type,
        pickup_location: pickup,
        destination: dest,
        schedule_date: daysAgo(dAgo),
        schedule_time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        assigned_driver_id: "",
        assigned_driver_name: i % 2 ? "Miguel Torres" : "Edward Sacil",
        vehicle_id: "",
        vehicle_plate: i % 2 ? "NAC 5678" : "NAC 1234",
        department: "Front Office",
        special_notes: "",
        status: "Completed",
        created_date: isoDaysAgo(dAgo, Math.max(0, hh - 2), mm),
      });
      logs.push({
        id: uid() + "L" + i,
        request_id: reqId,
        mission_id: mid,
        driver_id: "",
        driver_name: i % 2 ? "Miguel Torres" : "Edward Sacil",
        vehicle_plate: i % 2 ? "NAC 5678" : "NAC 1234",
        guest_name: guest,
        pax_count: pax,
        booking_type: type,
        pickup_location: pickup,
        destination: dest,
        time_out: isoDaysAgo(dAgo, hh, mm),
        time_in: isoDaysAgo(dAgo, hh + 1, mm),
        start_odometer: odoStart,
        end_odometer: odoEnd,
        odo_start_photo: "",
        odo_end_photo: "",
        distance: odoEnd - odoStart,
        remarks: "",
        status: "Completed",
        route_coordinates: "",
        created_date: isoDaysAgo(dAgo, hh, mm),
      });
    }
  );

  // Department errands — same mission workflow as guest bookings
  const errands = [
    {
      guest_name: "Liza Manalo",
      requested_by: "Liza Manalo",
      department: "Purchasing",
      requester_type: "Errand",
      booking_type: "Errand",
      pickup_location: "Hotel Lobby",
      destination: "Supplier warehouse — Pasay",
      dAgo: 3,
      time: "09:00",
      driver: "Ana Dela Cruz",
      plate: "NAC 9012",
      status: "Completed",
      odoStart: 52240,
      odoEnd: 52280,
      notes: "Collect dry goods order #4471",
    },
    {
      guest_name: "RD Santos",
      requested_by: "RD Santos",
      department: "Marketing",
      requester_type: "Errand",
      booking_type: "Errand",
      pickup_location: "Hotel Lobby",
      destination: "Print shop — Quiapo",
      dAgo: 2,
      time: "13:30",
      driver: "Miguel Torres",
      plate: "NAC 5678",
      status: "Completed",
      odoStart: 38452,
      odoEnd: 38477,
      notes: "Collect event tarpaulins",
    },
    {
      guest_name: "G. Madison",
      requested_by: "G. Madison",
      department: "Owner",
      requester_type: "Errand",
      booking_type: "Errand",
      pickup_location: "Hotel Lobby",
      destination: "Madison Residence — Forbes Park",
      dAgo: 0,
      time: "15:00",
      driver: "Edward Sacil",
      plate: "NAC 1234",
      status: "Pending",
      notes: "Airport hand-carry items",
    },
  ];
  errands.forEach((e, i) => {
    const reqId = uid() + "E" + i;
    const mid = (100000 + Math.floor(Math.random() * 899999)).toString();
    requests.push({
      id: reqId,
      mission_id: mid,
      guest_name: e.guest_name,
      requested_by: e.requested_by,
      booked_by: "Front Office",
      requester_type: e.requester_type,
      department: e.department,
      pax_count: 1,
      booking_type: e.booking_type,
      pickup_location: e.pickup_location,
      destination: e.destination,
      schedule_date: daysAgo(e.dAgo),
      schedule_time: e.time,
      assigned_driver_id: "",
      assigned_driver_name: e.driver,
      vehicle_id: "",
      vehicle_plate: e.plate,
      special_notes: e.notes,
      status: e.status,
      created_date: isoDaysAgo(e.dAgo, 8, 0),
    });
    if (e.status === "Completed") {
      logs.push({
        id: uid() + "EL" + i,
        request_id: reqId,
        mission_id: mid,
        driver_id: "",
        driver_name: e.driver,
        vehicle_plate: e.plate,
        guest_name: e.guest_name,
        pax_count: 1,
        booking_type: "Errand",
        pickup_location: e.pickup_location,
        destination: e.destination,
        time_out: isoDaysAgo(e.dAgo, Number(e.time.slice(0, 2)), Number(e.time.slice(3))),
        time_in: isoDaysAgo(e.dAgo, Number(e.time.slice(0, 2)) + 1, Number(e.time.slice(3))),
        start_odometer: e.odoStart,
        end_odometer: e.odoEnd,
        odo_start_photo: "",
        odo_end_photo: "",
        distance: e.odoEnd - e.odoStart,
        remarks: "",
        status: "Completed",
        route_coordinates: "",
        created_date: isoDaysAgo(e.dAgo, 8, 0),
      });
    }
  });

  write("entity:TransportRequest", requests);
  write("entity:MileageLog", logs);
}

export function resetTransportData() {
  if (supabaseActive()) {
    const sb = getSupabaseClient();
    Promise.all(
      ["transport_requests", "mileage_logs", "service_logs", "fuel_logs", "incidents"].map((t) =>
        sb.from(t).delete().not("id", "is", null)
      )
    )
      .then(() => emitChange())
      .catch((e) => console.error("Supabase reset failed:", e.message));
    return;
  }
  write("entity:TransportRequest", []);
  write("entity:MileageLog", []);
  write("entity:ServiceLog", []);
  write("entity:FuelLog", []);
  write("entity:IncidentLog", []);
  write("sync:queue", []);
  localStorage.removeItem("fleetflow:missionseq");
  emitChange();
}

const localApi = {
  entities: {
    TransportRequest: makeEntity("TransportRequest"),
    MileageLog: makeEntity("MileageLog"),
    Vehicle: makeEntity("Vehicle"),
    Driver: makeEntity("Driver"),
    ServiceLog: makeEntity("ServiceLog"),
    FuelLog: makeEntity("FuelLog"),
    IncidentLog: makeEntity("IncidentLog"),
    User: makeEntity("User"),
  },
  auth: localAuth,
  integrations,
};

function activeApi() {
  return supabaseActive()
    ? { entities: supabaseEntities(), auth: supabaseAuth, integrations }
    : localApi;
}

// Same surface everywhere; pages never know which backend answered.
export const api = new Proxy(
  {},
  {
    get: (_, p) => {
      if (p === "auth") return auth; // mode-routed proxy above
      return activeApi()[p];
    },
  }
);

// userAdmin: routed per mode. Supabase mode is async — Settings awaits it.
export const userAdmin = new Proxy(
  {},
  {
    get: (_, p) => {
      const target = supabaseActive() ? supabaseUserAdminAsync : localUserAdmin;
      const v = target[p];
      return typeof v === "function" ? v.bind(target) : v;
    },
  }
);

// --- hooks -----------------------------------------------------------------
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function usePendingCount() {
  const [count, setCount] = useState(getQueue().length);
  useEffect(() => {
    const update = () => setCount(getQueue().length);
    window.addEventListener("app:synced", update);
    window.addEventListener("storage", update);
    const unsub = onDataChange(update);
    return () => {
      window.removeEventListener("app:synced", update);
      window.removeEventListener("storage", update);
      unsub();
    };
  }, []);
  return count;
}
