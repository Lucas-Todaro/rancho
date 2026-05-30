import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        pasture: "#2f855a",
        meadow: "#ecfdf5"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(15, 23, 42, 0.08)"
      },
      backgroundImage: {
        grid: "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)"
      }
    }
  },
  plugins: []
};

export default config;
