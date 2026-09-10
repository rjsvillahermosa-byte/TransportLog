import { useState } from "react";
import { Copy, Check, CalendarPlus, LayoutDashboard } from "lucide-react";
import { Button } from "../components/ui";
import { useToast } from "../components/Layout";

function QrCard({ icon: Icon, title, sub, url }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;

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
      <p className="text-xs text-taupe mb-4">{sub}</p>
      <div className="inline-block border border-sand/70 p-2 bg-white rounded-lg">
        <img src={img} alt={`${title} QR Code`} className="w-52 h-52 mx-auto" />
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
  return (
    <div>
      <h1 className="text-2xl font-heading font-bold text-cocoa">QR Codes</h1>
      <p className="text-sm text-taupe mt-1 mb-6">Print and place these for quick access</p>
      <div className="grid gap-6 md:grid-cols-2">
        <QrCard
          icon={CalendarPlus}
          title="Book a Reservation"
          sub="Place at the Front Office desk"
          url={`${origin}/new-booking`}
        />
        <QrCard
          icon={LayoutDashboard}
          title="Driver Dashboard"
          sub="Place in vehicle or dispatch board"
          url={`${origin}/`}
        />
      </div>
    </div>
  );
}
