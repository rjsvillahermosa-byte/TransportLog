// Shared pre-mission walk-around checklist — used by the vehicle QR landing
// page (/v/<token>) and the in-app Start Mission flow, so both stay in sync.
export const CHECKLIST = [
  { key: "tires", label: "Tires — pressure & condition (all 4 + spare)" },
  { key: "fuel", label: "Fuel level sufficient for the trip" },
  { key: "lights", label: "Lights, brake lights & turn signals working" },
  { key: "brakes", label: "Brakes responsive (test before moving)" },
  { key: "fluids", label: "Oil, coolant & washer fluid levels OK" },
  { key: "docs", label: "OR/CR, insurance & registration inside the vehicle" },
  { key: "clean", label: "Interior clean & ready for guests" },
  { key: "tools", label: "Spare tire, jack & early-warning devices present" },
];
