/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: '#0a0e1a',
          card: '#111827',
          border: '#1f2937',
          accent: '#3b82f6',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
          muted: '#6b7280',
          text: '#e5e7eb',
        },
      },
    },
  },
  plugins: [],
};
