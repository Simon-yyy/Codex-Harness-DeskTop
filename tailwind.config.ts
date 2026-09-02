import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--accent, #ea580c)',
          secondary: 'var(--accent-secondary, #f97316)',
          warm: 'var(--accent-warm, #f97316)',
          green: 'var(--accent-green, #10b981)',
        },
        bg: {
          base: 'var(--bg-base, #18181b)',
          sidebar: 'var(--bg-sidebar, #121215)',
          card: 'var(--bg-card, #202024)',
          'card-elevated': 'var(--bg-card-elevated, #27272a)',
          hover: 'var(--bg-hover, rgba(255, 255, 255, 0.06))',
          active: 'var(--bg-active, rgba(234, 88, 12, 0.15))',
        },
        border: {
          DEFAULT: 'var(--border, rgba(255, 255, 255, 0.1))',
          light: 'var(--border-light, rgba(255, 255, 255, 0.05))',
        },
        text: {
          primary: 'var(--text-primary, #f4f4f5)',
          secondary: 'var(--text-secondary, #a1a1aa)',
        }
      },
      fontFamily: {
        mono: ['"Cascadia Code"', 'Consolas', 'Monaco', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      }
    },
  },
  plugins: [],
} satisfies Config;
