import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import dayjs from "../lib/day";
import { cn } from "../lib/utils";
import { Select } from "./ui";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Date field with month/year dropdowns instead of a native <input type="date">
 * — on mobile the native picker is a swipe-by-swipe scroll wheel, which is
 * painful for a far-future date like a license/registration/insurance expiry.
 * value/onChange use plain "YYYY-MM-DD" strings, same as a native date input.
 */
export function DatePicker({ value, onChange, minYear, maxYear, placeholder = "Select date" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = value ? dayjs(value) : null;
  const [viewYear, setViewYear] = useState((selected || dayjs()).year());
  const [viewMonth, setViewMonth] = useState((selected || dayjs()).month());

  useEffect(() => {
    if (!open) return;
    if (selected) {
      setViewYear(selected.year());
      setViewMonth(selected.month());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const thisYear = dayjs().year();
  const yearFrom = minYear ?? thisYear - 10;
  const yearTo = maxYear ?? thisYear + 15;
  const years = [];
  for (let y = yearTo; y >= yearFrom; y--) years.push(y);

  const monthStart = dayjs(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`);
  const daysInMonth = monthStart.daysInMonth();
  const firstDow = monthStart.day();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const pick = (day) => {
    const iso = dayjs(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`).format(
      "YYYY-MM-DD"
    );
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-sand bg-white px-3 py-2 text-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className={selected ? "text-cocoa" : "text-taupe"}>
          {selected ? selected.format("MMM D, YYYY") : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-taupe flex-none" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-sand bg-white p-3 shadow-lift">
          <div className="flex gap-2 mb-3">
            <Select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))} className="flex-1">
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </Select>
            <Select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))} className="w-24">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-taupe">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              const isSelected =
                day && selected && selected.year() === viewYear && selected.month() === viewMonth && selected.date() === day;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!day}
                  onClick={() => day && pick(day)}
                  className={cn(
                    "h-8 rounded-md text-xs",
                    !day
                      ? "invisible"
                      : isSelected
                      ? "bg-brand text-white font-semibold"
                      : "text-cocoa hover:bg-mint/60"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {selected && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="mt-2 text-xs text-taupe underline underline-offset-2 hover:text-brand"
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}
