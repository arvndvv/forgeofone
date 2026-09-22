/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Press Start 2P"', 'cursive'],
        body: ['"Pixelify Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
