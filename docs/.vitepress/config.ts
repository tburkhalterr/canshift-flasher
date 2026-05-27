// docs/.vitepress/config.ts
import { defineConfig } from 'vitepress'

// VitePress configuration for the CANShift Flasher documentation sub-site.
// Built to `docs/.vitepress/dist/` and copied into the SPA's `dist/docs/`
// during `npm run build` so a single Vercel deploy serves both surfaces.
export default defineConfig({
  base: '/docs/',
  title: 'CANShift Flasher — Documentation',
  titleTemplate: ':title — CANShift Flasher',
  description:
    'User documentation for the CANShift firmware flasher: workflow, ECU profiles, local firmware, and troubleshooting.',
  // `true` = follow the user's OS preference on first load + persist toggle
  // overrides in localStorage. Switched away from `'dark'` because the toggle
  // behaviour with a forced default felt inconsistent — `true` ergonomically
  // matches what users expect from a docs site theme switcher.
  appearance: true,
  // Keep `.html` URLs (cleanUrls: false) so Vercel serves them as static
  // files without needing any rewrite rules. VitePress still produces a
  // working SPA at runtime — only the initial URL has the extension.
  cleanUrls: false,
  lastUpdated: true,
  themeConfig: {
    nav: [
      // Leading slash so the link resolves at the deployed origin root
      // (canshift.tmbk.ch/) rather than relative to /docs/.
      { text: 'Back to flasher', link: '/' },
    ],
    sidebar: [
      {
        text: 'Guides',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Flash workflow', link: '/flash-workflow' },
          { text: 'ECU profile', link: '/ecu-profile' },
          { text: 'Local firmware', link: '/local-firmware' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
    ],
    outline: {
      level: [2, 3],
    },
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tburkhalterr/canshift-flasher' },
    ],
    editLink: {
      pattern:
        'https://github.com/tburkhalterr/canshift-flasher/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'CANShift Flasher documentation',
      copyright: 'Copyright © CANShift',
    },
  },
})
