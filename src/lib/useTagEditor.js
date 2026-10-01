import { useCallback, useEffect, useRef, useState } from "react";
import {
  histInit, histPush, histReplace, histUndo, histRedo,
  vehicleTagLayout, HISTORY_LIMIT, COALESCE_WINDOW_MS,
} from "./tagLayout";

// One hook holding all editing-session state for the vehicle tag type:
// layout history (undo/redo), selection, zoom, saved presets, batch list,
// autosave. A real org can only ever tag one thing (vehicles) so — unlike
// TFE's two parallel modes — this mounts once per Tag Editor page.

const DRAFT_KEY = "ff.tagDraft.v1";
const PRESETS_KEY = "ff.tagPresets.v1";

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useTagEditor() {
  const [hist, setHist] = useState(() => histInit(loadDraft() || vehicleTagLayout()));
  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [presets, setPresets] = useState(loadPresets);
  const [batch, setBatch] = useState([]); // array of records (vehicles) to print as a sheet
  const [sheetView, setSheetView] = useState(false);
  const lastEdit = useRef(null); // { key, t }
  const saveTimer = useRef(null);

  const layout = hist.present;

  const commit = useCallback((next, coalesce) => {
    const merge =
      coalesce &&
      lastEdit.current?.key === coalesce &&
      Date.now() - lastEdit.current.t < COALESCE_WINDOW_MS;
    lastEdit.current = coalesce ? { key: coalesce, t: Date.now() } : null;
    setHist((h) => (merge ? histReplace(h, next) : histPush(h, next, HISTORY_LIMIT)));
  }, []);

  const undo = useCallback(() => setHist(histUndo), []);
  const redo = useCallback(() => setHist(histRedo), []);

  // Debounced autosave of the working layout — a refresh resumes exactly
  // where you left off.
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(layout));
      } catch {
        /* storage full/unavailable — draft just doesn't persist this time */
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [layout]);

  const resetToDefault = useCallback(() => {
    commit(vehicleTagLayout());
    setSelectedId(null);
  }, [commit]);

  const savePreset = useCallback((name) => {
    const next = [...presets.filter((p) => p.name !== name), { name, layout: JSON.parse(JSON.stringify(layout)) }];
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, [presets, layout]);

  const loadPreset = useCallback((name) => {
    const p = presets.find((x) => x.name === name);
    if (p) commit(JSON.parse(JSON.stringify(p.layout)));
  }, [presets, commit]);

  const deletePreset = useCallback((name) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, [presets]);

  return {
    layout, hist, commit, undo, redo,
    canUndo: hist.past.length > 0, canRedo: hist.future.length > 0,
    selectedId, setSelectedId,
    zoom, setZoom,
    presets, savePreset, loadPreset, deletePreset,
    batch, setBatch,
    sheetView, setSheetView,
    resetToDefault,
  };
}
