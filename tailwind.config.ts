import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#effaf3',100:'#d7f3e1',200:'#b1e6c8',300:'#7dd2a7',400:'#47b882',500:'#249d68',600:'#177e53',700:'#136444',800:'#115038',900:'#0d3f2e',950:'#06241a' },
        accent: { 300:'#e3f77a', 400:'#d4f04a', 500:'#bfe024' },
        ink: { 50:'#f6f7f9',100:'#eceef2',200:'#d7dbe3',300:'#b6bdcb',400:'#8b94a7',500:'#667085',600:'#4a5367',700:'#363e50',800:'#232a3a',900:'#141a28' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
        pop: '0 12px 40px rgba(16,24,40,.16)',
      },
    },
  },
  plugins: [],
};
export default config;
