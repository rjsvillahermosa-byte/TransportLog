# FleetFlow / TransportLog — Standalone Duplicate

A local, dependency-free-backend rebuild of **https://fleet-madison.base44.app**
("FleetFlow" / branded **TransportLog**) — an intelligent hotel transport management
system that automates mileage tracking, driver mission dispatch, and ODO verification
via AI-powered photo extraction.

Built as a faithful duplicate of the live app's UI, data model, and flows — with the
Base44 cloud replaced by a localStorage mock backend so it runs 100% offline.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173).

## Deploy — make it live

The repo is deploy-ready: `npm run build` → `dist/`, served by the zero-dependency
`server.js` (`npm start`, SPA fallback, respects `$PORT`).

**Spaceship / Shipmate (spaceship.run → shipmate.run)** — git-connected continuous
delivery; it builds the container for you (no Dockerfile needed):

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

Then connect the repo in the Shipmate dashboard — every push deploys automatically.

**Anywhere else (one command each):**
- Vercel: `npx vercel deploy --prod`
- Netlify: `npx netlify deploy --prod --dir=dist` (or drag `../fleetflow-dist.zip` into app.netlify.com/drop)
- Render/Railway/Fly: point at the repo, start command `npm start` (they run `npm install && npm run build` first)
- Any static host: upload `dist/` (zip at `../fleetflow-dist.zip`)

**Mobile:** responsive at 390px+ (audited page-by-page), installable as a PWA
(`manifest.webmanifest` + `logo.svg`, standalone display, brand-aware status bar via
`theme-color`), camera capture inputs (`capture="environment"`) for ODO/receipt/license photos.

## Brand theme (Settings → Brand Theme)

The admin can match the hotel/company palette at runtime: 8 presets (Deep Teal, Hotel
Blue, Ocean, Burgundy, Royal Purple, Forest, Sunset, Charcoal) or custom primary +
accent color pickers with live preview. Colors flow through CSS variables
(`src/lib/theme.js`), so buttons, nav, chips, status colors, the route map, charts and
the phone status bar all follow — persisted per device in localStorage.

**Demo login:** `demo@fleetflow.local` / `demo1234` — or click **Continue with Google**
(simulated). All data is seeded on first boot and lives in your browser only.

## Theme

