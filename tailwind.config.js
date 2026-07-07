/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eaf6ef",
          100: "#cfe9da",
          200: "#a2d4b8",
          300: "#6fba92",
          400: "#3f9c6c",
          500: "#1f814f",
          600: "#146c43",
          700: "#0f5735",
          800: "#0b4229",
          900: "#082f1e",
        },
        accent: {
          300: "#eccb6f",
          400: "#e0b64a",
          500: "#d4a017",
          600: "#b3871a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
