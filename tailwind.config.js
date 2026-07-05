/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(112 15% 86%)",
        input: "hsl(112 15% 86%)",
        ring: "hsl(148 55% 24%)",
        background: "hsl(48 24% 96%)",
        foreground: "hsl(145 21% 10%)",
        primary: {
          DEFAULT: "hsl(148 55% 24%)",
          foreground: "hsl(48 28% 97%)"
        },
        secondary: {
          DEFAULT: "hsl(120 18% 91%)",
          foreground: "hsl(145 21% 14%)"
        },
        muted: {
          DEFAULT: "hsl(115 12% 92%)",
          foreground: "hsl(135 8% 41%)"
        },
        accent: {
          DEFAULT: "hsl(142 27% 88%)",
          foreground: "hsl(148 55% 20%)"
        },
        destructive: {
          DEFAULT: "hsl(14 70% 42%)",
          foreground: "hsl(48 28% 97%)"
        },
        card: {
          DEFAULT: "hsl(48 28% 98%)",
          foreground: "hsl(145 21% 10%)"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Georgia", "ui-serif", "serif"]
      },
      boxShadow: {
        soft: "0 14px 40px rgb(27 39 32 / 0.08)",
        card: "0 2px 8px rgb(27 39 32 / 0.08)"
      }
    }
  },
  plugins: []
};
