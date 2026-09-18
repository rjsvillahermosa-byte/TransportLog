import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Camera,
  Car,
  Contact,
  FileText,
  Gauge,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import dayjs from "../lib/day";
import { api, integrations } from "../lib/db";
import { cn, SERVICE_TYPES } from "../lib/utils";
import { generateCuteAvatar, initials } from "../lib/avatar";
import {
  computePmsStatus,
  computeRenewal,
  computeTireWear,
  getCurrentOdo,
  pmsStatusStyle,
  suggestPms,
} from "../lib/pms";
import {
  Button,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from "../components/ui";
import { DatePicker } from "../components/DatePicker";
import { useToast } from "../components/Layout";

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

const emptyDriver = {
  full_name: "",
  employee_id: "",
  contact_number: "",
  email: "",
  license_number: "",
  license_expiry: "",
  assigned_vehicle_plate: "",
  status: "Active",
  notes: "",
};
const emptyVehicle = {
  plate_number: "",
  unit_name: "",
  model: "",
  status: "available",
  image_url: "",
  fuel_type: "diesel",
  tank_liters: 60,
  rated_km_per_liter: 9,
  pms_interval_km: 10000,
  pms_interval_months: 6,
  registration_expiry: "",
  insurance_expiry: "",
  registration_photo: "",
  insurance_photo: "",
  tire_life_km: 40000,
  tire_changed_odometer: "",
};
const emptyService = {
  vehicle_plate: "",
  service_type: "General Inspection",
  service_date: dayjs().format("YYYY-MM-DD"),
  odometer_at_service: "",
  next_service_km: "",
  next_service_date: "",
  service_provider: "",
  cost: "",
  notes: "",
};

const LICENSE_PROMPT =
  "Read this driver's license card photo (Philippines LTO format). Extract into JSON: " +
  "full_name, license_number, license_expiry (YYYY-MM-DD), license_code (e.g. Professional — restrictions).";

function DriverModal({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial || emptyDriver);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [licensePhoto, setLicensePhoto] = useState("");
  const [extracted, setExtracted] = useState(null);
  const [avatar, setAvatar] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    setForm(initial || emptyDriver);
    setLicensePhoto(initial?.license_photo || "");
    setExtracted(null);
    setAvatar(initial?.avatar || "");
  }, [initial, open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Cute AI avatar: a real stylization of the license photo (smooth →
  // posterize → outline → warm), generated client-side.
  const makeAvatar = async (src) => {
    setAvatarBusy(true);
    try {
      const cute = await generateCuteAvatar(src);
      setAvatar(cute);
    } catch (err) {
      console.error("Avatar generation failed:", err);
    } finally {
      setAvatarBusy(false);
    }
  };

  // License OCR: photo → upload → LLM extraction → prefill (renewal tracked
  // from license_expiry automatically on the Renewals board). The avatar is
  // generated from the same capture.
  const onLicensePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setExtracted(null);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setLicensePhoto(file_url);
      makeAvatar(file_url);
      const res = await integrations.Core.InvokeLLM({
        prompt: LICENSE_PROMPT,
        image_urls: [file_url],
        response_json_schema: { type: "object" },
      });
      setForm((f) => ({
        ...f,
        full_name: res.full_name
          ? res.full_name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
          : f.full_name,
        license_number: res.license_number || f.license_number,
        license_expiry: res.license_expiry || f.license_expiry,
      }));
      setExtracted(res);
    } catch (err) {
      console.error("License OCR failed:", err);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!form.full_name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        license_photo: licensePhoto,
        avatar,
        license_expiry: form.license_expiry || null,
      };
      if (initial?.id) await api.entities.Driver.update(initial.id, payload);
      else await api.entities.Driver.create(payload);
      onSaved();
    } catch (err) {
      console.error("Failed to save driver:", err);
      toast({ title: "Error", description: "Failed to save driver." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Edit Driver" : "Add Driver"}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onLicensePhoto} />

      {!licensePhoto ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="w-full mb-4 border-2 border-dashed border-sand rounded-xl py-6 flex flex-col items-center gap-2 text-taupe hover:border-brand/50 hover:text-brand transition-colors"
        >
          {scanning ? <Loader2 className="w-7 h-7 animate-spin" /> : <ScanLine className="w-7 h-7" />}
          <span className="text-sm font-medium">
            {scanning ? "Reading license card..." : "Capture Driver's License (OCR)"}
          </span>
          <span className="text-xs">Photograph the license — name, number & expiry auto-fill</span>
        </button>
      ) : (
        <div className="mb-4 space-y-2">
          <div className="relative">
            <img src={licensePhoto} alt="Driver's license" className="w-full h-36 object-cover rounded-lg border border-sand" />
            {!scanning && (
              <button
                onClick={() => { setLicensePhoto(""); setExtracted(null); }}
                className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-1.5 shadow"
              >
                <X className="w-4 h-4 text-mocha" />
              </button>
            )}
          </div>
          {scanning && (
            <p className="text-sm text-taupe flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading license card...
            </p>
          )}
          {extracted && !scanning && (
            <div className="bg-mint/60 border border-brand/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-brand">
                ✓ License read — {extracted.license_code || "verified"}
              </p>
            </div>
          )}
          {/* Cute AI avatar — stylized from the license photo itself */}
          <div className="flex items-center gap-3">
            {avatarBusy ? (
              <>
                <div className="w-14 h-14 rounded-full bg-mint/60 flex items-center justify-center flex-none">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                </div>
                <p className="text-xs text-taupe">Making cute avatar from the license photo…</p>
              </>
            ) : avatar ? (
              <>
                <img
                  src={avatar}
                  alt="Cute avatar"
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-mint flex-none"
                />
                <div>
                  <p className="text-xs font-semibold text-brand">✨ Cute avatar ready</p>
                  <button
                    type="button"
                    onClick={() => makeAvatar(licensePhoto)}
                    className="text-xs text-taupe underline hover:text-brand"
                  >
                    Regenerate from license photo
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-mint/40 flex items-center justify-center flex-none">
                  <Sparkles className="w-5 h-5 text-brand/60" />
                </div>
                <button
                  type="button"
                  onClick={() => makeAvatar(licensePhoto)}
                  className="text-xs font-semibold text-brand underline underline-offset-2"
                >
                  ✨ Generate cute avatar from license photo
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Full Name *</Label>
          <Input value={form.full_name} onChange={set("full_name")} placeholder="Juan Dela Cruz" />
        </div>
        <div className="space-y-1.5">
          <Label>Employee ID</Label>
          <Input value={form.employee_id} onChange={set("employee_id")} placeholder="MS-00005" />
        </div>
        <div className="space-y-1.5">
          <Label>Contact Number</Label>
          <Input value={form.contact_number} onChange={set("contact_number")} placeholder="+63 917 000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label>License Number</Label>
          <Input value={form.license_number} onChange={set("license_number")} placeholder="G11-10-000495" />
        </div>
        <div className="space-y-1.5">
          <Label>License Expiry</Label>
          <DatePicker
            value={form.license_expiry}
            onChange={(v) => setForm((f) => ({ ...f, license_expiry: v }))}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Assigned Vehicle Plate</Label>
          <Input value={form.assigned_vehicle_plate} onChange={set("assigned_vehicle_plate")} placeholder="NAC 1234" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
          {busy && <Spinner className="w-4 h-4" />} Save Driver
        </Button>
      </div>
    </Modal>
  );
}

const REG_PROMPT =
  "Read this LTO Official Receipt / Certificate of Registration (OR/CR) photo. Extract into JSON: " +
  "plate_number, cr_number, registration_expiry (YYYY-MM-DD).";
const INS_PROMPT =
  "Read this motor vehicle insurance policy / certificate of cover photo. Extract into JSON: " +
  "provider, policy_number, insurance_expiry (YYYY-MM-DD).";

function VehicleModal({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial || emptyVehicle);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanningDoc, setScanningDoc] = useState(null); // "registration" | "insurance"
  const photoRef = useRef(null);
  const regRef = useRef(null);
  const insRef = useRef(null);
  useEffect(() => setForm(initial || emptyVehicle), [initial, open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const suggestion = suggestPms(form.model);
  const applySuggestion = () =>
    setForm((f) => ({ ...f, pms_interval_km: suggestion.intervalKm, pms_interval_months: suggestion.intervalMonths }));

  // Vehicle photo: pick → downscale → data URL (same upload path as ODO/receipt
  // photos). Works at enrollment and later via Edit (replace/remove).
  const onPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setForm((f) => ({ ...f, image_url: file_url }));
    } catch (err) {
      console.error("Vehicle photo upload failed:", err);
    } finally {
      setUploading(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  };

  // Document OCR — OR/CR and insurance policy photos set their expiry dates
  // and are kept on the vehicle record (viewable in the Asset Record).
  const onDocPhoto = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanningDoc(kind);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      const res = await integrations.Core.InvokeLLM({
        prompt: kind === "registration" ? REG_PROMPT : INS_PROMPT,
        image_urls: [file_url],
        response_json_schema: { type: "object" },
      });
      setForm((f) => ({
        ...f,
        ...(kind === "registration"
          ? { registration_expiry: res.registration_expiry || f.registration_expiry, registration_photo: file_url }
          : { insurance_expiry: res.insurance_expiry || f.insurance_expiry, insurance_photo: file_url }),
      }));
    } catch (err) {
      console.error("Document OCR failed:", err);
    } finally {
      setScanningDoc(null);
      e.target.value = "";
    }
  };

  const save = async () => {
    if (!form.plate_number.trim()) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        tank_liters: Number(form.tank_liters) || 60,
        rated_km_per_liter: Number(form.rated_km_per_liter) || 9,
        pms_interval_km: Number(form.pms_interval_km) || 10000,
        pms_interval_months: Number(form.pms_interval_months) || 6,
        registration_expiry: form.registration_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
      };
      if (initial?.id) await api.entities.Vehicle.update(initial.id, payload);
      else await api.entities.Vehicle.create(payload);
      onSaved();
    } catch (err) {
      console.error("Failed to save vehicle:", err);
      toast({ title: "Error", description: "Failed to save vehicle." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? "Edit Vehicle" : "Add Vehicle"}>
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={onPhotoPick} />

      {/* Photo box — add at enrollment, replace or remove anytime */}
      <div className="mb-4">
        {form.image_url ? (
          <div className="relative">
            <img
              src={form.image_url}
              alt="Vehicle"
              className="w-full h-40 object-cover rounded-xl border border-sand"
            />
            {uploading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-mocha" />
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-medium bg-white/95 backdrop-blur text-mocha border border-sand rounded-full px-2.5 py-1 shadow hover:bg-white"
              >
                <RotateCcw className="w-3 h-3" /> Replace
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                className="inline-flex items-center gap-1 text-xs font-medium bg-white/95 backdrop-blur text-red-600 border border-red-100 rounded-full px-2.5 py-1 shadow hover:bg-white"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={uploading}
            className="w-full border-2 border-dashed border-sand rounded-xl py-7 flex flex-col items-center gap-1.5 text-taupe hover:border-brand/50 hover:text-brand transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <ImagePlus className="w-7 h-7" />
            )}
            <span className="text-sm font-medium">
              {uploading ? "Processing photo..." : "Add Vehicle Photo"}
            </span>
            <span className="text-xs">Upload or take a photo — shown on the vehicle card & asset record</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Plate Number *</Label>
          <Input value={form.plate_number} onChange={set("plate_number")} placeholder="NAC 1234" />
        </div>
        <div className="space-y-1.5">
          <Label>Unit Name</Label>
          <Input value={form.unit_name} onChange={set("unit_name")} placeholder="Van 01" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Model</Label>
          <Input value={form.model} onChange={set("model")} placeholder="Toyota Hiace Grandia" />
        </div>
        <div className="space-y-1.5">
          <Label>Fuel Type</Label>
          <Select value={form.fuel_type} onChange={set("fuel_type")}>
            <option value="diesel">diesel</option>
            <option value="gasoline">gasoline</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onChange={set("status")}>
            <option value="available">available</option>
            <option value="in use">in use</option>
            <option value="maintenance">maintenance</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tank (L)</Label>
          <Input type="number" value={form.tank_liters} onChange={set("tank_liters")} />
        </div>
        <div className="space-y-1.5">
          <Label>Rated km/L</Label>
          <Input type="number" step="0.1" value={form.rated_km_per_liter} onChange={set("rated_km_per_liter")} />
        </div>
        <div className="space-y-1.5">
          <Label>PMS every (km)</Label>
          <Input type="number" value={form.pms_interval_km} onChange={set("pms_interval_km")} />
        </div>
        <div className="space-y-1.5">
          <Label>PMS every (months)</Label>
          <Input type="number" value={form.pms_interval_months} onChange={set("pms_interval_months")} />
        </div>
        <div className="col-span-2">
          <button
            type="button"
            onClick={applySuggestion}
            className="text-xs text-brand hover:underline text-left"
          >
            ✨ Use auto-recommended schedule from model: {suggestion.label}
          </button>
        </div>
      </div>

      {/* Registration, insurance & tires — renewal-tracked documents */}
      <input ref={regRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onDocPhoto(e, "registration")} />
      <input ref={insRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onDocPhoto(e, "insurance")} />
      <div className="mt-4 pt-4 border-t border-sand/70">
        <h4 className="text-xs font-semibold text-taupe uppercase tracking-wide mb-3">
          Registration, Insurance & Tires
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Registration Expiry (OR/CR)</Label>
            <DatePicker
              value={form.registration_expiry}
              onChange={(v) => setForm((f) => ({ ...f, registration_expiry: v }))}
            />
            <button
              type="button"
              onClick={() => regRef.current?.click()}
              disabled={scanningDoc === "registration"}
              className="text-xs text-brand hover:underline inline-flex items-center gap-1"
            >
              {scanningDoc === "registration" ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Reading OR/CR…</>
              ) : (
                <><ScanLine className="w-3 h-3" /> Capture OR/CR (OCR)</>
              )}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Insurance Expiry</Label>
            <DatePicker
              value={form.insurance_expiry}
              onChange={(v) => setForm((f) => ({ ...f, insurance_expiry: v }))}
            />
            <button
              type="button"
              onClick={() => insRef.current?.click()}
              disabled={scanningDoc === "insurance"}
              className="text-xs text-brand hover:underline inline-flex items-center gap-1"
            >
              {scanningDoc === "insurance" ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Reading policy…</>
              ) : (
                <><ScanLine className="w-3 h-3" /> Capture Policy (OCR)</>
              )}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Tire Life (km)</Label>
            <Input type="number" value={form.tire_life_km} onChange={set("tire_life_km")} placeholder="40000" />
          </div>
          <div className="space-y-1.5">
            <Label>Tires Last Changed At (km)</Label>
            <Input
              type="number"
              value={form.tire_changed_odometer}
              onChange={set("tire_changed_odometer")}
              placeholder="e.g. 34500"
            />
          </div>
          <p className="col-span-2 text-xs text-taupe">
            Tire wear is tracked from the odometer automatically — and resets on its own whenever
            a "Tire Replacement" service is logged.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
          {busy && <Spinner className="w-4 h-4" />} Save Vehicle
        </Button>
      </div>
    </Modal>
  );
}

// --- Service modal with OCR casa-report capture ----------------------------
const CASA_PROMPT =
  "Read this casa (dealer) service report photo. Extract the fields into JSON: " +
  "service_date (YYYY-MM-DD), odometer_at_service (number, km), service_type, " +
  "casa (dealer/shop name), cost (number, PHP), next_service_km (number), " +
  "next_service_date (YYYY-MM-DD), parts (array of strings), recommendations (array of strings).";

function ServiceModal({ open, onClose, vehicles, presetPlate, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...emptyService, vehicle_plate: presetPlate || "" });
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [reportPhoto, setReportPhoto] = useState("");
  const [extracted, setExtracted] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setForm((f) => ({ ...emptyService, vehicle_plate: presetPlate || "" }));
    setReportPhoto("");
    setExtracted(null);
  }, [presetPlate, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // OCR pipeline: capture → upload → LLM extraction → prefill (same pattern
  // the original app uses for odometer photos, via integrations.Core.InvokeLLM)
  const onReportPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setExtracted(null);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setReportPhoto(file_url);
      const res = await integrations.Core.InvokeLLM({
        prompt: CASA_PROMPT,
        image_urls: [file_url],
        response_json_schema: { type: "object" },
      });
      setForm((f) => ({
        ...f,
        service_date: res.service_date || f.service_date,
        odometer_at_service: res.odometer_at_service ?? f.odometer_at_service,
        service_type: res.service_type || f.service_type,
        service_provider: res.casa || f.service_provider,
        cost: res.cost ?? f.cost,
        next_service_km: res.next_service_km ?? f.next_service_km,
        next_service_date: res.next_service_date || f.next_service_date,
        notes:
          [...(res.parts || []), ...(res.recommendations || [])].join(" · ") || f.notes,
      }));
      setExtracted(res);
      toast({
        title: "Casa report read",
        description: `${Math.round((res.confidence ?? 0.9) * 100)}% confidence — review the extracted fields.`,
      });
    } catch (err) {
      console.error("OCR failed:", err);
      toast({ title: "OCR failed", description: "Enter the service details manually." });
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!form.vehicle_plate || !form.service_date) return;
    setBusy(true);
    try {
      await api.entities.ServiceLog.create({
        ...form,
        odometer_at_service: form.odometer_at_service ? Number(form.odometer_at_service) : undefined,
        next_service_km: form.next_service_km ? Number(form.next_service_km) : undefined,
        next_service_date: form.next_service_date || null,
        cost: form.cost ? Number(form.cost) : undefined,
        source: extracted ? "ocr" : "manual",
        report_photo: reportPhoto,
        casa: extracted?.casa || form.service_provider,
        parts: extracted?.parts || [],
        recommendations: extracted?.recommendations || [],
      });
      // Logging a tire replacement restarts the tire-wear clock for that vehicle
      if (form.service_type === "Tire Replacement" && form.odometer_at_service) {
        const veh = vehicles.find((v) => v.plate_number === form.vehicle_plate);
        if (veh) await api.entities.Vehicle.update(veh.id, { tire_changed_odometer: Number(form.odometer_at_service) });
      }
      onSaved();
    } catch (err) {
      console.error("Failed to save service log:", err);
      toast({ title: "Error", description: "Failed to save service log." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Service">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onReportPhoto}
      />

      {/* OCR capture zone */}
      {!reportPhoto ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="w-full mb-4 border-2 border-dashed border-sand rounded-xl py-6 flex flex-col items-center gap-2 text-taupe hover:border-brand/50 hover:text-brand transition-colors"
        >
          <ScanLine className="w-7 h-7" />
          <span className="text-sm font-medium">Capture Casa Report (OCR)</span>
          <span className="text-xs">Photograph the service report — fields auto-fill</span>
        </button>
      ) : (
        <div className="mb-4 space-y-2">
          <div className="relative">
            <img src={reportPhoto} alt="Casa report" className="w-full h-44 object-cover rounded-lg border border-sand" />
            {!scanning && (
              <button
                onClick={() => { setReportPhoto(""); setExtracted(null); }}
                className="absolute top-2 right-2 bg-white/90 backdrop-blur rounded-full p-1.5 shadow"
              >
                <X className="w-4 h-4 text-mocha" />
              </button>
            )}
          </div>
          {scanning ? (
            <p className="text-sm text-taupe flex items-center gap-2">
              <Spinner className="w-4 h-4" /> Reading casa report...
            </p>
          ) : extracted ? (
            <div className="bg-mint/60 border border-mintdark rounded-lg p-3">
              <p className="text-xs font-semibold text-brand mb-1">
                ✓ Extracted with {Math.round((extracted.confidence ?? 0.9) * 100)}% confidence — editable below
              </p>
              <p className="text-xs text-mocha">
                {extracted.casa} · {extracted.service_type}
                {extracted.recommendations?.length ? ` · ${extracted.recommendations.length} recommendations saved to the asset record` : ""}
              </p>
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Vehicle Plate *</Label>
          <Select value={form.vehicle_plate} onChange={set("vehicle_plate")}>
            <option value="">Select vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.plate_number}>
                {v.plate_number} — {v.model || v.unit_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Service Type</Label>
          <Select value={form.service_type} onChange={set("service_type")}>
            {SERVICE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Service Date *</Label>
          <Input type="date" value={form.service_date} onChange={set("service_date")} />
        </div>
        <div className="space-y-1.5">
          <Label>Odometer at Service</Label>
          <Input type="number" value={form.odometer_at_service} onChange={set("odometer_at_service")} />
        </div>
        <div className="space-y-1.5">
          <Label>Next Service (km)</Label>
          <Input type="number" value={form.next_service_km} onChange={set("next_service_km")} />
        </div>
        <div className="space-y-1.5">
          <Label>Next Service Date</Label>
          <Input type="date" value={form.next_service_date} onChange={set("next_service_date")} />
        </div>
        <div className="space-y-1.5">
          <Label>Service Provider / Casa</Label>
          <Input value={form.service_provider} onChange={set("service_provider")} placeholder="Toyota Casa — Pasig" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Cost</Label>
          <Input type="number" value={form.cost} onChange={set("cost")} placeholder="0" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} />
        </div>
      </div>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
          {busy ? <Spinner className="w-4 h-4" /> : <FileText className="w-4 h-4" />} Save to Asset Record
        </Button>
      </div>
    </Modal>
  );
}

// --- Vehicle asset record: full service history -----------------------------
function AssetRecordModal({ open, onClose, vehicle, services }) {
  const mine = services
    .filter((s) => s.vehicle_plate === vehicle?.plate_number)
    .sort((a, b) => dayjs(b.service_date).valueOf() - dayjs(a.service_date).valueOf());
  const totalSpend = mine.reduce((s, x) => s + (Number(x.cost) || 0), 0);
  const [photo, setPhoto] = useState(null);

  return (
    <Modal open={open} onClose={() => { setPhoto(null); onClose(); }} title={`Asset Record — ${vehicle?.plate_number || ""}`}>
      {vehicle?.image_url && (
        <img
          src={vehicle.image_url}
          alt={vehicle.plate_number}
          className="w-full h-40 object-cover rounded-xl border border-sand mb-4"
        />
      )}
      <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
        <div>
          <p className="text-xs text-taupe">Model</p>
          <p className="text-cocoa font-medium">{vehicle?.model || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-taupe">Unit</p>
          <p className="text-cocoa font-medium">{vehicle?.unit_name || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-taupe">Fuel / Tank</p>
          <p className="text-cocoa font-medium capitalize">
            {vehicle?.fuel_type} · {vehicle?.tank_liters} L
          </p>
        </div>
        <div>
          <p className="text-xs text-taupe">PMS Interval</p>
          <p className="text-cocoa font-medium">
            {Number(vehicle?.pms_interval_km).toLocaleString()} km / {vehicle?.pms_interval_months} mo
          </p>
        </div>
        <div className="col-span-2 border-t border-sand/70 pt-2">
          <p className="text-xs text-taupe">Total recorded service spend</p>
          <p className="text-cocoa font-bold">₱{totalSpend.toLocaleString()} · {mine.length} service record{mine.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {photo ? (
        <div className="mb-4">
          <img src={photo} alt="Casa report" className="w-full rounded-lg border border-sand" />
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setPhoto(null)}>
            Close report photo
          </Button>
        </div>
      ) : mine.length === 0 ? (
        <EmptyState icon={Wrench}>No service records yet for this vehicle</EmptyState>
      ) : (
        <div className="space-y-3">
          {mine.map((s) => (
            <div key={s.id} className="bg-mint/40 border border-sand/70 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-cocoa">{s.service_type}</p>
                  <p className="text-xs text-taupe">
                    {dayjs(s.service_date).format("MMM D, YYYY")} ·{" "}
                    {s.odometer_at_service ? `${Number(s.odometer_at_service).toLocaleString()} km` : "no ODO"} ·{" "}
                    {s.service_provider || "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {s.cost ? <p className="text-sm font-bold text-cocoa">₱{Number(s.cost).toLocaleString()}</p> : null}
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                      s.source === "ocr"
                        ? "bg-mint/50 text-brand border-brand/30"
                        : "bg-mint/60 text-taupe border-sand"
                    )}
                  >
                    {s.source === "ocr" ? "OCR · casa report" : "manual"}
                  </span>
                </div>
              </div>
              {s.notes && <p className="text-xs text-taupe mt-1.5">{s.notes}</p>}
              {s.report_photo && (
                <button
                  onClick={() => setPhoto(s.report_photo)}
                  className="mt-2 flex items-center gap-1.5 text-xs text-brand hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" /> View casa report
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// --- Unified renewals board --------------------------------------------------
// One command center for everything that expires: vehicle PMS (km or months,
// whichever first), LTO registration, insurance, tire wear (odometer-based),
// and driver's licenses.
function RenewalRow({ icon: Icon, title, entity, detail, sub, status, progress, onLogService }) {
  const st = pmsStatusStyle(status);
  return (
    <div className="bg-white rounded-3xl shadow-card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-mint/40 border border-sand/70 flex items-center justify-center flex-none">
            <Icon className="w-5 h-5 text-taupe" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cocoa">
              {title} <span className="font-normal text-taupe">· {entity}</span>
            </p>
            <p className="text-xs text-taupe">{detail}</p>
            {sub && <p className="text-[11px] text-taupe mt-0.5">{sub}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-none">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${st.chip}`}>
            {status === "overdue" ? "Overdue" : status === "due-soon" ? "Due soon" : "On track"}
          </span>
          {onLogService && (
            <button
              onClick={onLogService}
              className="text-xs text-brand hover:underline flex-none"
            >
              Log
            </button>
          )}
        </div>
      </div>
      {progress != null && (
        <div className="h-1.5 bg-mint/60 rounded-full overflow-hidden">
          <div className={`h-full ${st.bar}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet page
// ---------------------------------------------------------------------------
export default function Fleet() {
  const toast = useToast();
  const [tab, setTab] = useState("drivers");
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [mileage, setMileage] = useState([]);
  const [fills, setFills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type, initial?, presetPlate?}
  const [assetVehicle, setAssetVehicle] = useState(null);
  const alertedRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const [v, d, s, m, f] = await Promise.all([
        api.entities.Vehicle.list(),
        api.entities.Driver.list(),
        api.entities.ServiceLog.list("-service_date", 200),
        api.entities.MileageLog.list("-time_out", 500),
        api.entities.FuelLog.list("-fill_date", 500),
      ]);
      setVehicles(v);
      setDrivers(d);
      setServices(s);
      setMileage(m);
      setFills(f);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // PMS board + current odometer per vehicle
  const pmsBoard = useMemo(
    () =>
      vehicles.map((v) => {
        const { odo, source } = getCurrentOdo(v.plate_number, mileage, fills);
        return { vehicle: v, currentOdo: odo, odoSource: source, status: computePmsStatus(v, services, odo) };
      }),
    [vehicles, services, mileage, fills]
  );

  // Unified renewals: PMS + registration + insurance + tires per vehicle,
  // licenses per driver — sorted so urgent items surface first.
  const renewals = useMemo(() => {
    const items = [];
    const RANK = { overdue: 0, "due-soon": 1, ok: 2 };
    pmsBoard.forEach((b) => {
      const v = b.vehicle;
      items.push({
        key: `pms-${v.id}`,
        icon: Wrench,
        title: "PMS / Change Oil",
        entity: `${v.plate_number} · ${v.model || v.unit_name || ""}`,
        detail:
          b.status.message ||
          `${b.status.kmRemaining.toLocaleString()} km or ${b.status.daysRemaining} days left`,
        sub: `every ${b.status.intervalKm.toLocaleString()} km / ${b.status.intervalMonths} mo · now ${b.currentOdo.toLocaleString()} km (${b.odoSource || "no data"})`,
        status: b.status.status,
        progress: Math.max(b.status.kmProgress, b.status.timeProgress),
        onLogService: v.plate_number,
      });
      const reg = computeRenewal(v.registration_expiry);
      if (reg)
        items.push({
          key: `reg-${v.id}`,
          icon: FileText,
          title: "Registration (OR/CR)",
          entity: v.plate_number,
          detail: `${reg.message} — expires ${reg.dueDate}`,
          sub: "LTO renewal",
          status: reg.status,
          progress: reg.progress,
        });
      const ins = computeRenewal(v.insurance_expiry);
      if (ins)
        items.push({
          key: `ins-${v.id}`,
          icon: ShieldCheck,
          title: "Insurance",
          entity: v.plate_number,
          detail: `${ins.message} — expires ${ins.dueDate}`,
          sub: "CTPL / comprehensive policy",
          status: ins.status,
          progress: ins.progress,
        });
      const tire = computeTireWear(v, b.currentOdo);
      if (tire)
        items.push({
          key: `tire-${v.id}`,
          icon: Gauge,
          title: "Tire Wear",
          entity: v.plate_number,
          detail: tire.message,
          sub: `${tire.used.toLocaleString()} / ${tire.life.toLocaleString()} km since last change`,
          status: tire.status,
          progress: tire.progress,
        });
    });
    drivers.forEach((d) => {
      const lic = computeRenewal(d.license_expiry);
      if (lic)
        items.push({
          key: `lic-${d.id}`,
          icon: Contact,
          title: "Driver's License",
          entity: `${d.full_name} · ${d.license_number || "no number"}`,
          detail: `${lic.message} — expires ${lic.dueDate}`,
          sub: "LTO license renewal",
          status: lic.status,
          progress: lic.progress,
        });
    });
    return items.sort((a, b) => RANK[a.status] - RANK[b.status]);
  }, [pmsBoard, drivers]);

  useEffect(() => {
    if (loading || alertedRef.current) return;
    alertedRef.current = true;
    const overdue = renewals.filter((r) => r.status === "overdue");
    const soon = renewals.filter((r) => r.status === "due-soon");
    const label = (list) =>
      list
        .slice(0, 3)
        .map((r) => `${r.entity.split(" · ")[0]} ${r.title}`)
        .join(" · ") + (list.length > 3 ? ` +${list.length - 3} more` : "");
    if (overdue.length)
      toast({
        title: `⚠ ${overdue.length} renewal${overdue.length > 1 ? "s" : ""} overdue`,
        description: label(overdue),
      });
    else if (soon.length)
      toast({
        title: `Renewals due soon — ${soon.length} item${soon.length > 1 ? "s" : ""}`,
        description: label(soon),
      });
  }, [loading, renewals]); // eslint-disable-line

  const del = async (entity, id, label) => {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await api.entities[entity].delete(id);
    load();
  };

  const clearVehicles = async () => {
    if (!window.confirm(`Delete all ${vehicles.length} vehicles? This cannot be undone.`)) return;
    await Promise.all(vehicles.map((v) => api.entities.Vehicle.delete(v.id)));
    load();
  };

  const overdueCount = renewals.filter((b) => b.status !== "ok").length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cocoa">Fleet Management</h1>
          <p className="text-sm text-taupe mt-1">
            Drivers, vehicles, renewals & service records
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setModal({ type: "service" })}>
            <ScanLine className="w-3.5 h-3.5" /> Log Service / OCR
          </Button>
          <Button size="sm" variant="outline" onClick={() => setModal({ type: "vehicle" })}>
            <Plus className="w-3.5 h-3.5" /> Add Vehicle
          </Button>
          <Button size="sm" variant="primary" onClick={() => setModal({ type: "driver" })}>
            <UserPlus className="w-3.5 h-3.5" /> Add Driver
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "drivers", label: `Drivers (${drivers.length})` },
            { value: "vehicles", label: `Vehicles (${vehicles.length})` },
            { value: "renewals", label: `Renewals${overdueCount ? ` ⚠ ${overdueCount}` : ""}` },
            { value: "services", label: `Service Logs (${services.length})` },
          ]}
        />
        {tab === "vehicles" && vehicles.length > 0 && (
          <button
            onClick={clearVehicles}
            className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Clear All Vehicles
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="w-6 h-6 text-taupe" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tab === "drivers" &&
            (drivers.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState icon={UserPlus}>No drivers yet — add your first driver</EmptyState>
              </div>
            ) : (
              drivers.map((d) => {
                const lic = computeRenewal(d.license_expiry);
                const licStyle = lic ? pmsStatusStyle(lic.status) : null;
                return (
                <div key={d.id} className="bg-white rounded-3xl shadow-card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {d.avatar ? (
                        <img
                          src={d.avatar}
                          alt={d.full_name}
                          title="Cute AI avatar from license photo"
                          className="w-14 h-14 rounded-full object-cover ring-2 ring-mint flex-none"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-mint/70 flex items-center justify-center flex-none">
                          <span className="font-heading font-bold text-brand">
                            {initials(d.full_name)}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm text-cocoa">{d.full_name}</p>
                      <p className="text-xs text-taupe mt-0.5">
                        ID: {d.employee_id || "—"} · {d.contact_number || "No contact"}
                      </p>
                      <p className="text-xs text-taupe">
                        License: {d.license_number || "—"} ·{" "}
                        {d.license_expiry ? `Exp: ${dayjs(d.license_expiry).format("MMM D, YYYY")}` : "No expiry"}
                      </p>
                      {d.assigned_vehicle_plate && (
                        <p className="text-xs text-taupe mt-0.5">🚗 {d.assigned_vehicle_plate}</p>
                      )}
                      {lic && (
                        <span className={`inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${licStyle.chip}`}>
                          License {lic.message.toLowerCase()}
                        </span>
                      )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-mint/60 text-brand border-brand/30">
                        {d.status}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setModal({ type: "driver", initial: d })}
                          className="text-taupe hover:text-brand p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => del("Driver", d.id, d.full_name)}
                          className="text-sand hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })
            ))}

          {tab === "vehicles" &&
            (vehicles.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState icon={Car}>No vehicles yet — add your first vehicle</EmptyState>
              </div>
            ) : (
              vehicles.map((v) => {
                const board = pmsBoard.find((b) => b.vehicle.id === v.id);
                const st = board ? pmsStatusStyle(board.status.status) : null;
                return (
                  <div key={v.id} className="bg-white rounded-3xl shadow-card p-4 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      {v.image_url ? (
                        <img
                          src={v.image_url}
                          alt={v.plate_number}
                          className="w-16 h-16 rounded-lg object-cover border border-sand flex-none"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-mint/40 border border-sand/70 flex items-center justify-center flex-none">
                          <Car className="w-6 h-6 text-sand" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-cocoa">{v.plate_number}</p>
                        <p className="text-xs text-taupe">
                          {v.model || v.unit_name || "—"} · {v.fuel_type} · {v.tank_liters}L
                        </p>
                        {board && (
                          <button
                            className={`mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.chip} inline-flex items-center gap-1`}
                            onClick={() => setTab("renewals")}
                          >
                            <CalendarClock className="w-3 h-3" />
                            {board.status.status === "overdue"
                              ? "PMS overdue"
                              : board.status.status === "due-soon"
                              ? "PMS due soon"
                              : "PMS on schedule"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full border",
                          v.status === "available"
                            ? "bg-mint/60 text-brand border-brand/30"
                            : v.status === "maintenance"
                            ? "bg-accent/15 text-accent-dark border-accent/40"
                            : "bg-mint/50 text-brand border-brand/30"
                        )}
                      >
                        {v.status}
                      </span>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => setAssetVehicle(v)}
                          className="text-xs text-brand hover:underline inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" /> Asset Record
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setModal({ type: "vehicle", initial: v })}
                            className="text-taupe hover:text-brand p-1"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => del("Vehicle", v.id, v.plate_number)}
                            className="text-sand hover:text-red-500 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ))}

          {tab === "renewals" &&
            (renewals.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState icon={CalendarClock}>
                  Add vehicles and drivers to see PMS, registration, insurance, tire and license renewals
                </EmptyState>
              </div>
            ) : (
              <div className="md:col-span-2 space-y-3">
                {renewals.map((r) => (
                  <RenewalRow
                    key={r.key}
                    icon={r.icon}
                    title={r.title}
                    entity={r.entity}
                    detail={r.detail}
                    sub={r.sub}
                    status={r.status}
                    progress={r.progress}
                    onLogService={
                      r.onLogService ? () => setModal({ type: "service", presetPlate: r.onLogService }) : undefined
                    }
                  />
                ))}
              </div>
            ))}

          {tab === "services" &&
            (services.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState icon={Wrench}>No service logs yet</EmptyState>
              </div>
            ) : (
              services.map((s) => (
                <div key={s.id} className="bg-white rounded-3xl shadow-card p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm text-cocoa">
                      {s.vehicle_plate} — {s.service_type}
                    </p>
                    <p className="text-xs text-taupe mt-0.5">
                      {dayjs(s.service_date).format("MMM D, YYYY")} ·{" "}
                      {s.odometer_at_service ? `${Number(s.odometer_at_service).toLocaleString()} km` : "no ODO"}
                      {s.cost ? ` · ₱${Number(s.cost).toLocaleString()}` : ""}
                      {s.service_provider ? ` · ${s.service_provider}` : ""}
                    </p>
                    {s.next_service_km ? (
                      <p className="text-xs text-taupe">
                        Next: every {Number(s.next_service_km).toLocaleString()} km
                      </p>
                    ) : null}
                    {s.source === "ocr" && (
                      <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-mint/50 text-brand border-brand/30">
                        OCR · casa report attached
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => del("ServiceLog", s.id, `service log for ${s.vehicle_plate}`)}
                    className="text-sand hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ))}
        </div>
      )}

      {modal?.type === "driver" && (
        <DriverModal
          open
          onClose={() => setModal(null)}
          initial={modal.initial}
          onSaved={() => {
            setModal(null);
            toast({ title: "Driver saved" });
            load();
          }}
        />
      )}
      {modal?.type === "vehicle" && (
        <VehicleModal
          open
          onClose={() => setModal(null)}
          initial={modal.initial}
          onSaved={() => {
            setModal(null);
            toast({ title: "Vehicle saved" });
            load();
          }}
        />
      )}
      {modal?.type === "service" && (
        <ServiceModal
          open
          onClose={() => setModal(null)}
          vehicles={vehicles}
          presetPlate={modal.presetPlate}
          onSaved={() => {
            setModal(null);
            toast({ title: "Service saved to asset record" });
            load();
          }}
        />
      )}
      {assetVehicle && (
        <AssetRecordModal
          open
          onClose={() => setAssetVehicle(null)}
          vehicle={assetVehicle}
          services={services}
        />
      )}
    </div>
  );
}
