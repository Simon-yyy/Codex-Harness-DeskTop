import { useState, useEffect } from 'react';

export type ThemeType = 'dark' | 'dark-soft' | 'light' | 'light-soft';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeType>(() => {
    try {
      return (
        (localStorage.getItem('codex_theme') as ThemeType) ||
        (localStorage.getItem('codex_desktop_theme') as ThemeType) ||
        'dark'
      );
    } catch (e) {
      return 'dark';
    }
  });

  const applyTheme = (newTheme: ThemeType) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('codex_theme', newTheme);
      localStorage.setItem('codex_desktop_theme', newTheme);
    } catch (e) {}

    document.documentElement.setAttribute('data-theme', newTheme);
    if (newTheme.startsWith('light')) {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }

    if (window.codexDesktop && window.codexDesktop.setTheme) {
      try {
        window.codexDesktop.setTheme(newTheme);
      } catch (e) {}
    }
  };

  useEffect(() => {
    applyTheme(theme);

    if (window.codexDesktop && window.codexDesktop.onThemeChange) {
      window.codexDesktop.onThemeChange((t) => {
        if (t && ['dark', 'dark-soft', 'light', 'light-soft'].includes(t)) {
          applyTheme(t as ThemeType);
        }
      });
    }
  }, []);

  return { theme, setTheme: applyTheme };
}
