import { useEffect, useState } from "react";
import { RefreshCw, Save, Globe } from "lucide-react";
import { Button, Input, Label, Textarea } from "../components/ui";
import { useToast } from "../components/Layout";
import {
  LANDING_DEFAULTS,
  PRICING_DEFAULTS,
  FEATURE_DEFAULTS,
  loadSiteContent,
  saveSiteContent,
} from "../lib/siteContent";

// Site Editor — Special Access (platform owner only). Every copy block on
// the public landing + pricing pages is editable here and saved to
// site_content (0031). Changes go live on the public pages immediately
// (they read the saved doc at render).

const LANDING_FIELDS = [
  ["badge", "Hero badge", "The small pill above the headline"],
  ["hero_title", "Hero headline", "The big statement"],
  ["hero_body", "Hero paragraph", "Under the headline"],
  ["hero_cta_primary", "Hero button 1", ""],
  ["hero_cta_secondary", "Hero button 2", ""],
  ["hero_points", "Hero checkmarks", "Separate items with |"],
  ["features_title", "Features section title", ""],
  ["features_body", "Features section intro", ""],
  ["how_title", "How-it-works title", ""],
  ["how_steps", "How-it-works steps", "One per line: Title~Description"],
  ["fraud_title", "Fuel integrity title", ""],
  ["fraud_body", "Fuel integrity intro", ""],
  ["roles_title", "Roles section title", ""],
  ["roles_body", "Roles section intro", ""],
  ["final_title", "Bottom CTA title", ""],
  ["final_body", "Bottom CTA text", ""],
  ["footer_tagline", "Footer tagline", "After the FleetFlow name"],
];

const PRICING_FIELDS = [
  ["pricing_badge", "Pricing badge", ""],
  ["pricing_title", "Pricing headline", ""],
  ["pricing_body", "Pricing intro", ""],
  ["pricing_footer", "Pricing footer line", ""],
];

function Field({ label, hint, value, onChange, multiline }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint && <p className="text-[11px] text-taupe">{hint}</p>}
      {multiline ? (
        <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

export default function SiteEditor() {
  const toast = useToast();
  const [tab, setTab] = useState("landing");
  const [doc, setDoc] = useState({ ...LANDING_DEFAULTS, ...PRICING_DEFAULTS });
  const [features, setFeatures] = useState(FEATURE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const [landing, pricing] = await Promise.all([
        loadSiteContent("landing"),
        loadSiteContent("pricing"),
      ]);
      setDoc((d) => ({ ...d, ...landing, ...pricing }));
      if (Array.isArray(landing?.features) && landing.features.length === 6) {
        setFeatures(landing.features);
      }
      setLoading(false);
    })();
  }, []);

  const set = (k) => (v) => { setDoc((d) => ({ ...d, [k]: v })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await saveSiteContent("landing", { ...doc, features });
      const { features: _f, ...pricingOnly } = doc;
      await saveSiteContent("pricing", pricingOnly);
      setDirty(false);
      toast({ title: "Published", description: "The public pages now show your copy." });
    } catch (e) {
      toast({ title: "Save failed", description: e.message || "Run migration 0031 first." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-taupe">Loading site content…</p>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cocoa">Site Editor</h1>
          <p className="text-sm text-taupe">
            Every word on the public landing &amp; pricing pages — yours to change, no code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("/", "_blank")}>
            <Globe className="h-4 w-4" /> View site
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || !dirty}>
            <Save className="h-4 w-4" /> {saving ? "Publishing…" : dirty ? "Publish changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {["landing", "pricing"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              tab === t ? "bg-brand text-white" : "bg-white text-taupe border border-sand hover:text-brand"
            }`}
          >
            {t === "landing" ? "Landing page" : "Pricing page"}
          </button>
        ))}
      </div>

      <div className="rounded-3xl bg-white shadow-card border border-sand/60 p-6 space-y-4">
        {tab === "landing" ? (
          <>
            {LANDING_FIELDS.map(([k, label, hint]) => (
              <Field
                key={k}
                label={label}
                hint={hint}
                value={doc[k] ?? ""}
                onChange={set(k)}
                multiline={k.includes("body") || k.includes("steps")}
              />
            ))}
            <div className="border-t border-sand/70 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-taupe mb-3">Feature cards (6)</p>
              <div className="space-y-4">
                {features.map((f, i) => (
                  <div key={i} className="rounded-2xl border border-sand/60 p-4 space-y-2.5">
                    <Field
                      label={`Card ${i + 1} title`}
                      value={f.title}
                      onChange={(v) => {
                        setFeatures((arr) => arr.map((x, j) => (j === i ? { ...x, title: v } : x)));
                        setDirty(true);
                      }}
                    />
                    <Field
                      label={`Card ${i + 1} text`}
                      value={f.body}
                      onChange={(v) => {
                        setFeatures((arr) => arr.map((x, j) => (j === i ? { ...x, body: v } : x)));
                        setDirty(true);
                      }}
                      multiline
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          PRICING_FIELDS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint} value={doc[k] ?? ""} onChange={set(k)} multiline={k === "pricing_body"} />
          ))
        )}
      </div>
      <p className="text-xs text-taupe mt-3">
        Publishing saves to the database (site_content). Plan prices live on the Pricing page code and
        Subscriptions — ask me to sync them anytime.
      </p>
    </div>
  );
}
