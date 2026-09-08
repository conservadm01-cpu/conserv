import type { Config } from 'tailwindcss';

// Paleta assentada no material impresso: papel levemente quente, verde da
// capa do método e um âmbar reservado para pendência de conferência.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        papel: { DEFAULT: '#faf8f4', escuro: '#15171b' },
        tinta: { DEFAULT: '#23201c', fraca: '#6b6559', clara: '#eceae5' },
        metodo: { DEFAULT: '#2f7d5b', escuro: '#1f5c42', claro: '#e3f0e9' },
        pendente: { DEFAULT: '#b26a00', claro: '#fdf1de' },
        alerta: { DEFAULT: '#b3261e', claro: '#fbe9e7' },
      },
      fontFamily: {
        corpo: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        titulo: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
