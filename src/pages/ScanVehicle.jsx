import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import jsQR from "jsqr";
import { ScanLine, AlertTriangle, ListChecks } from "lucide-react";

// In-app camera QR scanner — the fix for phones whose camera app doesn't
// auto-detect a QR code and offer to open its link (the original friction
// report: no way to scan at all on some devices). Decodes frames with jsQR
// (pure JS, no native BarcodeDetector dependency, so it works the same on
// every browser) and, once it reads a vehicle sticker's URL, hands off to
// VehicleScan's existing resolve-vehicle → find-its-mission → redirect flow
// by just navigating to the decoded /v/<token> path — no logic duplicated.
export default function ScanVehicle() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | denied | unsupported | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    const tick = () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        stop();
        handleDecoded(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const handleDecoded = (text) => {
      // Accept either the full printed URL (https://…/v/<token>) or a bare
      // token, in case a code was ever generated without the origin.
      let token = text.trim();
      try {
        const url = new URL(text);
        const match = url.pathname.match(/\/v\/([^/]+)/);
        if (match) token = match[1];
      } catch {
        /* not a URL — treat the raw text as the token */
      }
      navigate(`/v/${encodeURIComponent(token)}`);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErrorMsg(e.message || "Couldn't access the camera");
        setStatus(e.name === "NotAllowedError" ? "denied" : "error");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-cocoa flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide text-mint mb-4">
          <ScanLine className="h-4 w-4" /> Scan Vehicle QR
        </p>

        <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-black border-2 border-brand/40">
          {(status === "starting" || status === "scanning") && (
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          )}
          {status === "scanning" && (
            <div className="absolute inset-6 border-2 border-mint rounded-2xl pointer-events-none" />
          )}
          {status === "starting" && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-sand">
              Starting camera…
            </p>
          )}
          {(status === "denied" || status === "unsupported" || status === "error") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <AlertTriangle className="h-8 w-8 text-accent mb-3" />
              <p className="text-sm font-semibold text-white">
                {status === "denied" && "Camera access was denied"}
                {status === "unsupported" && "This browser can't open the camera"}
                {status === "error" && "Couldn't start the camera"}
              </p>
              {errorMsg && <p className="text-xs text-sand mt-1">{errorMsg}</p>}
              {status === "denied" && (
                <p className="text-xs text-sand mt-2">
                  Allow camera access in your browser's site settings, then reload this page.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-sand mt-4">
          Point your camera at the QR code on the vehicle's dashboard or window sticker.
        </p>

        <Link
          to="/"
          className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-mint hover:underline"
        >
          <ListChecks className="h-4 w-4" /> Can't scan? Pick the mission from the list instead
        </Link>
      </div>
    </div>
  );
}
