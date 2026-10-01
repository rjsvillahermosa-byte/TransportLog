import { useEffect, useRef, useState } from "react";
import { Copy, Check, CalendarPlus, LayoutDashboard, Car, ShieldCheck } from "lucide-react";
import QRCodeStyling from "qr-code-styling";
import { Button } from "../components/ui";
import { useToast } from "../components/Layout";
import { getSupabaseClient } from "../lib/supabaseClient";
import { loadOrgPrefs } from "../lib/orgPrefs";

// QR Codes — print-and-place codes for booking and vehicle identity.
//
// CLIENT SAFETY (the critical part): the booking QR never decides which org
// receives a booking — the SIGNED-IN USER does (0005 trigger stamps the org
// of whoever submits). So a Madison employee scanning any FleetFlow booking
// QR always books into MAD-001. The QR below additionally carries ?org=
// CODE, and the booking page warns loudly if the signed-in account belongs
// to a DIFFERENT org than the QR — catching the shared-front-desk case
// (computer still logged in as another company) before a wrong booking
// happens. Vehicle QRs (/v/<token>) are per-vehicle and org-labeled.

function QrCard({ icon: Icon, title, sub, url, badge, logoUrl }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const qrContainerRef = useRef(null);
  const qrInstanceRef = useRef(null);

  // Real logo integration, not a sticker: qr-code-styling reserves the
  // logo's square footprint as part of generating the code itself (and
  // raises error correction to compensate), instead of a CSS image floated
  // on top of a QR <img> that has no idea it's being partially covered.
  useEffect(() => {
    if (!qrContainerRef.current) return;
    const options = {
      width: 208,
      height: 208,
      data: url,
      margin: 4,
      qrOptions: { errorCorrectionLevel: logoUrl ? "H" : "M" },
      dotsOptions: { type: "square", color: "#2b2420" },
      cornersSquareOptions: { type: "square", color: "#2b2420" },
      cornersDotOptions: { type: "square", color: "#2b2420" },
      backgroundOptions: { color: "#ffffff" },
      ...(logoUrl && {
        image: logoUrl,
        imageOptions: {
          crossOrigin: "anonymous",
          hideBackgroundDots: true,
          imageSize: 0.32,
          margin: 3,
        },
      }),
    };
    if (!qrInstanceRef.current) {
      qrInstanceRef.current = new QRCodeStyling(options);
      qrContainerRef.current.innerHTML = "";
      qrInstanceRef.current.append(qrContainerRef.current);
    } else {
      qrInstanceRef.current.update(options);
    }
  }, [url, logoUrl]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copied", description: url });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-3xl shadow-card p-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-mint/50 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-brand" />
      </div>
      <h3 className="text-base font-semibold text-cocoa">{title}</h3>
      <p className="text-xs text-taupe mb-1">{sub}</p>
      {badge && (
        // A block wrapper, not just inline-block on the <p> itself — without
        // it, this pill and the QR box below are both inline-block siblings
        // sharing one line box, so a short badge (e.g. "Madison Suites ·
        // MAD-001") sits beside the QR instead of stacking above it. Only
        // worked by accident when the badge text was long enough to force a
        // wrap on its own (e.g. "Books into: Madison Suites · MAD-001").
        <div className="mb-2">
          <p className="text-[11px] font-bold text-brand bg-mint/50 rounded-full px-2.5 py-0.5 inline-block">
            {badge}
          </p>
        </div>
      )}
      <div className="inline-block border border-sand/70 p-2 bg-white rounded-lg">
        <div ref={qrContainerRef} className="w-52 h-52" />
      </div>
      <p className="text-xs text-taupe break-all mt-3 mb-4">{url}</p>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        Copy Link
      </Button>
    </div>
  );
}

export default function QrCodes() {
  const origin = window.location.origin;
  const [orgLabel, setOrgLabel] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState("");

  // The booking QR is client-specific: it carries this account's org code and
  // is labeled with the org name. Where does the org come from? The signed-in
  // user's own membership (RLS-safe — you can only ever read your own).
  useEffect(() => {
    (async () => {
      try {
        const prefs = await loadOrgPrefs();
        if (prefs?.organization_id) {
          const sb = getSupabaseClient();
          const { data } = await sb
            .from("organizations")
            .select("name, client_code, logo_url")
            .eq("id", prefs.organization_id)
            .maybeSingle();
          if (data) {
            setOrgLabel(`${data.name} · ${data.client_code}`);
            setOrgCode(data.client_code);
            setOrgLogoUrl(data.logo_url || "");
          }
        }
      } catch {
        /* platform-super without org membership — generic QR is fine */
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold text-cocoa">QR Codes</h1>
      <p className="text-sm text-taupe mt-1 mb-6">Print and place these for quick access</p>
      <div className="grid gap-6 md:grid-cols-2">
        <QrCard
          icon={CalendarPlus}
          title="Book a Reservation"
          sub="Place at the Front Office desk"
          url={`${origin}/new-booking${orgCode ? `?org=${encodeURIComponent(orgCode)}` : ""}`}
          badge={orgLabel ? `Books into: ${orgLabel}` : "Books into: the signed-in account's org"}
          logoUrl={orgLogoUrl}
        />
        <QrCard
          icon={LayoutDashboard}
          title="Driver Dashboard"
          sub="Place in vehicle or dispatch board"
          url={`${origin}/`}
          badge={orgLabel}
          logoUrl={orgLogoUrl}
        />
      </div>

      <div className="mt-8 rounded-3xl border border-brand/30 bg-mint/30 p-5 max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-bold text-cocoa">
          <ShieldCheck className="h-4 w-4 text-brand" /> How org safety works
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-mocha list-disc list-inside">
          <li>
            A booking always lands in the organization of the <b>signed-in account</b> — never of the
            QR itself. Madison staff scanning any booking QR book into Madison.
          </li>
          <li>
            This QR carries this account's client code, and the booking page <b>warns if the
            signed-in account belongs to a different company</b> than the QR — catching
            shared-computer mixups before they happen.
          </li>
          <li>
            Each <b>vehicle</b> has its own QR (Fleet → vehicle → Asset Record) — drivers scan it to
            verify the physical vehicle and complete the pre-mission checklist.
          </li>
        </ul>
      </div>
    </div>
  );
}
