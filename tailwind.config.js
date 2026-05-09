/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#fafbfc",
          100: "#f4f6f8",
          200: "#e6e9ee",
          300: "#a8b0bb",
          500: "#5b6573",
          700: "#2c3744",
          800: "#1a2230",
          900: "#0d1117",
        },
        leaf: {
          50: "#f0f7f4",
          100: "#dbeae3",
          400: "#43a47e",
          500: "#2f8f6c",
          600: "#1f6c50",
          700: "#185640",
        },
        sun: {
          50: "#fef8ec",
          400: "#f1bd5e",
          500: "#e8b04a",
          600: "#cf983a",
        },
        warn: {
          50: "#fbeae3",
          400: "#d6694b",
          500: "#c0573a",
          600: "#a3462b",
        },
        accent: {
          // Slate-blue for data callouts (Linear-ish)
          400: "#5e7aa8",
          500: "#3a5a91",
          600: "#2d4773",
        },
        celebrate: {
          400: "#7d4cd1",
          500: "#5e34b3",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        // Legacy aliases — kept so existing class names still resolve while
        // the new e1-e4 elevation system rolls through the codebase.
        card: "0 1px 2px rgba(13,17,23,0.04), 0 1px 1px rgba(13,17,23,0.04)",
        cardHover:
          "0 4px 8px rgba(13,17,23,0.06), 0 2px 4px rgba(13,17,23,0.04)",
        kpi:
          "0 1px 0 rgba(13,17,23,0.04), 0 1px 3px rgba(13,17,23,0.05), 0 8px 24px -12px rgba(13,17,23,0.08)",

        // Elevation system — single light source upper-left.
        // Each tier = (1) a tight contact shadow, (2) an ambient shadow,
        // (3) optional inner top highlight to simulate light catching the lip.
        e0: "inset 0 0 0 1px rgba(13,17,23,0.06)",
        e1:
          "0 1px 0 rgba(13,17,23,0.03), 0 1px 2px rgba(13,17,23,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
        e2:
          "0 1px 0 rgba(13,17,23,0.04), 0 2px 4px rgba(13,17,23,0.05), 0 6px 12px -6px rgba(13,17,23,0.06), inset 0 1px 0 rgba(255,255,255,0.7)",
        e3:
          "0 1px 0 rgba(13,17,23,0.05), 0 4px 8px rgba(13,17,23,0.06), 0 12px 28px -12px rgba(13,17,23,0.10), inset 0 1px 0 rgba(255,255,255,0.85)",
        e4:
          "0 1px 0 rgba(13,17,23,0.05), 0 8px 16px rgba(13,17,23,0.08), 0 24px 48px -16px rgba(13,17,23,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
        // Recessed surface — light comes from above, so the inset shadow
        // sits at the top edge.
        recessed:
          "inset 0 1px 2px rgba(13,17,23,0.07), inset 0 0 0 1px rgba(13,17,23,0.04)",
        recessedDeep:
          "inset 0 2px 4px rgba(13,17,23,0.08), inset 0 0 0 1px rgba(13,17,23,0.05)",
        // Header bottom shadow — softer than a 1px border, anchors the plane.
        header:
          "0 1px 0 rgba(13,17,23,0.04), 0 4px 12px -6px rgba(13,17,23,0.06)",
        // Pressed-into-groove for active tab buttons.
        pressed:
          "inset 0 1px 2px rgba(13,17,23,0.18), inset 0 0 0 1px rgba(13,17,23,0.10)",
        // Soft brand glows — for ring-like accents.
        glowLeaf:
          "0 0 0 1px rgba(47,143,108,0.25), 0 8px 24px -8px rgba(47,143,108,0.30)",
      },
      backgroundImage: {
        // Subtle directional sheen — light upper-left, settles into surface.
        "surface-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%)",
        "surface-sheen-strong":
          "linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 50%)",
      },
    },
  },
  plugins: [],
};
