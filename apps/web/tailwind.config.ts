import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fffdf5',
          100: '#fef9e7',
          200: '#fdf0c4',
          300: '#fbe49c',
          400: '#f8d462',
          500: '#f5c518',
          600: '#d4a017',
          700: '#b38614',
          800: '#8c6910',
          900: '#6b500c',
        },
      },
    },
  },
  plugins: [],
};

export default config;
