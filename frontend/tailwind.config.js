/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sand: '#f2eee5',
        parchment: '#faf7f0',
        paper: '#fffdf7',
        ink: '#1c1917',
        moss: { DEFAULT: '#2e5941', deep: '#1e4030' },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(28,25,23,.05), 0 12px 32px -20px rgba(28,25,23,.25)',
      },
    },
  },
  plugins: [],
};
