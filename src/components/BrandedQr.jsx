import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

// Shared QR renderer — the client's logo is reserved as part of generating
// the code itself (qr-code-styling), not a CSS image floated on top of a
// static <img> that has no idea it's being partially covered. Used by both
// the QR Codes page and the printable vehicle sticker so they always match.
export default function BrandedQr({ url, logoUrl, size = 208, dotColor = "#2b2420" }) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const options = {
      width: size,
      height: size,
      data: url,
      margin: 4,
      qrOptions: { errorCorrectionLevel: logoUrl ? "H" : "M" },
      dotsOptions: { type: "square", color: dotColor },
      cornersSquareOptions: { type: "square", color: dotColor },
      cornersDotOptions: { type: "square", color: dotColor },
      backgroundOptions: { color: "#ffffff" },
      ...(logoUrl && {
        image: logoUrl,
        imageOptions: {
          crossOrigin: "anonymous",
          hideBackgroundDots: true,
          imageSize: 0.32,
          margin: 3,
        },
      }),
    };
    if (!instanceRef.current) {
      instanceRef.current = new QRCodeStyling(options);
      containerRef.current.innerHTML = "";
      instanceRef.current.append(containerRef.current);
    } else {
      instanceRef.current.update(options);
    }
  }, [url, logoUrl, size, dotColor]);

  return <div ref={containerRef} style={{ width: size, height: size }} />;
}
