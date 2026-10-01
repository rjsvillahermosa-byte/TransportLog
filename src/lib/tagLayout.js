// Tag Editor — pure geometry & data layer. No React, no DOM.
// ---------------------------------------------------------------------------
// Ported from the TFE Tag Editor architecture (see the reference doc this
// was built from): a tag is DATA, not markup — one plain object describing
// every field's position/size/style in INCHES. TagView (the renderer)
// reads this same object at whatever pixel scale the moment calls for —
// editable canvas, A4 sheet preview, or print — so the print output can
// never drift from what's on screen; it's literally the same draw call.
//
// A "record" is a flat {key: value} map — one real vehicle, or the sample
// used while nothing's loaded yet. Text fields hold templates like
// "{plate_number}" or "{model} · {unit_name}"; filling them in is a pure
// string function (fillTokens below), not a template engine.
// ---------------------------------------------------------------------------

/** @typedef {'text'|'image'|'qr'} FieldType */

/**
 * @typedef TagField
 * @property {string} id
 * @property {string} key
 * @property {FieldType} type
 * @property {string} label
 * @property {string} value       // template string, e.g. "{plate_number}" or literal text
 * @property {number} x           // inches, from the tag's top-left
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} [fontSize]  // points
 * @property {number} [fontWeight]
 * @property {string} [color]
 * @property {'left'|'center'|'right'} [align]
 * @property {boolean} visible
 * @property {string} [flow]      // fields sharing a flow group repack with no gaps when one hides
 * @property {boolean} [lockSquare] // qr/image: resize keeps w === h
 * @property {number} [quiet]     // qr-only: quiet zone, 0-1 fraction of w
 */

/** @typedef {{ name: string, w: number, h: number, style: object, fields: TagField[] }} TagLayout */
/** @typedef {Record<string, string>} TagRecord */

export const GRID_IN = 0.02; // snap grid, inches
export const HISTORY_LIMIT = 60;
export const COALESCE_WINDOW_MS = 900;
export const MIN_QR_IN = 0.8; // below this, a shrink is a scannability risk

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Replace {token} with record[token]. If EVERY token in the string is empty,
 *  the whole string renders as "" — an optional line like a serial number
 *  just vanishes instead of printing "S/N " with nothing after it. */
export function fillTokens(template, record) {
  if (!template) return "";
  const tokens = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (tokens.length === 0) return template;
  const allEmpty = tokens.every((t) => !record?.[t]);
  if (allEmpty) return "";
  return template.replace(/\{(\w+)\}/g, (_, t) => record?.[t] ?? "");
}

/** QR value is itself a template: "https://host/v/:id" — :id is the
 *  record's id (URL-encoded), then any other {tokens} are filled too. */
export function resolveQr(template, record) {
  if (!template) return "";
  const withId = template.replace(":id", encodeURIComponent(record?.id ?? ""));
  return fillTokens(withId, record);
}

// ---------------------------------------------------------------------------
// Geometry — drag/resize/snap, all in inches
// ---------------------------------------------------------------------------

export function snapTo(value, grid = GRID_IN) {
  return Math.round(value / grid) * grid;
}

export function moveBox(box, dx, dy) {
  return { ...box, x: snapTo(box.x + dx), y: snapTo(box.y + dy) };
}

/** 8-handle resize. `handle` is one of n/s/e/w/ne/nw/se/sw.
 *  `square: true` (qr/image) anchors the opposite corner/edge and forces w === h. */
export function resizeBox(box, handle, dx, dy, { square = false, minW = 0.2, minH = 0.2 } = {}) {
  let { x, y, w, h } = box;
  const right = x + w;
  const bottom = y + h;

  if (handle.includes("e")) w = Math.max(minW, w + dx);
  if (handle.includes("s")) h = Math.max(minH, h + dy);
  if (handle.includes("w")) {
    const nw = Math.max(minW, w - dx);
    x = right - nw;
    w = nw;
  }
  if (handle.includes("n")) {
    const nh = Math.max(minH, h - dy);
    y = bottom - nh;
    h = nh;
  }

  if (square) {
    const size = Math.max(w, h);
    if (handle.includes("w")) x = right - size;
    if (handle.includes("n")) y = bottom - size;
    w = size;
    h = size;
  }

  return { ...box, x: snapTo(x), y: snapTo(y), w: snapTo(w), h: snapTo(h) };
}

/** Scale every field's box + font size by the same factor, keeping qr/image
 *  fields centred and square — used when switching size presets. */
