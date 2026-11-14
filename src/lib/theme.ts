/** Persistent dark/light theme. Storage key is locked in DESIGN_EMERALD_GOLD.md. */

export const THEME_STORAGE_KEY = "fasihi-theme";

export const THEME_NAMES = ["dark", "light"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "dark";

export function parseTheme(value: string | null | undefined): ThemeName {
  return value === "light" || value === "dark" ? value : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function readStoredTheme(): ThemeName {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistTheme(theme: ThemeName) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
}

/** Inline boot — runs in <head> before paint to avoid FOUC. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t=${JSON.stringify(DEFAULT_THEME)};var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t);r.style.colorScheme=t;}catch(e){document.documentElement.classList.add(${JSON.stringify(DEFAULT_THEME)});}})();`;
