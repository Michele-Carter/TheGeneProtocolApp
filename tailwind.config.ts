import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0f16',
          900: '#0f1623',
          800: '#111827',
          700: '#161f2e',
          600: '#1b2738',
          500: '#243041',
          400: '#334155',
        },
        brand: {
          500: '#4f46e5',
        },
        gold: {
          200: '#f2d387',
          300: '#e8c05a',
          400: '#dba931',
          500: '#c2911f',
          600: '#9c7419',
          700: '#7a5a14',
          900: '#3a2b0a',
          950: '#241a06',
        },
        state: {
          successBg: '#052e1a',
          successText: '#86efac',
          warnBg: '#3a2a05',
          warnText: '#fcd34d',
          dangerBg: '#3b0a0a',
          dangerText: '#fca5a5',
        },
      },
      boxShadow: {
        panel: '0 8px 24px rgba(0, 0, 0, 0.35)',
      },
      borderRadius: {
        xl2: '14px',
      },
    },
  },
  plugins: [],
} satisfies Config;
