/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // AMINA Teal Scale
        teal: {
          900: '#07343A',
          800: '#0A4A52',
          700: '#0D636B',
          600: '#11818A',
          500: '#19A1A5',
          300: '#86D4D6',
          100: '#E7F5F5',
          50: '#F4FBFB',
        },
        // Neutral Scale
        ink: {
          950: '#0A0F12',
          900: '#11181C',
          800: '#1C252B',
        },
        slate: {
          700: '#46535D',
          600: '#5D6B75',
          500: '#73818B',
          400: '#97A4AC',
          300: '#C8D0D6',
          200: '#DDE4E8',
          100: '#EEF3F5',
        },
        // Functional Colors
        success: {
          700: '#13795B',
          100: '#E9F7F1',
        },
        warning: {
          700: '#B7791F',
          100: '#FBF3E5',
        },
        error: {
          700: '#C53B3B',
          100: '#FDECEC',
        },
        info: {
          700: '#0F6CBD',
          100: '#EAF3FC',
        },
        review: {
          700: '#7B61A8',
          100: '#F1ECF8',
        },
        // Premium Accents
        gold: {
          500: '#C6A86B',
          100: '#F6EFD9',
        },
        platinum: {
          500: '#BAC5CF',
          100: '#EFF3F6',
        },
        // Semantic Backgrounds
        amina: {
          bg: '#F5F8F9',
          surface: '#FFFFFF',
          'surface-secondary': '#F8FBFB',
          'surface-muted': '#EEF4F5',
          'brand-subtle': '#E7F5F5',
          dark: '#0A1C20',
          // Ops-specific
          'ops-bg': '#F3F7F8',
          'ops-selected': '#E7F5F5',
          // Client-specific
          'client-bg': '#F7FBFB',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '10px',
        md: '12px',
        lg: '18px',
        xl: '24px',
      },
      boxShadow: {
        1: '0 2px 8px rgba(10,15,18,0.05)',
        2: '0 8px 24px rgba(10,15,18,0.08)',
        3: '0 16px 40px rgba(10,15,18,0.10)',
      },
      transitionTimingFunction: {
        amina: 'cubic-bezier(0.2, 0, 0, 1)',
        'amina-exit': 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
  plugins: [],
};
