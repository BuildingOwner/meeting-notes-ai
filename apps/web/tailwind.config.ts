import type { Config } from "tailwindcss";

// DESIGN.md (Apple) tokens. Single accent #0066cc, no decorative gradients,
// no card shadows. Body 17px. Pill CTAs.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0066cc",
          focus: "#0071e3",
          "on-dark": "#2997ff",
        },
        canvas: "#ffffff",
        parchment: "#f5f5f7",
        pearl: "#fafafc",
        tile: { 1: "#272729", 2: "#2a2a2c", 3: "#252527" },
        ink: {
          DEFAULT: "#1d1d1f",
          80: "#333333",
          48: "#7a7a7a",
          muted: "#cccccc",
        },
        hairline: "#e0e0e0",
        "divider-soft": "#f0f0f0",
        // Status palette (derived; muted, never competes with primary blue)
        status: {
          done: "#0066cc",        // Action Blue
          processing: "#7a7a7a",  // ink-48
          transcribing: "#7a7a7a",
          transcribed: "#1d1d1f", // ink (near-black)
          queued: "#7a7a7a",
          failed: "#b80000",      // muted red, used sparingly
        },
      },
      fontFamily: {
        display: [
          "SF Pro Display",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
        text: [
          "SF Pro Text",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      fontSize: {
        hero: [
          "56px",
          { lineHeight: "1.07", letterSpacing: "-0.28px", fontWeight: "600" },
        ],
        "display-lg": [
          "40px",
          { lineHeight: "1.10", fontWeight: "600" },
        ],
        "display-md": [
          "34px",
          { lineHeight: "1.47", letterSpacing: "-0.374px", fontWeight: "600" },
        ],
        lead: [
          "28px",
          { lineHeight: "1.14", letterSpacing: "0.196px" },
        ],
        tagline: [
          "21px",
          { lineHeight: "1.19", letterSpacing: "0.231px", fontWeight: "600" },
        ],
        body: [
          "17px",
          { lineHeight: "1.47", letterSpacing: "-0.374px" },
        ],
        caption: [
          "14px",
          { lineHeight: "1.43", letterSpacing: "-0.224px" },
        ],
        fine: [
          "12px",
          { lineHeight: "1", letterSpacing: "-0.12px" },
        ],
      },
      borderRadius: {
        pill: "9999px",
        "apple-lg": "18px",
        "apple-md": "11px",
        "apple-sm": "8px",
      },
      spacing: {
        section: "80px",
      },
      maxWidth: {
        content: "1440px",
        text: "980px",
      },
    },
  },
  plugins: [],
};

export default config;