Skinned in the warm car-sharing design language (owner's reference board): **cream `#FAF3E7`
canvas with organic mint `#CFE3D6` blobs, deep teal `#1E7A5A` primary (uppercase Poppins
buttons, active nav, brand), golden `#F2B705` accents (pending / due-soon states), burnt orange
`#B4552D` tertiary (errands, department chart), chocolate `#2E2218` headings with taupe body
text, and white cards at ~24px radius with soft shadows — no borders.** The palette and fonts
live in `tailwind.config.js` (cream / sand / mint / mintdark / teal / gold / orange / cocoa /
mocha / taupe) and the blob backdrop in `src/index.css`. The original live app's slate/blue
system is documented in `../_fleetflow-research/RESEARCH.md`.

## What's duplicated (page by page)

| Route | Original behaviour reproduced |
|---|---|
| `/login` `/register` `/forgot-password` `/reset-password` | "Welcome back" card, Continue with Google, email+password auth |
| `/` Missions | Welcome header, Active/Pending stat pills, Today/This Week/This Month/All filters, mission cards, delete with `Delete booking for {guest}?` confirm, "Pickup in 30 Minutes" notifications |
| `/mission/:id` | **The signature flow**: camera ODO capture (`capture="environment"`), simulated AI odometer extraction ("Reading odometer..."), manual fallback offline, Start/End Mission lifecycle, GPS route recording (`watchPosition`), route trace, remarks, auto distance = end − start |
| `/fo-dashboard` | From/To range, Total Mileage / Active Now / Completed / Pending, "Daily Mileage — Last 14 Days" bar chart, Vehicle Usage chart, Bookings by Type |
| `/fleet` | Drivers / Vehicles / **PMS Schedule** / Service Logs tabs, Add/Edit/Del modals, per-vehicle **Asset Records** with full service history, **OCR Casa Report capture**, Clear All Vehicles |
| `/fuel` | **Company fuel expense summary** (total spend, liters, avg ₱/L, cost per km, 6-month spend trend, expense share by vehicle) + **per-vehicle breakdown** (integrity score, consumption trend, flags with evidence, fill history, full-to-full segments) |
| `/new-booking` | **Guest Booking or Department Errand mode** (Owner, Marketing, Operations Manager, Purchasing, …) — errands run the same ODO + GPS mission workflow; Guest Information / Trip Details / Assignment sections, 6-digit `mission_id`, FO email notification |
| `/history` | Completed-only, From/To filter, distance totals, Export PDF (print) |
| `/qr-codes` | "Book a Reservation" + "Driver Dashboard" cards via api.qrserver.com, Copy Link |
| `/settings` | **Admin-only area** (role-gated by login, so it works the same on mobile): **User Accounts** enrollment with the same quick modal flow as vehicle registration (blank password = auto-generated, Admin/Staff roles, disable instead of delete), sync status, fuel price bands, Danger Zone → "Reset All Transport Data" (keeps Drivers & Vehicles) |

Plus the **offline engine**: offline mission actions are queued
(`create_mileage_log` / `update_request` — the same action shapes as the original),
show "Saved offline. Will sync when back online.", and drain automatically on reconnect,
with a header sync indicator.

## Beyond the original: Fuel, PMS, OCR & Errands

These four systems extend the duplicated app (the live Base44 app doesn't have them yet):

**1. Fuel consumption & fraud detection** (`src/lib/fuel.js`)
Consumption is computed **full-tank-to-full-tank** (partials accumulate into the next full
fill) — the industry-honest method. Every fill is audited by seven explainable rules, and
every flag shows its numbers:

| Rule | Severity | Catches |
|---|---|---|
| Tank capacity | red | "Ghost fills" — more liters than the tank holds |
| Odometer sequence | red | Fill logged at a lower odometer than the previous |
| Impossible efficiency | red | km/L above the plausible ceiling (inflated liters / ODO lie) |
| Abnormal thirst | red | km/L below the floor (underfilled receipt, siphoning, leak) |
| Market ₱/L band | amber | Receipt price outside the configurable pump band |
| Statistical outlier | amber | km/L ≥ 2σ from this vehicle's own clean history |
| Unaccounted km | amber | Odometer gap far beyond verified mission km (personal use) |

Each vehicle gets a 0–100 **integrity score**; the Fuel page opens with a **company expense
summary** (total spend, liters, avg price paid, cost per km, 6-month monthly trend,
expense share by vehicle) and drills down to per-vehicle fill history, full-to-full
segments, trend chart and flags. Price bands follow DOE/GasWatch PH Metro Manila averages
and are editable in Settings.

**2. PMS + Renewals & compliance** (`src/lib/pms.js`)
Each vehicle carries a km/month PMS interval — auto-recommended from the model (casa-standard
templates) or manual — due **whichever comes first**, with the live odometer stream as the km
basis. The Fleet → **Renewals** board is the one command center for everything that expires:

| Item | Basis | Entry point |
|---|---|---|
| PMS / change oil | km **or** months, whichever first | interval from model; logs via service |
| Registration (OR/CR) | date (due-soon at 60 days) | **OR/CR photo OCR** in the vehicle form |
| Insurance | date | **policy photo OCR** in the vehicle form |
| Tire wear | odometer (due-soon at 85% of life) | tire life + last change; **auto-resets when a "Tire Replacement" service is logged** |
| Driver's license | date | **license card photo OCR** in the driver form |

Overdue/due-soon items raise a toast on Fleet load, a ⚠ count on the Renewals tab, status chips
on driver and vehicle cards, and stay sorted urgent-first on the board.

**3. Document OCR** (Fleet → Log Service / vehicle & driver forms)
The same capture → `InvokeLLM` pipeline handles four documents: the casa/dealer **service
report** (date, odometer, type, casa, cost, next-service, parts, recommendations → Asset
Record), the **driver's license card** (name, number, expiry), the **LTO OR/CR** and the
**insurance policy** (expiry dates). Extracted fields prefill the forms and the document
photos are kept on the records.

**4. Department Errands**
New Booking has a Guest / Department Errand toggle. Errands (Owner, Marketing, Operations
Manager, Purchasing, Finance, HR, …) run the identical workflow — ODO capture, GPS route,
mileage, completion — and roll up into a **Department Errand Mileage** chart on the FO
Dashboard for internal chargeback.

**5. Roles & user management**
Accounts carry a role — **Admin** (you) or **Staff**. Settings is the admin's area: the nav
item is hidden from Staff and `/settings` shows an "Admin access only" lock screen for them,
on any device, because the gate is the login — not the device. Admins enroll the team from
Settings → User Accounts (blank password auto-generates one; accounts can be disabled
instead of deleted; the last active admin can never be deleted). Self-service signups from
the Register page always start as Staff.

**6. Cute AI driver avatars** (`src/lib/avatar.js`)
Every driver gets a round, cartoon-style avatar **generated from their own license photo** —
a genuine client-side stylization pipeline (left-third portrait crop → box-blur smoothing →
6-level posterization → saturation + warm lift → Sobel outlines in theme cocoa). It
auto-generates when a license photo is captured (with a "Regenerate" option), persists on
the driver record, and renders on driver cards with a mint ring; drivers without photos
fall back to initials in a mint circle. Swap `generateCuteAvatar` for a real image-to-image
endpoint (e.g., an LLM/img2img API) for production-quality cuteness — the wiring stays the same.

## Data model (same entities as the Base44 app)

- **TransportRequest** — guest_name, requester_type (Guest \| Errand), requested_by, department, pax_count, booking_type (Drop-off / Airport Pick-up / Special Request / Other / Errand), pickup_location, destination, schedule_date, schedule_time, assigned_driver_id/name, vehicle_id/plate, special_notes, status (Pending → In Progress → Completed), mission_id
- **MileageLog** — request_id, mission_id, driver, vehicle_plate, time_out/time_in, start/end_odometer, odo photos, distance, remarks, route_coordinates, status
- **Driver** — full_name, employee_id, contact_number, email, license_number, license_expiry, assigned_vehicle_plate, status, notes
- **Vehicle** — plate_number, unit_name, **model**, status, fuel_type, tank_liters, rated_km_per_liter, **pms_interval_km, pms_interval_months**
- **ServiceLog** — vehicle_plate, service_type, service_date, odometer_at_service, next_service_km/date, service_provider/casa, cost, notes, **source (ocr \| manual), report_photo, parts, recommendations**
- **FuelLog** — vehicle_plate, fill_date, odometer, liters, cost, full_tank, station, receipt_photo, encoded_by

## Deliberate substitutions (cloud → local)

| Original (Base44) | Duplicate |
|---|---|
| `entities.*` REST API | localStorage mock in `src/lib/db.js` with the same `list/filter/get/create/update/delete/deleteMany` surface |
| `auth` (Google OAuth, email) | local accounts; Google button simulates the OAuth success path |
| `Core.InvokeLLM` ODO extraction | simulated reading after a realistic delay (swap `integrations.Core.InvokeLLM` in `src/lib/db.js` for a real endpoint to go live) |
| `Core.UploadFile` | downscaled JPEG data URLs |
| `Core.SendEmail` FO notifications | console log + toast |
| Leaflet/OpenStreetMap route map | SVG polyline trace (zero network deps) |

## Stack

React 18 · Vite · Tailwind CSS · React Router · lucide-react · Recharts · dayjs — the
same library set the original Base44 app compiles to.
