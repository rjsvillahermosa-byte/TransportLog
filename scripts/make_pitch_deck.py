"""FleetFlow client pitch deck — brand navy/orange, 11 slides."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

NAVY = RGBColor(0x1A, 0x2B, 0x48)
ORANGE = RGBColor(0xFF, 0x6B, 0x2C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
CREAM = RGBColor(0xFA, 0xF6, 0xEF)
MINT = RGBColor(0xE3, 0xEF, 0xE4)
TAUPE = RGBColor(0x8A, 0x84, 0x7A)
COFFEE = RGBColor(0x4B, 0x3F, 0x33)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]

def add_slide():
    return prs.slides.add_slide(BLANK)

def bg(slide, color):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = color

def box(slide, x, y, w, h):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.text_frame.word_wrap = True
    return tb.text_frame

def set_text(tf, text, size, color, bold=False, align=PP_ALIGN.LEFT):
    tf.text = text
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.runs[0]
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.name = "Inter"
    return p

def para(tf, text, size, color, bold=False, space_before=6, bullet=False):
    p = tf.add_paragraph()
    p.text = ("•  " + text) if bullet else text
    p.space_before = Pt(space_before)
    for r in p.runs:
        r.font.size = Pt(size)
        r.font.color.rgb = color
        r.font.bold = bold
        r.font.name = "Inter"
    return p

def accent_bar(slide, x=0.9, y=1.55, w=1.4):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.07))
    sh.fill.solid()
    sh.fill.fore_color.rgb = ORANGE
    sh.line.fill.background()

# ---------- 1 · Title ----------
s = add_slide(); bg(s, NAVY)
tf = box(s, 1.0, 2.2, 11.3, 1.2)
set_text(tf, "FleetFlow", 60, WHITE, bold=True)
tf2 = box(s, 1.0, 3.35, 11.3, 0.9)
set_text(tf2, "Every trip logged. Every kilometer verified.", 26, ORANGE, bold=True)
tf3 = box(s, 1.0, 4.25, 11.3, 0.8)
set_text(tf3, "A Fleet & Transport Management System for hotels and fleets — bookings, drivers, vehicles, fuel and mileage in one place.", 16, WHITE)
tf4 = box(s, 1.0, 6.6, 11.3, 0.4)
set_text(tf4, "fleet.flowworkssystems.com", 12, TAUPE)

# ---------- 2 · The problem ----------
s = add_slide(); bg(s, CREAM)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "Running transport on paper costs more than paper", 34, NAVY, bold=True)
accent_bar(s)
items = [
    ("The logbook", "Handwritten trips, unreadable plates, no history when you need it."),
    ("The spreadsheet", "Always a week behind, kept by the one person who never takes a day off."),
    ("The group chat", "Assignments lost between messages; nobody knows who is driving what."),
    ("The fuel receipts", "A shoebox of crumpled slips — and fuel is quietly the second-biggest expense."),
]
y = 2.1
for t, b in items:
    tf = box(s, 1.0, y, 11.3, 1.0)
    set_text(tf, t, 18, COFFEE, bold=True)
    para(tf, b, 14, TAUPE, space_before=2)
    y += 1.22

# ---------- 3 · What FleetFlow is ----------
s = add_slide(); bg(s, WHITE)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "One system for the whole motor pool", 34, NAVY, bold=True)
accent_bar(s)
features = [
    ("Bookings & dispatch", "Guest transfers and errands logged in seconds; assign driver + vehicle; follow every mission live."),
    ("Photo-verified mileage", "Odometer photo before and after every trip — distance on record, not on memory. AI reads the number."),
    ("Vehicle QR identity", "A QR in every vehicle: driver scans, runs the pre-mission checklist, and the mission binds to that exact vehicle."),
    ("Fuel integrity audit", "Ghost fills, siphoning, impossible efficiency — the audit flags what doesn't add up, with the receipt photo on file."),
    ("Renewals board", "Registration, insurance and license expiries flagged before they become violations."),
    ("Reports & analytics", "Per-department mileage, fuel summaries, print-ready or PDF in one click."),
]
cols = [(1.0, 2.2), (5.15, 2.2), (9.3, 2.2)]
for i, (t, b) in enumerate(features):
    x, y = cols[i % 3][0], 2.0 + (i // 3) * 2.35
    tf = box(s, x, y, 3.6, 2.1)
    set_text(tf, t, 16, NAVY, bold=True)
    para(tf, b, 12.5, TAUPE, space_before=3)

# ---------- 4 · How it works ----------
s = add_slide(); bg(s, CREAM)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "From booking to report in three steps", 34, NAVY, bold=True)
accent_bar(s)
steps = [
    ("1", "Book the trip", "Front desk creates the booking — or the guest scans the QR at the desk. Pickup, destination, schedule."),
    ("2", "Drive & verify", "Driver scans the vehicle QR, completes the safety checklist, snaps the odometer. Mission starts. Repeats at drop-off."),
    ("3", "Review & report", "Supervisors see mileage, fuel and completed missions live; month-end reports are one click, not one weekend."),
]
x = 1.0
for n, t, b in steps:
    from pptx.enum.shapes import MSO_SHAPE
    circ = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(2.1), Inches(0.75), Inches(0.75))
    circ.fill.solid(); circ.fill.fore_color.rgb = NAVY; circ.line.fill.background()
    set_text(circ.text_frame, n, 22, WHITE, bold=True, align=PP_ALIGN.CENTER)
    tf = box(s, x - 0.1, 3.1, 3.9, 2.6)
    set_text(tf, t, 18, COFFEE, bold=True)
    para(tf, b, 13, TAUPE, space_before=4)
    x += 4.1

# ---------- 5 · Fuel integrity ----------
s = add_slide(); bg(s, NAVY)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "The photo doesn't lie", 34, WHITE, bold=True)
tf0 = box(s, 0.9, 1.45, 11.5, 0.6)
set_text(tf0, "Every fill-up is cross-checked against the odometer and the tank itself.", 15, WHITE)
flags = [
    ("Ghost fill", "More liters than the tank holds — the receipt doesn't match the vehicle."),
    ("Abnormal thirst", "Consumption suddenly spikes: underfilled receipt, siphoning, or a leak."),
    ("Impossible efficiency", "Inflated liters or odometer mismatch — the numbers can't all be true."),
    ("Odometer did not advance", "No kilometers since the last fill — yet fuel was consumed."),
]
x = 1.0
for t, b in flags:
    tf = box(s, x, 2.6, 2.75, 2.6)
    set_text(tf, t, 15, ORANGE, bold=True)
    para(tf, b, 12, WHITE, space_before=4)
    x += 2.95
tf = box(s, 1.0, 5.9, 11.0, 0.8)
set_text(tf, "Fuel is the expense nobody audits — until the numbers are already on your side.", 14, WHITE)

# ---------- 6 · Roles ----------
s = add_slide(); bg(s, WHITE)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "The right access for every person", 34, NAVY, bold=True)
accent_bar(s)
roles = [
    ("Staff", "Creates bookings, follows status."),
    ("Driver", "Sees only their missions; starts/ends with odometer photos."),
    ("Supervisor", "Missions, fleet, renewals, report builder."),
    ("Admin", "Users, vehicles, company settings."),
    ("You (Super Admin)", "Everything — including audit logs and other admins."),
]
y = 2.1
for t, b in roles:
    tf = box(s, 1.0, y, 11.3, 0.9)
    set_text(tf, t, 17, NAVY, bold=True)
    para(tf, b, 13.5, TAUPE, space_before=2)
    y += 0.95

# ---------- 7 · Data isolation (the privacy slide) ----------
s = add_slide(); bg(s, CREAM)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "Your data is yours. provably.", 34, NAVY, bold=True)
accent_bar(s)
points = [
    "Every record belongs to one organization — separated at the DATABASE level, not hidden in the menu.",
    "Row-level security: even a direct API request cannot read another company's bookings, drivers or staff directory.",
    "Every sensitive change is audit-logged: who changed what, when, old value → new value. Tamper-proof by design.",
    "Staff of Client A physically cannot see Client B — the same guarantee we'd want for your guests' names.",
]
y = 2.2
for p_ in points:
    tf = box(s, 1.0, y, 11.3, 0.9)
    set_text(tf, "✓  " + p_, 15.5, COFFEE)
    y += 1.0

# ---------- 8 · Pricing ----------
s = add_slide(); bg(s, WHITE)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "Pricing that scales with your fleet", 34, NAVY, bold=True)
accent_bar(s)
plans = [
    ("Trial", "Free · 14 days", "2 vehicles · 3 seats\nFull booking engine", False),
    ("Starter", "PHP 1,500 / mo", "5 vehicles · 8 seats\nDrivers, renewals, reports", False),
    ("Pro", "PHP 3,500 / mo", "20 vehicles · 25 seats\nFuel audit + AI odometer + presets", True),
    ("Enterprise", "Custom", "100+ vehicles · API access\nMulti-org, onboarding kit", False),
]
x = 1.0
for name, price, incs, hot in plans:
    from pptx.enum.shapes import MSO_SHAPE
    card = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(2.0), Inches(2.75), Inches(4.1))
    card.fill.solid()
    card.fill.fore_color.rgb = NAVY if hot else CREAM
    card.line.fill.background()
    tf = card.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.2); tf.margin_top = Inches(0.25)
    set_text(tf, name, 19, WHITE if hot else NAVY, bold=True, align=PP_ALIGN.CENTER)
    para(tf, price, 14, ORANGE if hot else COFFEE, bold=True, space_before=6)
    for line in incs.split("\n"):
        para(tf, line, 11.5, WHITE if hot else TAUPE, space_before=8)
    if hot:
        para(tf, "MOST POPULAR", 9.5, ORANGE, bold=True, space_before=12)
    x += 2.95
tf = box(s, 1.0, 6.5, 11.3, 0.5)
set_text(tf, "Annual and quarterly billing available. Upgrade the day you need to — limits are adjustable per client.", 13, TAUPE)

# ---------- 9 · What your team gets ----------
s = add_slide(); bg(s, CREAM)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "Everything included, every plan", 34, NAVY, bold=True)
accent_bar(s)
incs = [
    "Mobile app for drivers — works offline, syncs when connected",
    "QR booking codes for the front desk",
    "Onboarding kit: your team enrolled from one spreadsheet",
    "Your brand: logo and colors on the dashboard and reports",
    "Audit logs of every sensitive change",
    "Data isolation between clients at the database level",
    "Free data migration from your logbook/spreadsheet",
    "Filipino-English support, in your timezone",
]
y = 2.1
for i, p_ in enumerate(incs):
    x = 1.0 if i % 2 == 0 else 6.9
    tf = box(s, x, 2.1 + (i // 2) * 1.05, 5.6, 0.95)
    set_text(tf, "✓  " + p_, 14.5, COFFEE)

# ---------- 10 · Why now ----------
s = add_slide(); bg(s, WHITE)
tf = box(s, 0.9, 0.7, 11.5, 0.8)
set_text(tf, "Why hotels switch — and stay", 34, NAVY, bold=True)
accent_bar(s)
stats = [
    ("Same-day", "Your whole fleet, vehicles and team onboarded in one afternoon — from paper to live."),
    ("Zero IT", "Nothing to install on your servers. Browser + a phone app. Updates are automatic."),
    ("Yours alone", "Your org's data walled at the database level; guests' names never leave your space."),
    ("Grows with you", "Start at 5 vehicles. The same system runs 100+, multi-property, with API integration."),
]
y = 2.0
for t, b in stats:
    tf = box(s, 1.0, y, 11.3, 1.0)
    set_text(tf, t, 18, NAVY, bold=True)
    para(tf, b, 14, TAUPE, space_before=2)
    y += 1.15

# ---------- 11 · CTA ----------
s = add_slide(); bg(s, NAVY)
tf = box(s, 1.0, 2.3, 11.3, 0.9)
set_text(tf, "Ready in one afternoon.", 40, WHITE, bold=True, align=PP_ALIGN.CENTER)
tf2 = box(s, 1.0, 3.3, 11.3, 0.8)
set_text(tf2, "We'll onboard your team, enroll your vehicles, and print your QR codes — before your next guest arrives.", 16, WHITE, align=PP_ALIGN.CENTER)
tf3 = box(s, 1.0, 4.7, 11.3, 0.6)
set_text(tf3, "Start free:  fleet.flowworkssystems.com/register", 18, ORANGE, bold=True, align=PP_ALIGN.CENTER)
tf4 = box(s, 1.0, 6.5, 11.3, 0.5)
set_text(tf4, "FleetFlow — Fleet & Transport Management System", 12, TAUPE, align=PP_ALIGN.CENTER)

prs.save("FleetFlow-Client-Pitch.pptx")
print("Saved FleetFlow-Client-Pitch.pptx with", len(prs.slides.__iter__.__self__._sldIdLst), "slides")
