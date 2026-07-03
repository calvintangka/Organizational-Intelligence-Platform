import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        memory: "#2563eb",
        trust: "#0f766e",
        signal: "#7c3aed",
        muted: "#667085",
        teal: "#14B8A6",
        surface: "#F6F8FB",
        "dark-bg": "#111827",
        "dark-surface": "#1e2d3d",
        "dark-border": "#2d3f52",
        "dark-card": "#1a2b3c"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(15, 23, 42, 0.08)",
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)"
      }
    }
  },
  plugins: []
};

export default config;
