import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BrandedQr from "../components/BrandedQr";

// Printable, laminate-ready vehicle sticker — opened in its own tab (no app
// chrome to fight with print CSS) from Fleet's Asset Record modal, which
// already has every value this needs in hand. Nothing here touches the
// database: it's a pure render of whatever was passed in the query string,
// which is why this route doesn't need to be behind auth.
//
// Physical size is set via @page below — 3.5in x 5in fits common laminated
// index-card/photo sticker stock without cropping; adjust there if your
// printer/stock differs.

export default function VehicleStickerPrint() {
  const [params] = useSearchParams();
  const [ready, setReady] = useState(false);

  const plate = params.get("plate") || "";
  const model = params.get("model") || "";
  const url = params.get("url") || "";
  const orgName = params.get("org") || "";
  const logoUrl = params.get("logo") || "";

  const vehicleLabel = model ? `${model} - ${plate}` : plate;

  useEffect(() => {
    // Give the QR canvas a beat to actually paint before the print dialog
    // captures the page — window.print() on a still-blank canvas would
    // print an empty box.
    const t = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.print();
  }, [ready]);

  return (
    <div className="min-h-screen bg-sand/40 flex items-center justify-center p-6 print:p-0 print:bg-white print:min-h-0">
      <style>{`
        @media print {
          @page { size: 3.5in 5in; margin: 0; }
          body { margin: 0; }
        }
      `}</style>
      <div className="sticker-card w-[3.5in] h-[5in] bg-white rounded-2xl shadow-card print:shadow-none print:rounded-none flex flex-col items-center justify-between p-6 border border-sand/70 print:border-0">
        <div className="flex flex-col items-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={orgName}
              className="w-14 h-14 rounded-xl object-cover border border-sand/70 mb-2"
            />
          )}
          {orgName && (
            <p className="text-sm font-heading font-bold text-cocoa text-center">{orgName}</p>
          )}
          <p className="text-[11px] uppercase tracking-wide text-taupe mt-1">Vehicle Identity</p>
        </div>

        <div className="border-2 border-sand rounded-xl p-3 bg-white">
          <BrandedQr url={url} logoUrl={logoUrl} size={176} />
        </div>

        <div className="flex flex-col items-center text-center">
          <p className="text-lg font-heading font-bold text-cocoa">{vehicleLabel}</p>
          <p className="text-[11px] text-taupe mt-2 max-w-[2.8in]">
            Scan to verify this vehicle and complete the pre-mission checklist
            before departure.
          </p>
        </div>
      </div>

      {/* Only visible on screen — never in the printed output. Lets the
          admin re-trigger the print dialog if they dismissed it, without
          closing the tab and regenerating the link from Fleet again. */}
      <button
        onClick={() => window.print()}
        className="print:hidden fixed bottom-6 right-6 bg-brand text-white text-sm font-medium rounded-full px-4 py-2 shadow-card"
      >
        Print again
      </button>
    </div>
  );
}
