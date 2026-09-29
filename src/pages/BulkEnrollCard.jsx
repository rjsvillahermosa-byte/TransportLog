import { useState } from "react";
import { Download, FileUp, Loader2, UserPlus } from "lucide-react";
import { Button } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";

// Bulk enrollment — download a CSV template, fill in your team, import.
// Real accounts are created (they can sign in immediately; no email wait).
// Passwords left blank are generated and shown ONCE in the results table.

const TEMPLATE_CSV = [
  "full_name,email,role,password (optional)",
  "Juan Dela Cruz,juan.delacruz@example.com,Driver,",
  "Maria Santos,maria.santos@example.com,Staff,Str0ngPass!",
  "",
].join("\n");

const VALID_ROLES = ["Driver", "Staff", "Supervisor"];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k) => header.findIndex((h) => h.startsWith(k));
  const iName = idx("full_name") >= 0 ? idx("full_name") : 0;
  const iEmail = idx("email") >= 0 ? idx("email") : 1;
  const iRole = idx("role") >= 0 ? idx("role") : 2;
  const iPass = idx("password") >= 0 ? idx("password") : 3;
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return {
      full_name: cells[iName] || "",
      email: cells[iEmail] || "",
      role: cells[iRole] || "Staff",
      password: (cells[iPass] || "").replace(/^"+|"+$/g, ""),
    };
  });
}

function genPassword() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Aa1-${hex}`;
}

async function enrollViaRpc(rows) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.rpc("enroll_users", { p_rows: rows });
  if (error) throw error;
  return data.map((r) => ({
    email: r.enrolled_email,
    ok: r.ok,
    message: r.message,
  }));
}

// Fallback for projects that haven't run 0009 yet: the deployed
// admin-create-user edge function creates accounts one at a time; we then
// set the membership role through organization_members (0007 syncs it up).
// (db.js's callEdgeFunction isn't exported, so this does its own fetch.)
async function enrollViaEdgeFunction(rows) {
  const sb = getSupabaseClient();
  const { getSupabaseConfig } = await import("../lib/supabaseClient");
  const { data: sessData } = await sb.auth.getSession();
  const token = sessData?.session?.access_token;
  if (!token) throw new Error("You must be signed in to do this.");
  const { url } = getSupabaseConfig();
  const out = [];
  for (const row of rows) {
    try {
      const res = await fetch(`${url}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          mode: "user",
          full_name: row.full_name,
          email: row.email,
          password: row.password || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (row.role && row.role !== "Staff" && json.id) {
        await sb.from("organization_members").update({ role: row.role }).eq("user_id", json.id);
      }
      out.push({
        email: row.email,
        ok: true,
        message: `enrolled — password: ${json.password || row.password}`,
      });
    } catch (e) {
      out.push({ email: row.email, ok: false, message: e.message || "failed" });
    }
  }
  return out;
}

export default function BulkEnrollCard({ onEnrolled }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // [{email, ok, message}]
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fleetflow-enrollment-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result)).filter(
        (r) => r.email && r.full_name
      );
      const fixed = parsed.map((r) => ({
        ...r,
        role: VALID_ROLES.includes(r.role) ? r.role : "Staff",
        password: r.password || genPassword(),
      }));
      setRows(fixed);
      setResults(null);
      if (!fixed.length) toast({ title: "No usable rows", description: "Check the template's name/email columns." });
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-picking the same file
  };

  const enroll = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      let out;
      try {
        out = await enrollViaRpc(rows);
      } catch (rpcError) {
        // function not installed yet (0009 not run) → fall back
        out = await enrollViaEdgeFunction(rows);
      }
      setResults(out);
      const okCount = out.filter((r) => r.ok).length;
      toast({
        title: `Enrolled ${okCount} of ${out.length}`,
        description: okCount < out.length ? "Review the failed rows below." : undefined,
      });
      setRows([]);
      setFileName("");
      onEnrolled?.();
    } catch (e) {
      toast({ title: "Enrollment failed", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <h3 className="text-sm font-semibold text-cocoa mb-1">Bulk Enroll Drivers &amp; Staff</h3>
      <p className="text-xs text-taupe mb-4">
        Download the template, list your team, then import — real accounts, ready to sign in.
        Passwords you leave blank are generated and shown once after import.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={downloadTemplate}>
          <Download className="w-4 h-4" /> Download template
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          <span className="inline-flex items-center gap-2 rounded-lg border border-sand bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-cocoa hover:bg-mint/40 cursor-pointer">
            <FileUp className="w-4 h-4" /> Import CSV
          </span>
        </label>
        {rows.length > 0 && (
          <Button size="sm" variant="primary" onClick={enroll} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Enroll {rows.length} account{rows.length > 1 ? "s" : ""}
          </Button>
        )}
      </div>
      {fileName && rows.length > 0 && (
        <p className="text-xs text-taupe mt-2">
          {fileName}: {rows.length} row{rows.length > 1 ? "s" : ""} ready
          {" · roles: "}{[...new Set(rows.map((r) => r.role))].join(", ")}
        </p>
      )}
      {results && (
        <div className="mt-4 border border-sand/70 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-mint/40 text-brand">
              <tr>
                <th className="text-left px-3 py-2 font-bold uppercase tracking-wide">Email</th>
                <th className="text-left px-3 py-2 font-bold uppercase tracking-wide">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.email} className="border-t border-sand/60">
                  <td className="px-3 py-2 text-cocoa">{r.email}</td>
                  <td className={"px-3 py-2 " + (r.ok ? "text-mocha" : "text-red-600")}>
                    {r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-taupe bg-cream">
            Passwords (in the Result column) are shown only this once — copy them now.
          </p>
        </div>
      )}
    </div>
  );
}
