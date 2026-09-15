// ---------------------------------------------------------------------------
// Voice layer — "Jarvis mode". Built entirely on the browsers' built-in
// Web Speech APIs (no keys, no cloud):
//   • speak()  — SpeechSynthesis with a warm assistant voice
//   • listen() — SpeechRecognition (Chrome/Edge; graceful fallback to typing)
//   • parseCommand() — tolerant grammar for fleet operations
//
// Commands understood (English, case/punctuation-insensitive):
//   start mission [for <name>]        → opens the pending mission / arms start
//   end mission                       → ends the in-progress mission
//   odometer <number> / odo <number>  → fills the visible ODO capture
//   report incident <text> (also: accident / breakdown / flat tire / emergency)
//                                     → logs a timestamped incident, speaks receipt
//   what are my missions / read missions → spoken mission briefing
//   what incidents were reported / read incidents → spoken incident log
//   what time is it / what's the date
//   navigate to <page> / open <page>  → fleet | fuel | dashboard | history | bookings | qr | settings
//   help / what can you do · cancel
// ---------------------------------------------------------------------------

// --- speech synthesis -------------------------------------------------------
const VOICE_KEY = "fleetflow:voice";
export function isVoiceEnabled() {
  return localStorage.getItem(VOICE_KEY) !== "off";
}
export function setVoiceEnabled(on) {
  localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  if (!on) window.speechSynthesis?.cancel();
}

export function speak(text, { interrupt = true } = {}) {
  if (!isVoiceEnabled() || !("speechSynthesis" in window)) return;
  if (interrupt) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en(-|_)/i.test(v.lang) && /female|samantha|zira|aria|jenny|google us/i.test(v.name)) ||
    voices.find((v) => /en(-|_)/i.test(v.lang));
  if (preferred) u.voice = preferred;
  u.rate = 1.04;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
  return u;
}

// --- speech recognition -----------------------------------------------------
export function recognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer({ onResult, onEnd, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const transcript = e.results?.[0]?.[0]?.transcript?.trim() || "";
    if (transcript && onResult) onResult(transcript);
  };
  rec.onend = () => onEnd && onEnd();
  rec.onerror = (e) => onError && onError(e);
  return rec;
}

// --- mission context bus ----------------------------------------------------
// MissionDetail registers itself so commands like "odometer 38400",
// "start mission" and "end mission" act on the mission on screen.
let missionContext = null;
export function setMissionContext(ctx) {
  missionContext = ctx; // { missionId, guest, status, start(), end() } | null
}
export function getMissionContext() {
  return missionContext;
}

// ODO value emitter — the mounted OdoCapture listens and fills its field.
const odoSubs = new Set();
export function emitOdoValue(v) {
  odoSubs.forEach((f) => {
    try {
      f(v);
    } catch {}
  });
}
export function onOdoValue(fn) {
  odoSubs.add(fn);
  return () => odoSubs.delete(fn);
}

// --- time formatting ---------------------------------------------------------
export function formatTime(d = new Date()) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function formatDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// --- command parsing ---------------------------------------------------------
export function parseCommand(raw = "") {
  const t = raw.toLowerCase().trim().replace(/[.,!?]/g, "").replace(/\s+/g, " ");
  if (!t) return { intent: "unknown", slots: { raw } };

  // incident shortcuts first (most specific)
  const incidentMatch = t.match(/^(?:report|log)\s+(?:an?\s+)?(?:incident|accident|breakdown|flat tire|emergency)\b(.*)$/);
  if (incidentMatch) {
    const detail = incidentMatch[1].trim();
    let type = "Other";
    if (/accident/.test(t)) type = "Accident";
    else if (/breakdown|engine|stall/.test(t)) type = "Breakdown";
    else if (/flat|tire/.test(t)) type = "Flat Tire";
    else if (/emergency/.test(t)) type = "Emergency";
    return { intent: "report_incident", slots: { detail: detail || type, type } };
  }

  if (/\b(start|begin)\b.*\bmission\b/.test(t))
    return { intent: "start_mission", slots: { target: t.match(/for\s+(.+)$/)?.[1] } };
  if (/\b(end|stop|finish|complete)\b.*\bmission\b/.test(t))
    return { intent: "end_mission", slots: {} };
  const odo = t.match(/(?:odometer|odo)\s*(?:reading\s*)?(?:is|:)?\s*([\d,]{3,})/);
  if (odo) return { intent: "set_odo", slots: { value: odo[1].replace(/,/g, "") } };
  if (/(what|read|show|list|any|open)\b.*\bmissions?\b/.test(t) || /^missions?$/.test(t))
    return { intent: "read_missions", slots: {} };
  if (/(what|read|show|list|any)\b.*\bincidents?\b/.test(t) || /^incidents?$/.test(t))
    return { intent: "read_incidents", slots: {} };
  if (/\b(what('?s| is)? the time|what time)\b/.test(t)) return { intent: "time", slots: {} };
  if (/\b(what('?s| is)? the date|what date|today'?s date|what day)\b/.test(t)) return { intent: "date", slots: {} };

  const nav = t.match(/(?:navigate|go|open|show)\s+(?:to\s+)?(?:the\s+)?(fleet|fuel|dashboard|front office|history|bookings?|qr|qr codes?|settings?|missions?|home)\b/);
  if (nav) {
    const map = {
      fleet: "/fleet", fuel: "/fuel", dashboard: "/fo-dashboard", "front office": "/fo-dashboard",
      history: "/history", booking: "/new-booking", bookings: "/new-booking", qr: "/qr-codes",
      "qr code": "/qr-codes", "qr codes": "/qr-codes", setting: "/settings", settings: "/settings",
      mission: "/", missions: "/", home: "/",
    };
    return { intent: "navigate", slots: { path: map[nav[1]] || "/" } };
  }
  if (/\b(help|what can you do|commands)\b/.test(t)) return { intent: "help", slots: {} };
  if (/\b(cancel|nevermind|never mind|stop listening)\b/.test(t)) return { intent: "cancel", slots: {} };

  return { intent: "unknown", slots: { raw: raw.trim() } };
}

export const HELP_TEXT =
  "You can say: start mission. End mission. Odometer, followed by the number. " +
  "Report incident, then what happened. What are my missions. What incidents were reported. " +
  "Navigate to fleet, fuel, dashboard, history, bookings, or settings. " +
  "Or ask: what time is it.";
