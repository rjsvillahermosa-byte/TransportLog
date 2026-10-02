import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import TagView from "../components/TagView";

// Printable output of a Tag Editor layout — opened in its own tab (no app
// chrome to fight with print CSS) from TagEditor's "Print this tag" button.
// Renders with the SAME TagView component the editor's canvas preview uses,
// at true physical scale (96 CSS px/in == 1in when printed at 100%), so
// what's on screen in the editor is exactly what comes out of the printer —
// unlike the older, unrelated /print/vehicle-sticker route, which has its
// own fixed hardcoded design.
//
// The payload (layout + record + qrBaseUrl) is handed off via
// sessionStorage rather than the URL — a full layout is too large/awkward
// for a query string, and sessionStorage is shared with a same-origin tab
// opened via window.open (no noopener), so the handoff is a plain
// synchronous write-then-open with no round trip.

const SCALE = 96; // CSS px per inch — true physical size at 100% print zoom

export default function TagPrint() {
  const [params] = useSearchParams();
  // ?preview=1 renders the output without triggering the OS print dialog —
  // useful to sanity-check a layout before committing paper/laminate to it.
  const previewOnly = params.get("preview") === "1";
  const [payload, setPayload] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ff.tagPrintPayload");
      if (raw) setPayload(JSON.parse(raw));
    } catch {
      /* missing/corrupt payload — the "nothing to print" state below covers it */
    }
  }, []);

  useEffect(() => {
    if (!payload) return;
    // Give the QR a beat to paint before the print dialog captures the page.
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, [payload]);

  useEffect(() => {
    if (!ready || previewOnly) return;
    window.print();
  }, [ready, previewOnly]);

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-taupe">
        Nothing to print — open this from the Tag Editor's "Print this tag" button.
      </div>
    );
  }

  const { layout, record, qrBaseUrl } = payload;

  return (
    <div className="min-h-screen bg-sand/40 flex items-center justify-center p-6 print:p-0 print:bg-white print:min-h-0">
      <style>{`
        @media print {
          @page { size: ${layout.w}in ${layout.h}in; margin: 0; }
          body { margin: 0; }
        }
      `}</style>
      <div
        className="shadow-card print:shadow-none border border-sand/70 print:border-0"
        style={{ width: layout.w * SCALE, height: layout.h * SCALE }}
      >
        <TagView layout={layout} record={record} scale={SCALE} qrBaseUrl={qrBaseUrl} />
      </div>

      {/* Only visible on screen — never in the printed output. */}
      <button
        onClick={() => window.print()}
        className="print:hidden fixed bottom-6 right-6 bg-brand text-white text-sm font-medium rounded-full px-4 py-2 shadow-card"
      >
        {previewOnly ? "Print" : "Print again"}
      </button>
    </div>
  );
}
