/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        navy: {
          50: '#EEF2FB',
          100: '#D6E0F5',
          200: '#B0C0E0',
          300: '#8A9BBF',
          400: '#4169C4',
          500: '#1A3263',
          600: '#122247',
          700: '#0E1A35',
          800: '#091222',
          900: '#050C17',
        },
      },
    },
  },
  plugins: [],
}
