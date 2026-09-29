import { useEffect, useState } from "react";
import { Droplets, Loader2, RefreshCw } from "lucide-react";
import { Button, Input, Label } from "../components/ui";
import { useToast } from "../components/Layout";
import {
  DEFAULT_FUEL_CONFIG,
  loadFuelWatch,
  saveFuelBands,
  saveFuelPriceSourceUrl,
  refreshFuelPriceNow,
} from "../lib/fuel";
import { useOrgPrefs } from "../lib/orgPrefs";

// Fuel Price Watch — per-org (not platform-wide: clients aren't all in the
// Philippines, so one global price would be wrong for a Malaysia or Spain
// client). An admin points this at a page that states the current fuel
// price; a daily scheduled job and this card's "Refresh now" button both
// call the same fuel-price-watch edge function, which reads that page,
// converts the price to a band, and updates ONLY this org's currency and
// bands. A failed or low-confidence read never touches the live bands.

export default function FuelPriceWatchCard() {
  const toast = useToast();
  const prefs = useOrgPrefs();
  const [watch, setWatch] = useState({ bands: DEFAULT_FUEL_CONFIG, sourceUrl: "", region: "", lastCheckedAt: null, lastStatus: null });
  const [loaded, setLoaded] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [regionInput, setRegionInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFuelWatch(true).then((w) => {
      setWatch(w);
      setUrlInput(w.sourceUrl || "");
      setRegionInput(w.region || "");
      setLoaded(true);
    });
  }, []);

  const setBand = (fuel, key) => (e) => {
    const v = Number(e.target.value) || 0;
    setWatch((w) => ({ ...w, bands: { ...w.bands, [fuel]: { ...w.bands[fuel], [key]: v } } }));
  };

  const saveBands = async () => {
    setBusy(true);
    try {
      await saveFuelBands(watch.bands);
      toast({ title: "Fuel price bands saved", description: "New fill-ups will be audited against these bands." });
    } catch (e) {
      toast({ title: "Save failed", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = async () => {
    setBusy(true);
    try {
      const next = await saveFuelPriceSourceUrl(urlInput.trim(), regionInput.trim());
      setWatch(next);
      toast({
        title: urlInput.trim() ? "Price source saved" : "Price source cleared",
        description: urlInput.trim() ? "Click Refresh Now to read it, or wait for the daily check." : "",
      });
    } catch (e) {
      toast({ title: "Save failed", description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const result = await refreshFuelPriceNow();
      const w = await loadFuelWatch(true);
      setWatch(w);
      toast({
        title: "Price refreshed",
        description: [
          result.diesel != null ? `Diesel ${result.diesel}/L` : null,
          result.gasoline != null ? `Gasoline ${result.gasoline}/L` : null,
        ].filter(Boolean).join(" · ") || "Bands updated.",
      });
    } catch (e) {
      toast({ title: "Refresh failed", description: e.message });
    } finally {
      setRefreshing(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-3xl shadow-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Droplets className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-cocoa">
          Fuel Price Watch ({prefs.currency_code} {prefs.currency_symbol}/L)
        </h3>
      </div>
      <p className="text-xs text-taupe mb-4">
        Receipt prices outside these bands are flagged on the Fuel page. Point this at a page that
        states your local fuel price and it keeps itself current — checked automatically once a
        day, or on demand below. Per-organization: this never affects any other client.
      </p>

      <div className="mb-4">
        <Label className="mb-1.5">Price source URL</Label>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/fuel-prices"
            disabled={busy || refreshing}
          />
          <Button size="sm" variant="outline" onClick={saveUrl} disabled={busy || refreshing} className="flex-none">
            Save
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={refreshNow}
            disabled={busy || refreshing || !watch.sourceUrl}
            className="flex-none"
            title={watch.sourceUrl ? "" : "Save a source URL first"}
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh Now
          </Button>
        </div>
        <div className="mt-2">
          <Label className="mb-1.5">Region / city (optional)</Label>
          <Input
            value={regionInput}
            onChange={(e) => setRegionInput(e.target.value)}
            placeholder="e.g. Metro Manila"
            disabled={busy || refreshing}
            className="max-w-xs"
          />
          <p className="text-[11px] text-taupe mt-1">
            Only needed if your source page lists more than one region's price — tells it which one is yours.
          </p>
        </div>
        {watch.lastCheckedAt && (
          <p className="text-[11px] text-taupe mt-1.5">
            Last checked {new Date(watch.lastCheckedAt).toLocaleString()}
            {watch.lastStatus ? ` — ${watch.lastStatus}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {["gasoline", "diesel"].map((fuel) => (
          <div key={fuel}>
            <Label className="text-xs capitalize">{fuel}</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                type="number"
                value={watch.bands[fuel]?.min ?? 0}
                onChange={setBand(fuel, "min")}
                className="h-9"
                aria-label={`${fuel} minimum`}
              />
              <span className="text-xs text-taupe">to</span>
              <Input
                type="number"
                value={watch.bands[fuel]?.max ?? 0}
                onChange={setBand(fuel, "max")}
                className="h-9"
                aria-label={`${fuel} maximum`}
              />
            </div>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-4" onClick={saveBands} disabled={busy}>
        Save Bands
      </Button>
    </div>
  );
}
