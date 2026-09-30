"""FleetFlow user menu-access matrix — one branded PDF.

Reads the LIVE role_permissions + feature_flags from Supabase (pass a valid
access token) and falls back to the shipped defaults when unavailable, so
the document always reflects the real access state.

Usage:
  python scripts/make_access_matrix_pdf.py <access_token> [out_file]
"""
import json
import sys
import urllib.request

from fpdf import FPDF

SB_URL = "https://yhdvfjkfzrgcrzstnpti.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZHZmamtmenJnY3J6c3RucHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NzU3OTMsImV4cCI6MjEwNTI1MTc5M30.G8_NovLqR8FEjG5xa-CbPZ-oQB3-Lu3tRvBfDA62LSM"

NAVY = (26, 43, 72)
ORANGE = (255, 107, 44)
MINT = (227, 239, 228)
CREAM = (250, 246, 239)
TAUPE = (138, 132, 122)
SAND = (233, 226, 214)

ROLES = ["Super Admin", "Admin", "Supervisor", "Driver", "Staff"]

# Menu/page access (the shipped 0029 matrix defaults; live data wins below)
MENU_ITEMS = [
    ("Missions (all bookings)", {"Super Admin", "Admin", "Supervisor", "Driver", "Staff"}),
    ("FO Dashboard", {"Super Admin", "Admin", "Supervisor", "Driver", "Staff"}),
    ("New Booking", {"Super Admin", "Admin", "Supervisor", "Driver", "Staff"}),
    ("History", {"Super Admin", "Admin", "Supervisor", "Driver", "Staff"}),
    ("QR Codes", {"Super Admin", "Admin", "Supervisor", "Driver", "Staff"}),
    ("Reports", {"Super Admin", "Admin", "Supervisor"}),
    ("Fleet (vehicles, drivers, renewals)", {"Super Admin", "Admin", "Supervisor"}),
    ("Fuel", {"Super Admin", "Admin", "Supervisor"}),
    ("Settings (users, branding, prefs)", {"Super Admin", "Admin"}),
    ("Clients (org management)", {"Super Admin"}),
    ("Console (platform hub)", {"Super Admin"}),
]

# Capability switches from the Master Permissions matrix → their menu effects
CAPABILITIES = [
    ("view_reports", "Reports builder access"),
    ("manage_settings", "Settings section access"),
    ("manage_fleet", "Fleet management (add/edit vehicles & drivers)"),
    ("manage_users", "User management (invite, disable, re-role)"),
]

# Platform Super Admin-only console pages
CONSOLE_ONLY = [
    "Console hub", "Clients", "Onboarding wizard", "Subscriptions",
    "Master Permissions", "R&D Lab", "Audit Logs", "System Usage",
    "Site Editor", "API Keys", "Platform Team",
]


def fetch_live(token):
    """Pull live matrix + flags; returns (matrix_rows, flags) or (None, None)."""
    try:
        def get(path):
            req = urllib.request.Request(
                f"{SB_URL}/rest/v1/{path}",
                headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read().decode())
        perms = get("role_permissions?select=role,capability,allowed")
        flags = get("feature_flags?select=key,label,enabled")
        return perms, flags
    except Exception as e:
        print(f"live fetch skipped: {e}")
        return None, None



def ascii_(s):
    """fpdf core fonts are latin-1: map the pretty chars, then hard-fallback."""
    s = (str(s).replace("—", "-").replace("–", "-")
         .replace("·", " - ").replace("●", "X")
         .replace("₱", "PHP ").replace("✓", "v")
         .replace("→", "->"))
    return s.encode("latin-1", "replace").decode("latin-1")

class PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("helvetica", "B", 9)
        self.set_text_color(*TAUPE)
        self.cell(0, 6, ascii_("FleetFlow — User Menu Access Matrix"), align="L")
        self.cell(0, 6, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")

    def footer(self):
        self.set_y(-14)
        self.set_font("helvetica", "I", 8)
        self.set_text_color(*TAUPE)
        self.cell(0, 8, ascii_("Generated from the live system · fleet.flowworkssystems.com"), align="C")


def build(perms, flags, out):
    pdf = PDF(orientation="P", unit="mm", format="A4")
    # Core-font latin-1 safety: route every text through ascii_()
    _cell, _multi = pdf.cell, pdf.multi_cell
    pdf.cell = lambda *a, **k: _cell(*[(ascii_(x) if isinstance(x, str) else x) for x in a], **k)
    pdf.multi_cell = lambda *a, **k: _multi(*[(ascii_(x) if isinstance(x, str) else x) for x in a], **k)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Title block
    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 0, 210, 34, "F")
    pdf.set_xy(14, 9)
    pdf.set_font("helvetica", "B", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 10, "FleetFlow")
    pdf.set_xy(14, 19)
    pdf.set_font("helvetica", "", 11)
    pdf.cell(0, 7, "User Menu Access Matrix — who sees what, at a glance")
    pdf.set_text_color(*ORANGE)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_xy(14, 27)
    pdf.cell(0, 6, "FLEET & TRANSPORT MANAGEMENT SYSTEM")

    pdf.set_y(42)
    pdf.set_font("helvetica", "I", 9)
    pdf.set_text_color(*TAUPE)
    pdf.cell(0, 5, "Reflects the live Master Permissions matrix (role_permissions) as of generation.", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    live_caps = {}
    if perms:
        for r in perms:
            live_caps.setdefault(r["capability"], {})[r["role"]] = r["allowed"]

    def cap_allowed(cap, role):
        m = live_caps.get(cap)
        if m is None:
            return role == "Super Admin"  # defaults: super always on
        return bool(m.get(role, False))

    # ---- Menu access table -------------------------------------------------
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 8, "1 · Menu & page access by role", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    col_w = 78
    role_w = (196 - col_w) / len(ROLES)
    pdf.set_font("helvetica", "B", 8.5)
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(col_w, 8, "Menu / Page", fill=True)
    for r in ROLES:
        pdf.cell(role_w, 8, r, align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 8.5)
    for i, (label, allowed) in enumerate(MENU_ITEMS):
        fill = CREAM if i % 2 == 0 else (255, 255, 255)
        pdf.set_fill_color(*fill)
        pdf.set_text_color(*NAVY if i % 2 == 0 else (75, 63, 51))
        pdf.cell(col_w, 7, label, fill=True)
        for r in ROLES:
            on = r in allowed
            pdf.set_text_color(*(26, 43, 72) if on else (200, 195, 188))
            pdf.cell(role_w, 7, "●" if on else "—", align="C", fill=True)
        pdf.ln()

    pdf.ln(3)
    pdf.set_font("helvetica", "I", 8.5)
    pdf.set_text_color(*TAUPE)
    pdf.multi_cell(0, 5,
        "● = menu visible and page accessible.  — = hidden from the navigation AND blocked at the URL.\n"
        "The matrix above is enforced by both the navigation and the route guards; changes made in\n"
        "Console → Master Permissions apply to users on their next app load.", new_x="LMARGIN", new_y="NEXT")

    # ---- Capability switches ----------------------------------------------
    pdf.add_page()
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 8, "2 · Capability switches (Master Permissions matrix)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.set_font("helvetica", "B", 8.5)
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(col_w, 8, "Capability", fill=True)
    for r in ROLES:
        pdf.cell(role_w, 8, r, align="C", fill=True)
    pdf.ln()

    pdf.set_font("helvetica", "", 8.5)
    for i, (cap, label) in enumerate(CAPABILITIES):
        fill = CREAM if i % 2 == 0 else (255, 255, 255)
        pdf.set_fill_color(*fill)
        pdf.set_text_color(*(75, 63, 51))
        pdf.cell(col_w, 7, label, fill=True)
        for r in ROLES:
            on = cap_allowed(cap, r)
            pdf.set_text_color(*(26, 43, 72) if on else (200, 195, 188))
            pdf.cell(role_w, 7, "●" if on else "—", align="C", fill=True)
        pdf.ln()

    pdf.ln(2)
    pdf.set_font("helvetica", "I", 8.5)
    pdf.set_text_color(*TAUPE)
    pdf.multi_cell(0, 5,
        "These switches tune UI access inside the database's security floor (RLS): the database\n"
        "always enforces organization isolation and the role checks, regardless of these toggles.\n"
        "Super Admin retains full access by design.", new_x="LMARGIN", new_y="NEXT")

    # ---- Platform-only pages ----------------------------------------------
    pdf.ln(4)
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 8, "3 · Platform-owner-only (Console) pages", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("helvetica", "", 9)
    pdf.set_text_color(*(75, 63, 51))
    pdf.multi_cell(0, 5.5,
        "   " + "   ·   ".join(CONSOLE_ONLY), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "I", 8.5)
    pdf.set_text_color(*TAUPE)
    pdf.multi_cell(0, 5,
        "\nReachable only by the platform owner / Super Admin. Client organizations never see these.", new_x="LMARGIN", new_y="NEXT")

    # ---- Feature flags -----------------------------------------------------
    if flags:
        pdf.ln(4)
        pdf.set_font("helvetica", "B", 13)
        pdf.set_text_color(*NAVY)
        pdf.cell(0, 8, "4 · Experimental features (R&D Lab flags)", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        for f in flags:
            state = "ON " if f.get("enabled") else "off"
            color = (26, 100, 60) if f.get("enabled") else TAUPE
            pdf.set_font("helvetica", "B", 9.5)
            pdf.set_text_color(*color)
            pdf.cell(14, 6, f"[{state}]")
            pdf.set_font("helvetica", "", 9.5)
            pdf.set_text_color(*(75, 63, 51))
            pdf.cell(0, 6, f.get("label", f["key"]), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "I", 8.5)
        pdf.set_text_color(*TAUPE)
        pdf.multi_cell(0, 5,
            "\nFlags can also be piloted per client organization (R&D Lab).", new_x="LMARGIN", new_y="NEXT")

    pdf.output(out)
    print(f"Saved {out}")


if __name__ == "__main__":
    token = sys.argv[1] if len(sys.argv) > 1 else ""
    out = sys.argv[2] if len(sys.argv) > 2 else "FleetFlow-Access-Matrix.pdf"
    perms, flags = (None, None)
    if token:
        perms, flags = fetch_live(token)
    build(perms, flags, out)
