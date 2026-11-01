import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#2C2118",
        cream: "#FFF6EA",
        paper: "#F3E6D4",
        terracotta: "#C4542C",
        "terracotta-dark": "#8E3418",
        gold: "#E0A322",
        "gold-bright": "#FFD56A",
        pine: "#1E5A45",
        "pine-deep": "#143D2F",
        miss: "#8A7B70",
        tv: "#140E0A",
        tvcard: "#2A1E16",
        line: "#E4D3BE",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        text: ["var(--font-text)", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 50px rgba(44, 33, 24, 0.08)",
        tv: "0 24px 60px rgba(0, 0, 0, 0.35)",
      },
      borderRadius: {
        card: "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
