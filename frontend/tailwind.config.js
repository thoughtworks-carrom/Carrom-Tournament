/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        board: {
          light: "#c4a574",
          DEFAULT: "#8b6914",
          dark: "#5c4510",
          frame: "#3d2817",
        },
        striker: {
          DEFAULT: "#f5f5f0",
          ring: "#d4d4c8",
        },
        coin: {
          white: "#f8f8f2",
          black: "#1a1a1a",
          red: "#c41e3a",
        },
        accent: {
          gold: "#a2186d",
          teal: "#47cfbb",
        },
        tw: {
          magenta: "#a2186d",
          purple: "#471782",
          violet: "#764f9e",
          teal: "#47cfbb",
          coral: "#e55237",
          ink: "#231f20",
          mist: "#f4f2f5",
        },
      },
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        body: ["DM Sans", "system-ui", "sans-serif"],
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-delayed": "float 6s ease-in-out 2s infinite",
        shimmer: "shimmer 2s linear infinite",
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
        "glow-line": "glow-line 2s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-20px) rotate(5deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "glow-line": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
