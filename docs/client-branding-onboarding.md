# Branding a new client (white-label logo)

Every client organization can show its own logo on the login page and in its
own in-app header, independent of every other client. This is backed by
`organizations.logo_url` (migration `0036_org_logo.sql`) — not the old
Branding Studio (`src/lib/branding.js`), which is device-local and
platform-wide, not per-client.

## One-time setup (already done)

Migration `0036_org_logo.sql` added:
- `organizations.logo_url`
- `lookup_client_code()` now also returns `logo_url` (safe — public, no PII)
- A platform-owner escape hatch on the `fleetflow-media` storage write/update
  policies, so the Clients page can upload into any org's folder

Nothing below needs this repeated — it's a one-time DB change.

## Steps for each new client

1. **Get their logo file** — PNG or SVG, ideally square, transparent
   background if they have one. No strict size requirement; the UI displays
   it at 36–56px in the header and ~56px on login, so anything reasonably
   sized works.

2. **Upload it**: Console → Clients page → find the client's row → click the
   small logo thumbnail in the leftmost column → pick the file. It uploads to
   `fleetflow-media` storage under `uploads/<org-id>/logo.<ext>` and saves the
   public URL to that org's `logo_url` automatically. A "remove" link appears
   under the thumbnail once a logo is set, to revert to the default mark.

3. **Tell the client their company code** (shown in the same row, e.g.
   `MAD-001`) if they don't already have it — that's also what new staff use
   to join the org at Register. On the login page, typing that code into the
   "Company code (optional)" field at the top resolves their name + logo live
   and remembers it in that browser (`localStorage`) so it auto-fills next
   time. It's optional — anyone who skips it just sees the generic FleetFlow
   mark and still logs in normally with email/password.

4. **Nothing else to do.** Once any of that org's members are signed in, the
   in-app header automatically shows their org's logo instead of the generic
   one — no separate step, it reads the same `logo_url`.

## Notes

- The company-code field is a convenience lookup only, not an auth boundary —
  it never grants access to anything; it just decides which logo/name to
  *show* before the real email+password (or Google) sign-in happens.
- If a client wants to remove their white-label branding, the "remove" link
  on the Clients page clears `logo_url`; both surfaces fall back to the
  default FleetFlow mark immediately.
- A client with no logo set still works exactly as before this feature
  existed — nothing is required to onboard a client without white-labeling.
