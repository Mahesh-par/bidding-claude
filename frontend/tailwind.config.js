/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#d97706',
          'orange-hover': '#b45309',
          grey: '#f3f4f6',
          'grey-dark': '#374151',
          'bg-dark': '#0a0a0a',
          'card-dark': '#171717',
        }
      }
    },
  },
  plugins: [],
}
