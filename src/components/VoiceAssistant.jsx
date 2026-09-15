import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, MicOff, X, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { api } from "../lib/db";
import {
  createRecognizer,
  formatTime,
  formatDate,
  getMissionContext,
  HELP_TEXT,
  isVoiceEnabled,
  parseCommand,
  recognitionSupported,
  setVoiceEnabled,
  speak,
} from "../lib/voice";
import { cn } from "../lib/utils";

// Floating voice assistant — "Jarvis mode". Speaks confirmations with the
// what/when of every action; accepts voice (Chrome/Edge) or typed commands.
export default function VoiceAssistant({ user }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [typed, setTyped] = useState("");
  const [log, setLog] = useState([
    { who: "ai", text: "TransportLog voice at your service. Tap the mic or type a command — try 'help'." },
  ]);
  const recRef = useRef(null);
  const logRef = useRef(null);
  const busyRef = useRef(false);

  const addLog = (who, text) => setLog((l) => [...l.slice(-40), { who, text, at: formatTime() }]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  // ---------------- executor ----------------
  const execute = async (raw) => {
    const { intent, slots } = parseCommand(raw);
    const say = (t) => {
      addLog("ai", t);
      speak(t);
    };

    switch (intent) {
      case "start_mission": {
        const ctx = getMissionContext();
        if (ctx?.status === "Pending") {
          if (ctx.odoArmed) {
            say("Starting the mission now. Drive safely.");
            ctx.start();
            return;
          }
          say(`Mission for ${ctx.guest} is ready. Say "odometer" followed by the reading, or capture the odometer photo to start.`);
          return;
        }
        if (ctx?.status === "In Progress") {
          say("This mission is already in progress. Say end mission when you arrive.");
          return;
        }
        const rows = await api.entities.TransportRequest.filter({ status: "Pending" });
        const target = slots.target
          ? rows.find((r) => r.guest_name.toLowerCase().includes(slots.target.toLowerCase()))
          : rows[0];
        if (!target) {
          say("There are no pending missions right now.");
          return;
        }
        say(`Opening mission for ${target.guest_name}. Capture the odometer photo or say "odometer" followed by the reading to start.`);
        navigate(`/mission/${target.id}`);
        return;
      }
      case "end_mission": {
        const ctx = getMissionContext();
        if (ctx?.status === "In Progress") {
          if (ctx.endArmed) {
            say("Ending the mission. Well done.");
            ctx.end();
            return;
          }
          say(`Ending mission for ${ctx.guest}. Say "odometer" followed by the closing reading first.`);
          return;
        }
        say("No mission is in progress on this screen. Open a mission that's in progress first.");
        return;
      }
      case "set_odo": {
        if (!getMissionContext()) {
          say("Open a mission first — say start mission, or navigate to missions.");
          return;
        }
        emitOdo(slots.value);
        say(`Odometer set to ${Number(slots.value).toLocaleString()} kilometers.`);
        return;
      }
      case "report_incident": {
        const now = new Date();
        // restore the speaker's original casing (parser lowercases for matching)
        const detailOriginal = raw.trim().slice(-slots.detail.length) || slots.type;
        await api.entities.IncidentLog.create({
          type: slots.type,
          detail: detailOriginal,
          mission_id: getMissionContext()?.missionId || "",
          vehicle_plate: getMissionContext()?.vehiclePlate || "",
          reported_by: user?.full_name || "Driver",
          source: "voice",
          created_date: now.toISOString(),
        });
        window.dispatchEvent(new CustomEvent("app:incident"));
        say(`${slots.type} incident logged at ${formatTime(now)}: ${detailOriginal}. The front office can see it on the missions board.`);
        return;
      }
      case "read_missions": {
        const rows = await api.entities.TransportRequest.list("-schedule_date", 100);
        const today = new Date().toISOString().slice(0, 10);
        const pending = rows.filter((r) => r.status === "Pending");
        const active = rows.filter((r) => r.status === "In Progress");
        const todays = rows.filter((r) => r.schedule_date === today);
        const list = (pending.length ? pending : todays).slice(0, 4);
        let msg = `You have ${pending.length} pending and ${active.length} active mission${pending.length + active.length === 1 ? "" : "s"}.`;
        if (list.length)
          msg +=
            " Next up: " +
            list
              .map((r) => `${r.guest_name}, ${r.booking_type}${r.schedule_time ? " at " + r.schedule_time : ""}`)
              .join("; ") +
            ".";
        else msg += " Nothing else scheduled.";
        say(msg);
        return;
      }
      case "read_incidents": {
        const rows = await api.entities.IncidentLog.list("-created_date", 50);
        if (!rows.length) {
          say("No incidents have been reported. All clear.");
          return;
        }
        const recent = rows.slice(0, 3);
        say(
          `${rows.length} incident${rows.length === 1 ? "" : "s"} on record. Most recent: ` +
            recent
              .map((r) => `${r.type}, ${r.detail}, reported ${formatTime(new Date(r.created_date))}`)
              .join(". ") +
            "."
        );
        return;
      }
      case "time":
        say(`It is ${formatTime()}, ${formatDate()}.`);
        return;
      case "date":
        say(`Today is ${formatDate()}.`);
        return;
      case "navigate":
        navigate(slots.path);
        say("Opening it now.");
        return;
      case "help":
        say(HELP_TEXT);
        return;
      case "cancel":
        say("Okay, stopping.");
        return;
      default:
        say(`I didn't catch that. Say "help" to hear what I can do, or type it below.`);
    }
  };

  // ODO emitter lives here so execute() can reach it without circular imports
  function emitOdo(value) {
    import("../lib/voice").then((m) => m.emitOdoValue(Number(value)));
  }

  const runCommand = async (raw, who = "you") => {
    if (!raw.trim() || busyRef.current) return;
    busyRef.current = true;
    addLog(who, raw);
    setThinking(true);
    try {
      await execute(raw);
    } catch (e) {
      console.error("Voice command failed:", e);
      addLog("ai", "Something went wrong running that command.");
    } finally {
      setThinking(false);
      busyRef.current = false;
    }
  };

  // ---------------- mic ----------------
  const startListening = () => {
    if (!recognitionSupported()) {
      addLog("ai", "Voice input isn't supported in this browser — type your command below instead.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    recRef.current = createRecognizer({
      onResult: (text) => runCommand(text, "mic"),
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    });
    if (recRef.current) {
      setListening(true);
      recRef.current.start();
    }
  };

  // quick chips
  const CHIPS = [
    "What are my missions",
    "Report incident",
    "Start mission",
    "What time is it",
  ];

  return (
    <>
      {/* floating launcher — bottom-left, away from toasts */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-4 left-4 z-[90] w-12 h-12 rounded-full shadow-lift flex items-center justify-center transition-all print:hidden",
          open ? "bg-cocoa text-white" : "bg-brand text-white hover:bg-brand-dark",
          listening && "animate-pulse ring-4 ring-accent/50"
        )}
        title="TransportLog voice"
      >
        {listening ? <Mic className="w-5 h-5" /> : open ? <X className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-[90] w-[calc(100vw-2rem)] max-w-sm bg-white rounded-3xl shadow-lift border border-sand/70 overflow-hidden print:hidden">
          <div className="bg-brand text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <p className="text-xs font-bold uppercase tracking-wide">Voice Assistant</p>
            </div>
            <button
              onClick={() => {
                const next = !isVoiceEnabled();
                setVoiceEnabled(next);
                addLog("ai", next ? "Voice replies on." : "Voice replies off — I'll reply in text only.");
              }}
              className="opacity-80 hover:opacity-100"
              title={isVoiceEnabled() ? "Mute spoken replies" : "Unmute spoken replies"}
            >
              {isVoiceEnabled() ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          <div ref={logRef} className="h-56 overflow-y-auto px-3 py-2 space-y-2 bg-cream/60">
            {log.map((m, i) => (
              <div key={i} className={cn("flex", m.who === "you" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    m.who === "you"
                      ? "bg-brand text-white rounded-br-sm"
                      : "bg-white border border-sand text-mocha rounded-bl-sm"
                  )}
                >
                  {m.text}
                  {m.at && <span className="block text-[9px] opacity-60 mt-0.5">{m.at}</span>}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-white border border-sand rounded-2xl px-3 py-2 text-xs text-taupe">
                  thinking…
                </div>
              </div>
            )}
          </div>

          <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 bg-white">
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => runCommand(c)}
                className="text-[10px] font-semibold bg-mint/60 text-brand rounded-full px-2.5 py-1 hover:bg-mint"
              >
                {c}
              </button>
            ))}
          </div>

          <form
            className="flex items-center gap-2 p-3 bg-white"
            onSubmit={(e) => {
              e.preventDefault();
              runCommand(typed);
              setTyped("");
            }}
          >
            <button
              type="button"
              onClick={startListening}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-none transition-colors",
                listening ? "bg-accent text-cocoa animate-pulse" : "bg-mint/70 text-brand hover:bg-mint"
              )}
              title={recognitionSupported() ? "Tap to speak" : "Voice input not supported here — type below"}
            >
              {listening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={listening ? "Listening…" : "Type a command…"}
              className="flex-1 h-9 rounded-lg border border-sand px-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
            <button
              type="submit"
              className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center flex-none hover:bg-brand-dark"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
