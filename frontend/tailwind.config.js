/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#0088FF',
          dark: '#304050',
          bg: '#F9FAFB',
          danger: '#EF4444',
        },
      },
    },
  },
  plugins: [],
};
