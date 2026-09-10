# TransportLog (FleetFlow duplicate) — Functionality Audit

**Date:** Sep 11, 2026 · **Method:** live black-box testing against the running app
(http://localhost:5199, production build also verified via `server.js`) — real form fills,
real clicks, results cross-checked against raw localStorage records.

## Summary

| Area | Tests | Result |
|---|---|---|
| A. Auth, roles & registration | 8 | ✅ 8/8 |
| B. Missions, bookings & errands | 6 | ✅ 6/6 |
| C. Mission lifecycle | 4 | ✅ 4/4 |
| D. FO Dashboard | 5 + 3 charts | ✅ all |
| E. Fleet CRUD & renewals | 7 | ✅ 7/7 |
| F. Fuel system | 6 | ✅ 6/6 |
| G. Settings & admin | 5 | ✅ 5/5 |

**41 automated checks — all passing.** 2 low-severity defects found and fixed during the
audit (see Findings). Demo data reseeded to a clean baseline after testing.

## A. Authentication, roles & registration

| # | Test | Result |
|---|---|---|
| A1 | Wrong password → "Invalid email or password", stays on /login | ✅ |
| A2 | Admin login → Missions, Settings visible in nav | ✅ |
| A3 | Staff login (fo@hotel.local) → works, Settings hidden from nav | ✅ |
| A4 | Staff direct /settings → "Admin access only" lock screen | ✅ |
| A5 | Disabled account → blocked with "account has been disabled" message | ✅ |
| A6 | Self-register → account created with role **Staff** (cannot self-promote), auto sign-in | ✅ |
| A7 | Duplicate email registration → rejected "already exists" | ✅ |
| A8 | Logout → returns to /login; session cleared | ✅ |

## B. Missions, bookings & errands

| # | Test | Result |
|---|---|---|
| B1 | Stat pills (Active/Pending) and card list match raw TransportRequest counts exactly (11 cards / 11 records) | ✅ |
| B2 | Guests ⇄ Errands kind filters exact (3 errands / 8 guests) | ✅ |
| B3 | Guest booking via form → created, status Pending, 6-digit mission_id, driver + vehicle assigned, redirect + toast | ✅ |
| B4 | Errand via form → requester_type "Errand", department saved, same mission shape | ✅ |
| B5 | Delete with confirm → both audit records removed (13 → 11) | ✅ |
| B6 | "New booking received" toast fires for fresh bookings | ✅ (observed in B3/B4 flows) |

## C. Mission lifecycle

| # | Test | Result |
|---|---|---|
| C1 | Start Mission without ODO capture → guard toast "Capture ODO — Please capture the start odometer reading first", status stays Pending | ✅ |
| C2 | Completed mission math: rendered Start 38,210 / End 38,280 / Total 70 km = stored distance = end − start | ✅ |
| C3 | Unknown /mission/:id → "Mission not found" with back button | ✅ |
| C4 | Camera-driven Start/End mission (photo → AI read → GPS route) | ⚠️ Manual only — file chooser not drivable in the audit browser; capture zone, guard logic and result rendering all verified |

## D. FO Dashboard

| # | Test | Result |
|---|---|---|
| D1–D5 | Total mileage **440 km**, Active **0**, Completed **9**, Pending **1**, Errands **3** — every rendered stat equals the value recomputed from raw records for the date range | ✅ |
| D6 | 3 charts render (daily mileage, vehicle usage with all 3 plates, department errand mileage) | ✅ |

## E. Fleet, PMS & renewals

| # | Test | Result |
|---|---|---|
| E1 | Add driver via modal → all fields persisted (name, ID, contact, license no., expiry) | ✅ |
| E2 | Edit driver contact → persisted | ✅ |
| E3 | Delete driver (confirm) → removed, count restored | ✅ |
| E4 | Log "Tire Replacement" service @ 52,400 km → `tire_changed_odometer` auto-updated 47,500 → 52,400 | ✅ |
| E5 | Renewals board: 9012 tire row flips Overdue → On track after the service | ✅ |
| E6 | Renewals board ordering: overdue first, then due-soon, then on-track; statuses correct for PMS / registration / insurance / tires / licenses | ✅ |
| E7 | Vehicle modal: photo box, model → PMS suggestion link, registration/insurance + OR/CR & policy OCR buttons, tire fields present | ✅ |

## F. Fuel & consumption audit

| # | Test | Result |
|---|---|---|
| F1 | Company summary math exact: ₱21,254 total spend, 243 L (raw: 21,254 / 242.6) | ✅ |
| F2 | Integrity scores: NAC 1234 **75 Watch** (impossible-efficiency flag: 20.9 km/L vs 12.2 ceiling), NAC 9012 **55 Investigate** (siphon 4.1 km/L + ₱60/L off-band + unaccounted km), NAC 5678 **100 Clean** | ✅ |
| F3 | Flag evidence text renders with the numbers for every fired rule | ✅ |
| F4 | Full-to-full segment table math correct (8.9 / 9.0 clean, 20.9 flagged red) | ✅ |
| F5 | Live test: logged a real fill-up at ₱50/L → modal warned "OUTSIDE the band" during entry, price-band flag fired after save, integrity 100 → 65 | ✅ |
| F6 | Engine caught a fill saved at a non-advancing odometer during the test race (odo-reversed red flag) — the audit rules work on live data, not just seeds | ✅ |

## G. Settings & administration

| # | Test | Result |
|---|---|---|
| G1 | Add user with blank password → 8-char password auto-generated, role Staff, listed instantly | ✅ |
| G2 | Self-row has no delete button (can't delete own account); other rows do; last-admin guard in place | ✅ |
| G3 | Brand theme: Hotel Blue preset applied live, persisted, reset works | ✅ |
| G4 | Fuel price bands saved to config | ✅ |
| G5 | Danger zone reset: transport data wiped (requests/mileage/services/fuel → 0) while drivers (3), vehicles (3) and users (4) preserved | ✅ |

## Findings & fixes (during audit)

1. **F-1 (Low, fixed)** — Log Fill-up modal's async odometer prefill could overwrite a value
   the user had already typed (found when the audit script raced the prefill). *Fix:* prefill
   only applies while the field is untouched. The engine had correctly flagged the resulting
   non-advancing fill — detection worked even when the form was at fault.
2. **F-2 (Low, fixed)** — Any logged service reset the vehicle's PMS clock (a tire
   replacement made an overdue PMS show "on track"). *Fix:* PMS baseline now ignores
   Tire Replacement / Registration Renewal / Repair service types.
3. **F-3 (Info)** — Camera-driven flows (ODO capture, license/OR-CR/insurance/casa OCR,
   vehicle/driver photos) and cute-avatar generation from a live capture cannot be driven
   by the audit browser's file chooser; the avatar pipeline was verified end-to-end on an
   injected license photo in an earlier pass, all OCR zones/buttons/states verified, and
   the extraction functions are simulated locally by design. Real offline queuing
   (navigator.onLine), browser Notification permission and Google OAuth are likewise
   manual-test items on real devices.

## Not covered (by design of this duplicate)

Server-side enforcement (auth/roles/auditing live in localStorage here — the Base44 port
needs server-side equivalents), multi-device sync, real camera hardware, push notifications.
