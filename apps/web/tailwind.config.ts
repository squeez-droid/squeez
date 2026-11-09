import type { Config } from "tailwindcss";

// Every color comes from a CSS variable in globals.css (single source of design tokens).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        surface2: v("surface-2"),
        line: v("line"),
        primary: v("fg"),
        mint: v("fg-2"),
        muted: v("muted"),
        up: v("up"),
        down: v("down"),
        warn: v("fg"),
        white: v("fg"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "2px", DEFAULT: "3px", md: "3px", lg: "4px", xl: "6px", "2xl": "8px" },
      transitionDuration: { DEFAULT: "160ms" },
    },
  },
  plugins: [],
};
export default config;
