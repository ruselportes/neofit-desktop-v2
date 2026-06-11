import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "var(--glass-border)",
        input: "var(--input-bg)",
        ring: "var(--accent)",
        background: "var(--bg-primary)",
        foreground: "var(--text-main)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-main)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--text-main)",
        },
        popover: {
          DEFAULT: "var(--bg-modal)",
          foreground: "var(--text-main)",
        },
        card: {
          DEFAULT: "var(--bg-modal)",
          foreground: "var(--text-main)",
        },
      },
      borderRadius: {
        lg: "var(--card-radius)",
        md: "calc(var(--card-radius) - 4px)",
        sm: "calc(var(--card-radius) - 8px)",
      },
    },
  },
  plugins: [],
};

export default config;
