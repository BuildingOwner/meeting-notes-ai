import type { Config } from "tailwindcss";

// Notion design tokens — primary #7F6DF2, buttons rounded-md (NOT pill), body Inter 400/600.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#7F6DF2",
          pressed: "#6B5BD4",
          deep: "#5A4ABE",
        },
        "brand-navy": {
          DEFAULT: "#191919",
          deep: "#0D0D0D",
          mid: "#2D2D2D",
        },
        "link-blue": {
          DEFAULT: "#2383E2",
          pressed: "#1A6BBB",
        },
        // Brand color spectrum
        "brand-pink": { DEFAULT: "#E255A1", deep: "#C23183" },
        "brand-orange": { DEFAULT: "#D9730D", deep: "#9E5B1A" },
        "brand-purple": {
          DEFAULT: "#9D90FA",
          300: "#C4BFFE",
          800: "#4C3D9E",
        },
        "brand-teal": "#0F9453",
        "brand-green": "#2DB774",
        "brand-yellow": "#DFAB01",
        "brand-brown": "#64473A",
        // Card tints (pastel feature card backgrounds)
        "card-tint": {
          peach: "#FFF3E8",
          rose: "#FFE8EC",
          mint: "#E6F4EC",
          lavender: "#EDE8FF",
          sky: "#E8F3FF",
          yellow: "#FFF8E1",
          "yellow-bold": "#FDEB91",
          cream: "#FDF8F0",
          gray: "#F7F7F5",
        },
        // Surface
        canvas: "#FFFFFF",
        surface: {
          DEFAULT: "#F7F6F3",
          soft: "#FBFBFA",
        },
        hairline: {
          DEFAULT: "#EDECE9",
          soft: "#F4F4F2",
          strong: "#C7C7C5",
        },
        // Text hierarchy
        ink: {
          DEFAULT: "#37352F",
          deep: "#0F0F0F",
          mute: "#787774",
        },
        charcoal: "#37352F",
        slate: "#787774",
        steel: "#9B9B9B",
        stone: "#ACABA8",
        muted: "#C7C7C5",
        "on-dark": "#FFFFFF",
        "on-dark-muted": "rgba(255,255,255,0.7)",
        "on-primary": "#FFFFFF",
        // Semantic
        semantic: {
          success: "#0F9453",
          warning: "#D9730D",
          error: "#E03E3E",
        },
        // Status (used by StatusBadge)
        status: {
          done: "#0F9453",
          processing: "#D9730D",
          transcribing: "#787774",
          transcribed: "#37352F",
          queued: "#ACABA8",
          failed: "#E03E3E",
        },
      },
      fontFamily: {
        display: ["Inter", "-apple-system", "system-ui", "Segoe UI", "Helvetica", "sans-serif"],
        text: ["Inter", "-apple-system", "system-ui", "Segoe UI", "Helvetica", "sans-serif"],
      },
      fontSize: {
        "hero-display": ["80px", { lineHeight: "1.05", letterSpacing: "-2px", fontWeight: "600" }],
        "display-lg": ["56px", { lineHeight: "1.10", letterSpacing: "-1px", fontWeight: "600" }],
        "heading-1": ["48px", { lineHeight: "1.15", letterSpacing: "-0.5px", fontWeight: "600" }],
        "heading-2": ["36px", { lineHeight: "1.20", letterSpacing: "-0.5px", fontWeight: "600" }],
        "heading-3": ["28px", { lineHeight: "1.25", letterSpacing: "0", fontWeight: "600" }],
        "heading-4": ["22px", { lineHeight: "1.30", letterSpacing: "0", fontWeight: "600" }],
        "heading-5": ["18px", { lineHeight: "1.40", letterSpacing: "0", fontWeight: "600" }],
        subtitle: ["18px", { lineHeight: "1.50", letterSpacing: "0", fontWeight: "400" }],
        // Used by pages as text-display-md, text-heading-sm
        "display-md": ["28px", { lineHeight: "1.25", letterSpacing: "0", fontWeight: "600" }],
        "heading-sm": ["18px", { lineHeight: "1.40", letterSpacing: "0", fontWeight: "600" }],
        // Body
        body: ["16px", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "1.50", letterSpacing: "0", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.50", letterSpacing: "0", fontWeight: "400" }],
        "button-md": ["14px", { lineHeight: "1.30", letterSpacing: "0", fontWeight: "500" }],
        "button-sm": ["13px", { lineHeight: "1.30", letterSpacing: "0", fontWeight: "500" }],
        caption: ["13px", { lineHeight: "1.40", letterSpacing: "0", fontWeight: "600" }],
      },
      borderRadius: {
        // Notion geometry: buttons=md(8px), cards=lg(12px), badges=full(pill)
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        xxl: "20px",
        xxxl: "24px",
        full: "9999px",
      },
      spacing: {
        section: "80px",
      },
      maxWidth: {
        content: "1280px",
        text: "980px",
      },
      boxShadow: {
        subtle: "rgba(15,15,15,0.04) 0px 1px 2px 0px",
        card: "rgba(15,15,15,0.08) 0px 4px 12px 0px",
        mockup: "rgba(15,15,15,0.20) 0px 24px 48px -8px",
        modal: "rgba(15,15,15,0.16) 0px 16px 48px -8px",
      },
    },
  },
  plugins: [],
};

export default config;
