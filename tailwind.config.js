/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#f8fafc',
          raised: '#ffffff',
          border: '#e2e8f0',
        },
        accent: {
          DEFAULT: '#2563eb',
          muted: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
}