export function scaleLayout(layout, factor) {
  const cx = layout.w / 2;
  const cy = layout.h / 2;
  return {
    ...layout,
    w: Math.round(layout.w * factor * 100) / 100,
    h: Math.round(layout.h * factor * 100) / 100,
    fields: layout.fields.map((f) => {
      const fcx = f.x + f.w / 2;
      const fcy = f.y + f.h / 2;
      const ncx = cx + (fcx - cx) * factor;
      const ncy = cy + (fcy - cy) * factor;
      const nw = f.w * factor;
      const nh = f.h * factor;
      return {
        ...f,
        x: Math.round((ncx - nw / 2) * 100) / 100,
        y: Math.round((ncy - nh / 2) * 100) / 100,
        w: Math.round(nw * 100) / 100,
        h: Math.round(nh * 100) / 100,
        fontSize: f.fontSize ? Math.round(f.fontSize * factor * 10) / 10 : f.fontSize,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Flow groups — hiding a field repacks the ones below it in the same group
// ---------------------------------------------------------------------------

export function repackFlow(fields, flowKey) {
  const members = fields.filter((f) => f.flow === flowKey).sort((a, b) => a.y - b.y);
  if (members.length === 0) return fields;
  let cursor = members[0].y;
  const next = new Map();
  for (const f of members) {
    if (f.visible) {
      next.set(f.id, cursor);
      cursor += f.h;
    } else {
      next.set(f.id, cursor); // hidden fields keep a slot reserved at the current cursor so re-showing restores order; cursor doesn't advance
    }
  }
  return fields.map((f) => (next.has(f.id) ? { ...f, y: next.get(f.id) } : f));
}

// ---------------------------------------------------------------------------
// History — {past, present, future}, capped, with coalesced rapid edits
// ---------------------------------------------------------------------------

export function histInit(layout) {
  return { past: [], present: layout, future: [] };
}

export function histPush(hist, next, limit = HISTORY_LIMIT) {
  const past = [...hist.past, hist.present].slice(-limit);
  return { past, present: next, future: [] };
}

export function histReplace(hist, next) {
  return { ...hist, present: next };
}

export function histUndo(hist) {
  if (hist.past.length === 0) return hist;
  const prev = hist.past[hist.past.length - 1];
  return {
    past: hist.past.slice(0, -1),
    present: prev,
    future: [hist.present, ...hist.future],
  };
}

export function histRedo(hist) {
  if (hist.future.length === 0) return hist;
  const [next, ...rest] = hist.future;
  return {
    past: [...hist.past, hist.present],
    present: next,
    future: rest,
  };
}

// ---------------------------------------------------------------------------
// A4 sheet grid — shared by the on-screen preview and the real print
// ---------------------------------------------------------------------------

export const A4_IN = { w: 8.27, h: 11.69 };

/** How many tagW x tagH tiles fit on an A4 page with this gap/margin, centred. */
export function sheetGrid(tagW, tagH, gap = 0.15, margin = 0.25) {
  const usableW = A4_IN.w - margin * 2;
  const usableH = A4_IN.h - margin * 2;
  const cols = Math.max(1, Math.floor((usableW + gap) / (tagW + gap)));
  const rows = Math.max(1, Math.floor((usableH + gap) / (tagH + gap)));
  const perPage = cols * rows;
  const gridW = cols * tagW + (cols - 1) * gap;
  const gridH = rows * tagH + (rows - 1) * gap;
  const offX = margin + (usableW - gridW) / 2;
  const offY = margin + (usableH - gridH) / 2;
  return { cols, rows, perPage, offX, offY };
}

/** Where tag #index (0-based) sits: which page, and x/y in inches on that page. */
export function sheetPosition(index, grid, tagW, tagH, gap = 0.15) {
  const { cols, rows, perPage, offX, offY } = grid;
  const page = Math.floor(index / perPage);
  const onPage = index % perPage;
  const col = onPage % cols;
  const row = Math.floor(onPage / cols);
  return {
    page,
    x: offX + col * (tagW + gap),
    y: offY + row * (tagH + gap),
  };
}

export function sheetPageCount(recordCount, grid) {
  return Math.max(1, Math.ceil(recordCount / grid.perPage));
}

// ---------------------------------------------------------------------------
// Default layout — FleetFlow vehicle tag
// ---------------------------------------------------------------------------

export const TAG_SIZES = [
  { label: "2 × 3in (windshield sticker)", w: 2, h: 3 },
  { label: "3 × 4in (dashboard card)", w: 3, h: 4 },
  { label: "3.5 × 5in (laminated card)", w: 3.5, h: 5 },
  { label: "1 × 1in (mini — QR + plate only)", w: 1, h: 1 },
];

export function vehicleTagLayout() {
  return {
    name: "Vehicle Tag",
    w: 3,
    h: 4,
    style: { bg: "#ffffff", border: "#2b2420" },
    fields: [
      {
        id: "logo", key: "logo", type: "image", label: "Org Logo", value: "{org_logo}",
        x: 1.1, y: 0.2, w: 0.8, h: 0.8, visible: true, lockSquare: true,
      },
      {
        id: "orgName", key: "orgName", type: "text", label: "Org Name", value: "{org_name}",
        x: 0.2, y: 1.05, w: 2.6, h: 0.3, fontSize: 13, fontWeight: 700, color: "#2b2420", align: "center", visible: true, flow: "header",
      },
      {
        id: "tagline", key: "tagline", type: "text", label: "Tagline", value: "VEHICLE IDENTITY",
        x: 0.2, y: 1.35, w: 2.6, h: 0.2, fontSize: 8, fontWeight: 500, color: "#8a7f6f", align: "center", visible: true, flow: "header",
      },
      {
        id: "qr", key: "qr", type: "qr", label: "QR Code", value: "{qr_url}",
        x: 0.75, y: 1.7, w: 1.5, h: 1.5, visible: true, lockSquare: true,
      },
      {
        id: "plate", key: "plate", type: "text", label: "Plate Number", value: "{plate_number}",
        x: 0.2, y: 3.3, w: 2.6, h: 0.35, fontSize: 18, fontWeight: 700, color: "#2b2420", align: "center", visible: true, flow: "footer",
      },
      {
        id: "model", key: "model", type: "text", label: "Model", value: "{model}",
        x: 0.2, y: 3.65, w: 2.6, h: 0.2, fontSize: 9, fontWeight: 400, color: "#8a7f6f", align: "center", visible: true, flow: "footer",
      },
    ],
  };
}
