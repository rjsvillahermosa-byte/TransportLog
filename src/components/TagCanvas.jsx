import { useRef, useState } from "react";
import TagView from "./TagView";
import { moveBox, resizeBox, snapTo, MIN_QR_IN } from "../lib/tagLayout";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_CURSOR = {
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
  ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
};

// Wraps TagView with pointer handlers: select, drag-to-move, drag-handle-to-
// resize, double-click to edit text in place. Drag is LOCAL (a `live`
// override merged into the render) until pointer-up, so a cancelled drag
// costs nothing and the undo-tracked layout is untouched mid-gesture.
export default function TagCanvas({ layout, record, scale, qrBaseUrl, selectedId, onSelect, onCommit }) {
  const [live, setLive] = useState(null); // { id, x, y, w, h } while dragging
  const [editingId, setEditingId] = useState(null);
  const dragRef = useRef(null); // { id, mode: 'move'|'resize', handle?, startX, startY, box }

  const effectiveLayout = live
    ? { ...layout, fields: layout.fields.map((f) => (f.id === live.id ? { ...f, ...live } : f)) }
    : layout;

  const fieldAt = (id) => layout.fields.find((f) => f.id === id);

  // onCommit replaces hist.present wholesale, so every commit must carry the
  // full layout shape ({w, h, fields, style}) — never a bare fields array,
  // or the next render's `layout.fields` is undefined and the canvas crashes.
  const commitFields = (fields, coalesce) => onCommit({ ...layout, fields }, coalesce);

  const beginDrag = (e, field, mode, handle) => {
    e.stopPropagation();
    onSelect(field.id);
    dragRef.current = { id: field.id, mode, handle, startX: e.clientX, startY: e.clientY, box: field };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const box =
      d.mode === "move"
        ? moveBox(d.box, dx, dy)
        : resizeBox(d.box, d.handle, dx, dy, { square: !!d.box.lockSquare });
    setLive({ id: d.id, x: box.x, y: box.y, w: box.w, h: box.h });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragRef.current = null;
    setLive((cur) => {
      if (!cur || !d) return null;
      const field = fieldAt(d.id);
      // Guarded resize: shrinking a QR below a scannable minimum confirms first.
      if (field?.type === "qr" && d.mode === "resize" && cur.w < MIN_QR_IN) {
        if (!window.confirm(`This QR is now ${cur.w.toFixed(2)}in — below the ${MIN_QR_IN}in minimum most phones can reliably scan. Keep it this small anyway?`)) {
          return null;
        }
      }
      commitFields(
        layout.fields.map((f) => (f.id === cur.id ? { ...f, x: cur.x, y: cur.y, w: cur.w, h: cur.h } : f)),
        d.mode === "move" ? `move:${d.id}` : `resize:${d.id}:${d.handle}`
      );
      return null;
    });
  };

  const nudge = (e, field) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const step = e.altKey ? 0.01 : e.shiftKey ? 0.08 : 0.02;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const box = moveBox(field, dx, dy);
    commitFields(
      layout.fields.map((f) => (f.id === field.id ? { ...f, x: box.x, y: box.y } : f)),
      `nudge:${field.id}`
    );
  };

  return (
    <div
      className="relative select-none"
      style={{ width: layout.w * scale, height: layout.h * scale }}
      // Deselect on background click only — a field's own click (bubbling
      // up from a stopPropagation'd pointerdown) is a SEPARATE click event
      // from the same gesture, so this must check the actual target rather
      // than relying on the pointerdown's stopPropagation to suppress it.
      onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
    >
      <TagView layout={effectiveLayout} record={record} scale={scale} qrBaseUrl={qrBaseUrl} />
      {layout.fields.filter((f) => f.visible).map((f) => {
        const box = live?.id === f.id ? { ...f, ...live } : f;
        const selected = selectedId === f.id;
        return (
          <div
            key={f.id}
            tabIndex={0}
            onPointerDown={(e) => beginDrag(e, f, "move")}
            onKeyDown={(e) => nudge(e, f)}
            onDoubleClick={(e) => { e.stopPropagation(); if (f.type === "text") setEditingId(f.id); }}
            style={{
              position: "absolute",
              left: box.x * scale,
              top: box.y * scale,
              width: box.w * scale,
              height: box.h * scale,
              outline: selected ? "2px solid #3451B2" : "1px dashed transparent",
              cursor: "move",
            }}
          >
            {editingId === f.id && (
              <textarea
                autoFocus
                defaultValue={f.value}
                className="absolute inset-0 w-full h-full resize-none border border-brand bg-white/95 p-0.5"
                style={{ fontSize: (f.fontSize || 10) * (scale / 96) }}
                onBlur={(e) => { commitFields(layout.fields.map((x) => x.id === f.id ? { ...x, value: e.target.value } : x)); setEditingId(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingId(null);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitFields(layout.fields.map((x) => x.id === f.id ? { ...x, value: e.target.value } : x));
                    setEditingId(null);
                  }
                }}
              />
            )}
            {selected && editingId !== f.id && HANDLES.map((h) => (
              <div
                key={h}
                onPointerDown={(e) => beginDrag(e, f, "resize", h)}
                style={{
                  position: "absolute",
                  width: 8, height: 8, background: "#3451B2", border: "1px solid white", borderRadius: 2,
                  cursor: HANDLE_CURSOR[h],
                  top: h.includes("n") ? -4 : h.includes("s") ? "auto" : "50%",
                  bottom: h.includes("s") ? -4 : "auto",
                  left: h.includes("w") ? -4 : h.includes("e") ? "auto" : "50%",
                  right: h.includes("e") ? -4 : "auto",
                  transform: `translate(${h === "n" || h === "s" ? "-50%" : "0"}, ${h === "e" || h === "w" ? "-50%" : "0"})`,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
