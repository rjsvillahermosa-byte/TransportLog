export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export const BOOKING_TYPES = ["Drop-off", "Airport Pick-up", "Special Request", "Other"];

export const DEPARTMENTS = [
  "Owner",
  "Marketing",
  "Operations Manager",
  "Purchasing",
  "Front Office",
  "HR & Admin",
  "Finance",
  "Engineering",
  "Sales",
  "Other",
];

export const SERVICE_TYPES = [
  "General Inspection",
  "Preventive Maintenance",
  "Oil Change",
  "Tire Replacement",
  "Registration Renewal",
  "Repair",
  "Other",
];

export const STATUS_STYLES = {
  Pending: "bg-accent/15 text-accent-dark border-accent/40",
  "In Progress": "bg-mint/70 text-brand border-brand/30",
  Completed: "bg-brand text-white border-brand",
};

export const BOOKING_ICONS = {
  "Drop-off": "↓",
  "Airport Pick-up": "✈",
  "Special Request": "★",
  Other: "•",
};
