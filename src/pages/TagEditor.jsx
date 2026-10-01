import { useEffect, useMemo, useState } from "react";
import { Printer, Undo2, Redo2, RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/db";
import { useOrgLogo } from "../lib/orgLogo";
import { useToast } from "../components/Layout";
import { Button, Select, Label, Input } from "../components/ui";
import { useTagEditor } from "../lib/useTagEditor";
import { TAG_SIZES, scaleLayout } from "../lib/tagLayout";
import TagCanvas from "../components/TagCanvas";

const SAMPLE_RECORD = {
  id: "sample",
  plate_number: "ABC-1234",
  model: "Toyota Hiace Grandia",
  unit_name: "Unit 1",
};

export default function TagEditor() {
  const toast = useToast();
  const orgInfo = useOrgLogo();
  const editor = useTagEditor();
  const { layout, commit, undo, redo, canUndo, canRedo, selectedId, setSelectedId, zoom, setZoom, resetToDefault } = editor;

  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    api.entities.Vehicle.list().then((rows) => setVehicles(rows || [])).catch(() => setVehicles([]));
  }, []);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const qrBaseUrl = `${window.location.origin}/v/`;
  const record = useMemo(() => {
    if (!selectedVehicle) {
      return { ...SAMPLE_RECORD, org_name: orgInfo?.name || "FleetFlow", org_logo: orgInfo?.logo_url || "" };
    }
    return {
      id: selectedVehicle.vehicle_qr_token || selectedVehicle.id,
      plate_number: selectedVehicle.plate_number || "",
      model: selectedVehicle.model || "",
      unit_name: selectedVehicle.unit_name || "",
      org_name: orgInfo?.name || "FleetFlow",
      org_logo: orgInfo?.logo_url || "",
    };
  }, [selectedVehicle, orgInfo]);

  const selectedField = layout.fields.find((f) => f.id === selectedId);

  // commit() replaces the layout wholesale, so every call must carry the
  // full {w, h, fields, style} shape — never a bare fields array.
  const commitFields = (fields) => commit({ ...layout, fields });

  const toggleField = (id) => {
    commitFields(layout.fields.map((f) => (f.id === id ? { ...f, visible: !f.visible } : f)));
  };

  const updateSelected = (patch) => {
    if (!selectedField) return;
    commitFields(layout.fields.map((f) => (f.id === selectedField.id ? { ...f, ...patch } : f)));
  };

  const applySize = (sizeLabel) => {
    const size = TAG_SIZES.find((s) => s.label === sizeLabel);
    if (!size) return;
    const factor = size.w / layout.w;
    commit(scaleLayout(layout, factor));
  };

  const printOne = () => {
    if (!selectedVehicle) {
      toast({ title: "Pick a vehicle first" });
      return;
    }
    if (!selectedVehicle.vehicle_qr_token) {
      toast({ title: "This vehicle has no QR token yet", description: "Generate one from Fleet → Asset Record first." });
      return;
    }
    const qs = new URLSearchParams({
      plate: selectedVehicle.plate_number || "",
      model: selectedVehicle.model || selectedVehicle.unit_name || "",
      url: `${qrBaseUrl}${selectedVehicle.vehicle_qr_token}`,
      org: orgInfo?.name || "",
      logo: orgInfo?.logo_url || "",
    });
    window.open(`/print/vehicle-sticker?${qs.toString()}`, "_blank");
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Tag Editor</h1>
          <p className="text-sm text-taupe mt-1">Design the printable vehicle QR tag — drag, resize, style.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}><Undo2 className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo}><Redo2 className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={resetToDefault}><RotateCcw className="w-4 h-4" /> Reset layout</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_280px] gap-4">
        {/* Left — Fields */}
        <div className="bg-white rounded-3xl shadow-card p-4 space-y-3 h-fit">
          <h3 className="text-sm font-semibold text-cocoa">Fields</h3>
          <p className="text-[11px] text-taupe">Click to select &amp; drag on the canvas. Toggle to show/hide.</p>
          <div className="space-y-1">
            {layout.fields.map((f) => (
              <div
                key={f.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer ${
                  selectedId === f.id ? "bg-mint/50 text-brand font-medium" : "text-mocha hover:bg-cream"
                }`}
                onClick={() => setSelectedId(f.id)}
              >
                <span>{f.label}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleField(f.id); }} className="text-taupe hover:text-brand flex-none">
                  {f.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-sand/70">
            <Label className="mb-1.5">Tag size</Label>
            <Select onChange={(e) => applySize(e.target.value)} defaultValue="">
              <option value="" disabled>Choose a size…</option>
              {TAG_SIZES.map((s) => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Centre — Canvas */}
        <div className="bg-white rounded-3xl shadow-card p-4">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}><ZoomOut className="w-4 h-4" /></Button>
            <span className="text-xs text-taupe w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.15))}><ZoomIn className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center justify-center overflow-auto py-6" style={{ minHeight: 420 }}>
            <div className="border border-sand shadow-card" style={{ background: "#fff" }}>
              <TagCanvas
                layout={layout}
                record={record}
                scale={160 * zoom}
                qrBaseUrl={qrBaseUrl}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCommit={commit}
              />
            </div>
          </div>
          <p className="text-center text-[11px] text-taupe">
            {selectedVehicle ? `Previewing ${selectedVehicle.plate_number}` : "Previewing sample data — pick a vehicle on the right to use real data"}
          </p>
        </div>

        {/* Right — Populate, Element inspector, Print */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl shadow-card p-4 space-y-2">
            <Label>Populate from vehicle</Label>
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Sample data</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate_number} — {v.model || v.unit_name || ""}</option>
              ))}
            </Select>
            <Button variant="primary" className="w-full mt-2" onClick={printOne}>
              <Printer className="w-4 h-4" /> Print this tag
            </Button>
          </div>

          {selectedField && (
            <div className="bg-white rounded-3xl shadow-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-cocoa">{selectedField.label}</h3>
              {selectedField.type === "text" && (
                <>
                  <div>
                    <Label className="mb-1">Text</Label>
                    <Input value={selectedField.value} onChange={(e) => updateSelected({ value: e.target.value })} />
                    <p className="text-[10px] text-taupe mt-1">Use {"{plate_number}"}, {"{model}"}, {"{unit_name}"}, {"{org_name}"} as placeholders.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1">Font size</Label>
                      <Input
                        type="number" min="6" max="48"
                        value={selectedField.fontSize || 10}
                        onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 10 })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1">Align</Label>
                      <Select value={selectedField.align || "left"} onChange={(e) => updateSelected({ align: e.target.value })}>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1">Color</Label>
                    <input
                      type="color"
                      value={selectedField.color || "#2b2420"}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      className="w-full h-9 rounded-md border border-sand"
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Weight</Label>
                    <Select value={String(selectedField.fontWeight || 400)} onChange={(e) => updateSelected({ fontWeight: Number(e.target.value) })}>
                      <option value="400">Regular</option>
                      <option value="500">Medium</option>
                      <option value="700">Bold</option>
                    </Select>
                  </div>
                </>
              )}
              {selectedField.type !== "text" && (
                <p className="text-xs text-taupe">Drag on the canvas to move or resize this {selectedField.type === "qr" ? "QR code" : "image"}.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
