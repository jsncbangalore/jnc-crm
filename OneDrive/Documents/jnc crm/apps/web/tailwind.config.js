/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        crm: {
          blue: {
            DEFAULT: '#2E5EFF',
            hover: '#1D4ED8',
            light: '#8FB8FF',
            subtle: '#EEF4FF',
          },
          whatsapp: {
            DEFAULT: '#25D366',
            hover: '#1EBE5D',
            light: '#B9F5D0',
            subtle: '#E8FAF0',
          },
          amber: {
            DEFAULT: '#FFB020',
            hover: '#E59A10',
            light: '#FFE8B8',
            subtle: '#FFF9ED',
          },
          violet: {
            DEFAULT: '#7B4FFF',
            hover: '#6836EB',
            light: '#DCCBFF',
            subtle: '#F4EFFF',
          },
          teal: {
            DEFAULT: '#00B8A9',
            hover: '#009D90',
            light: '#B8F2ED',
            subtle: '#E6FAF8',
          },
          coral: {
            DEFAULT: '#FF5A5F',
            hover: '#E5454A',
            light: '#FFD8D9',
            subtle: '#FFF0F1',
          },
          charcoal: {
            DEFAULT: '#1E2230',
            dark: '#12141C',
            card: '#181B26',
            border: '#2A3042',
          },
          offwhite: '#F7F8FC',
        },
      },
      fontFamily: {
        sans: ['"Nuvetra"', '"Naratama"', '"RNDI"', '"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        fancy: ['"Great Vibes"', 'cursive'],
        brush: ['"Kaushan Script"', 'cursive'],
        comeitiye: ['"Parisienne"', 'cursive'],
        handwriting: ['"Caveat"', 'cursive'],
      },
      boxShadow: {
        'glow-blue': '0 0 20px -5px rgba(46, 94, 255, 0.3)',
        'glow-amber': '0 0 20px -5px rgba(255, 176, 32, 0.3)',
        'glow-violet': '0 0 20px -5px rgba(123, 79, 255, 0.3)',
        'glow-teal': '0 0 20px -5px rgba(0, 184, 169, 0.3)',
        'glow-coral': '0 0 20px -5px rgba(255, 90, 95, 0.3)',
      },
    },
  },
  plugins: [],
};
