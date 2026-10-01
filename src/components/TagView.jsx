import BrandedQr from "./BrandedQr";
import { fillTokens, resolveQr } from "../lib/tagLayout";

// The single tag renderer — draws one tag from a layout + a record at a
// given scale (CSS px per inch; 96 = true print size). No idea whether
// it's sitting in a live preview or about to be printed; same component
// either way, so the print output can never drift from what's on screen.
export default function TagView({ layout, record, scale, qrBaseUrl }) {
  const pxW = layout.w * scale;
  const pxH = layout.h * scale;

  return (
    <div
      style={{
        position: "relative",
        width: pxW,
        height: pxH,
        background: layout.style?.bg || "#ffffff",
        overflow: "hidden",
      }}
    >
      {layout.fields.filter((f) => f.visible).map((f) => {
        const style = {
          position: "absolute",
          left: f.x * scale,
          top: f.y * scale,
          width: f.w * scale,
          height: f.h * scale,
        };
        if (f.type === "text") {
          const text = fillTokens(f.value, record);
          if (!text) return null;
          return (
            <div
              key={f.id}
              style={{
                ...style,
                fontSize: (f.fontSize || 10) * (scale / 96),
                fontWeight: f.fontWeight || 400,
                color: f.color || "#000",
                textAlign: f.align || "left",
                display: "flex",
                alignItems: "center",
                justifyContent: f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start",
                lineHeight: 1.15,
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {text}
            </div>
          );
        }
        if (f.type === "image") {
          const src = fillTokens(f.value, record);
          if (!src) return null;
          return (
            <img
              key={f.id}
              src={src}
              alt=""
              style={{ ...style, objectFit: "cover", borderRadius: scale * 0.06 }}
            />
          );
        }
        if (f.type === "qr") {
          const url = resolveQr(f.value, { ...record, qr_url: qrBaseUrl ? `${qrBaseUrl}${record.id}` : record.qr_url });
          if (!url) return null;
          return (
            <div key={f.id} style={style}>
              <BrandedQr url={url} logoUrl={record.org_logo} size={Math.round(f.w * scale)} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
