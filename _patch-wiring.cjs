const fs = require("fs");
const path = require("path");
const root = "D:/000 NATIVE ANDROID PROJECTS/fleetflow-duplicate";
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);
let ok = true;
const sub = (f, from, to, label) => {
  let s = read(f);
  if (!s.includes(from)) { console.error("MISSING in " + f + ": " + label); ok = false; return; }
  s = s.replace(from, to);
  write(f, s);
  console.log("patched", f, "-", label);
};

// ---- Layout.jsx: render VoiceAssistant ----
sub(
  "src/components/Layout.jsx",
  'import { Button } from "./ui";',
  'import { Button } from "./ui";\nimport VoiceAssistant from "./VoiceAssistant";',
  "import assistant"
);
sub(
  "src/components/Layout.jsx",
  "        <ToastHost toasts={toasts} dismiss={dismiss} />",
  "        <ToastHost toasts={toasts} dismiss={dismiss} />\n        <VoiceAssistant user={user} />",
  "render assistant"
);

// ---- MissionDetail.jsx: context registration + ODO listener + start/end via ref ----
sub(
  "src/pages/MissionDetail.jsx",
  'import { themeColors } from "../lib/theme";',
  'import { themeColors } from "../lib/theme";\nimport { setMissionContext, onOdoValue } from "../lib/voice";',
  "import voice bus"
);

// OdoCapture: subscribe to voice-driven ODO values
sub(
  "src/pages/MissionDetail.jsx",
  `  const [manual, setManual] = useState(false);

  const onFile = async (e) => {`,
  `  const [manual, setManual] = useState(false);

  // "Odometer 38400" from the voice assistant fills this field
  useEffect(() => onOdoValue((v) => {
    setManual(true);
    setReading(String(v));
  }), []);

  const onFile = async (e) => {`,
  "odo voice listener"
);

// MissionDetail: register mission context for start/end
sub(
  "src/pages/MissionDetail.jsx",
  `  const tracker = useRouteTracker();`,
  `  const tracker = useRouteTracker();

  // expose start/end to the voice assistant ("start mission" / "end mission")
  useEffect(() => {
    if (!request) return;
    setMissionContext({
      missionId: request.mission_id,
      guest: request.guest_name,
      vehiclePlate: request.vehicle_plate || "",
      status: request.status,
      start: () => startMission(),
      end: () => endMission(),
    });
    return () => setMissionContext(null);
  }, [request, startOdo, endOdo, log, remarks]); // eslint-disable-line`,
  "mission context"
);

// ---- Missions.jsx: incident log section ----
sub(
  "src/pages/Missions.jsx",
  'import { api, isOnline } from "../lib/db";',
  'import { api, isOnline } from "../lib/db";\nimport { AlertTriangle } from "lucide-react";\nimport { formatTime } from "../lib/voice";',
  "missions imports"
);
sub(
  "src/pages/Missions.jsx",
  `export default function Missions({ user }) {
  const [requests, setRequests] = useState([]);`,
  `export default function Missions({ user }) {
  const [requests, setRequests] = useState([]);
  const [incidents, setIncidents] = useState([]);`,
  "incidents state"
);
sub(
  "src/pages/Missions.jsx",
  `  useEffect(() => {
    load();
  }, []);`,
  `  const loadIncidents = async () => {
    try {
      setIncidents(await api.entities.IncidentLog.list("-created_date", 5));
    } catch {}
  };

  useEffect(() => {
    load();
    loadIncidents();
    const onIncident = () => loadIncidents();
    window.addEventListener("app:incident", onIncident);
    return () => window.removeEventListener("app:incident", onIncident);
  }, []);`,
  "incidents load"
);

// ---- Settings.jsx: voice card ----
sub(
  "src/pages/Settings.jsx",
  'import { cn } from "../lib/utils";',
  'import { cn } from "../lib/utils";\nimport { isVoiceEnabled as getVoiceOn, recognitionSupported, setVoiceEnabled, speak, HELP_TEXT } from "../lib/voice";',
  "settings voice imports"
);

console.log(ok ? "ALL PATCHES OK" : "SOME PATCHES FAILED");
