import { createContext, useContext, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

// Hand-rolled shadcn-style primitives matching the original app's look.

const VARIANTS = {
  default: "bg-brand text-white hover:bg-brand-dark shadow-sm",
  primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-sand bg-white hover:bg-mint/50 text-mocha",
  secondary: "bg-mint/70 text-cocoa hover:bg-mint",
  ghost: "hover:bg-mint/50 text-mocha",
  link: "text-brand underline-offset-4 hover:underline",
};
const SIZES = {
  default: "h-10 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-11 rounded-md px-8",
  icon: "h-9 w-9",
};

export function Button({ className, variant = "default", size = "default", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-sand bg-white px-3 py-2 text-sm placeholder:text-taupe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-sand bg-white px-3 py-2 text-sm placeholder:text-taupe focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }) {
  return (
    <label
      className={cn("text-sm font-medium text-mocha leading-none", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-sand bg-white px-3 py-2 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="absolute right-2.5 top-3 h-4 w-4 text-taupe pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 px-0 md:px-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto p-5 shadow-lift">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-heading font-bold text-cocoa">{title}</h3>
          <button
            onClick={onClose}
            className="text-taupe hover:text-cocoa p-1 rounded-md hover:bg-mint/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TAB_CTX = createContext(null);
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-start rounded-lg bg-mint/60 p-1 text-taupe max-w-full overflow-x-auto",
        className
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all flex-none",
            value === t.value
              ? "bg-white text-brand shadow-sm"
              : "hover:text-mocha"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="text-center py-12">
      {Icon && <Icon className="w-12 h-12 text-mintdark mx-auto mb-3" />}
      <p className="text-taupe text-sm">{children}</p>
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <svg
      className={cn("animate-spin", className ?? "w-4 h-4")}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
