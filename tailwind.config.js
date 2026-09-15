/** @type {import('tailwindcss').Config} */
// Theme: warm car-sharing design language — cream canvas, mint blobs,
// deep teal primary, gold + burnt-orange accents, chocolate text.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF3E7",
        sand: "#E8DFD0",
        mint: "#CFE3D6",
        mintdark: "#B9D4C4",
        // Brand + accent are CSS-variable backed (see :root in index.css and
        // src/lib/theme.js) so Settings → Brand Theme can swap them at runtime.
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          dark: "rgb(var(--accent-dark) / <alpha-value>)",
        },
        orange: "#B4552D",
        cocoa: "#2E2218",
        mocha: "#5A4C3F",
        taupe: "#8A8378",
      },
      fontFamily: {
        heading: ["var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-brand)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 12px rgba(0,0,0,0.06)",
        lift: "0 8px 24px rgba(0,0,0,0.09)",
      },
    },
  },
  plugins: [],
};
