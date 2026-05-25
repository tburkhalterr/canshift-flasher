// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-muted': 'var(--text-muted)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        'status-danger': 'var(--status-danger)',
        'status-danger-dim': 'var(--status-danger-dim)',
        scrim: 'var(--scrim)',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
