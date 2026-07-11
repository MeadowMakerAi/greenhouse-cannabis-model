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
        /* Warm paper background family — Phase 1 visual-system token.
           Used as an alternative to the cool ink-50/100 base when the
           dashboard wants a more editorial / trade-publication feel.
           Neighborhood-adjacent to the existing leaf and warn accents
           (which already work against warm tones). */
        paper: {
          50:  "#fbf7ed",
          100: "#f6f1e7",
          200: "#ede4d2",
          300: "#e1d5bd",
          400: "#cbb98f",
        },
        /* Promoted from warn — terracotta as a first-class chromatic
           CTA accent, not only a warning state. Use cta-* for primary
           "do this" affordances (location CTA, crown KPI underline,
           start-here pills). warn-* stays for actual warnings. Values
           mirror the warn family so the visual language is consistent. */
        cta: {
          50:  "#fbeae3",
          400: "#d6694b",
          500: "#c0573a",
          600: "#a3462b",
          700: "#7d3520",
        },
        /* Deep forest editorial green — alias for the leaf-700/leaf-600
           band so "editorial primary" intent is explicit in markup
           without re-tuning the existing leaf scale. */
        forest: {
          500: "#1f3a2e",
          600: "#16302a",
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
        // Condensed display face for hero numerics + section titles.
        // Pairs with Inter body. Engineering-instrument feel; reads
        // distinctly from the AI-default Geist/Plus-Jakarta pack.
        display: [
          "IBM Plex Sans Condensed",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        /* Editorial serif for headline numerals + magazine-spread
           moments (KPI crown values, hero numbers, italic captions).
           Newsreader is open-source, variable-axis (optical size
           16-72), designed for screen reading at large sizes. Georgia
           keeps the warmth even if Newsreader fails to load. */
        serif: [
          "Newsreader",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      fontSize: {
        // Readability bump over Tailwind defaults. The dashboard skews dense;
        // the small end (xs 12→13, sm 14→15) is where legibility hurt most.
        // Only the small sizes are nudged — base/lg+ keep defaults so headings
        // and layouts don't reflow. Line-heights scaled to match.
        xs: ["0.8125rem", { lineHeight: "1.125rem" }], // 13px / 18
        sm: ["0.9375rem", { lineHeight: "1.375rem" }], // 15px / 22
      },
      boxShadow: {
        // Legacy alias — still used by `.recharts-default-tooltip`.
        card: "0 1px 2px rgba(13,17,23,0.04), 0 1px 1px rgba(13,17,23,0.04)",

        // Elevation system — OKLCH-based, light source directly above.
        // Each tier = (1) tight contact shadow, (2) ambient drop with
        // slight leaf hue (oklch ~0.25 0.04 150) so surfaces feel like
        // they sit on a brand-tinted plane rather than a vacuum, plus
        // (3) inner top highlight (white 0.6-0.9) for the lit-edge cue.
        // OKLCH keeps the hue stable across alpha steps; sRGB stacks
        // muddy toward gray. (Evil Martians, Koos Looijesteijn.)
        e0: "inset 0 0 0 1px oklch(0.20 0.02 260 / 0.07)",
        e1:
          "0 1px 0 oklch(0.20 0.02 260 / 0.04), 0 1px 2px oklch(0.25 0.04 150 / 0.06), inset 0 1px 0 oklch(1 0 0 / 0.6)",
        e2:
          "0 1px 0 oklch(0.20 0.02 260 / 0.05), 0 2px 4px oklch(0.25 0.04 150 / 0.07), 0 6px 12px -6px oklch(0.25 0.04 150 / 0.08), inset 0 1px 0 oklch(1 0 0 / 0.7)",
        e3:
          "0 1px 0 oklch(0.20 0.02 260 / 0.06), 0 4px 8px oklch(0.25 0.05 150 / 0.08), 0 12px 28px -12px oklch(0.25 0.06 150 / 0.14), inset 0 1px 0 oklch(1 0 0 / 0.85)",
        e4:
          "0 1px 0 oklch(0.20 0.02 260 / 0.06), 0 8px 16px oklch(0.25 0.05 150 / 0.10), 0 24px 48px -16px oklch(0.25 0.07 150 / 0.20), inset 0 1px 0 oklch(1 0 0 / 0.9)",
        // Recessed surface — light from above, inset at top edge.
        recessed:
          "inset 0 1px 2px oklch(0.20 0.02 260 / 0.08), inset 0 0 0 1px oklch(0.20 0.02 260 / 0.05)",
        // Header bottom shadow — softer than a 1px border, anchors plane.
        header:
          "0 1px 0 oklch(0.20 0.02 260 / 0.05), 0 4px 12px -6px oklch(0.25 0.04 150 / 0.08)",
        // Pressed-into-groove for active tab buttons.
        pressed:
          "inset 0 1px 2px oklch(0.20 0.02 260 / 0.20), inset 0 0 0 1px oklch(0.20 0.02 260 / 0.12)",
      },
    },
  },
  plugins: [],
};
