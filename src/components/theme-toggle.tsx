"use client";

const STORAGE_KEY = "koreanQuizThemeV2";

/**
 * The theme lives on `<html data-theme>`, set by the inline script in the
 * layout before first paint. This component deliberately keeps no React state:
 * mirroring the DOM into state would need an effect that fires after hydration,
 * which both trips `react-hooks/set-state-in-effect` and flashes the wrong
 * label. Instead both labels are rendered and CSS shows the applicable one.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="header-link theme-toggle"
      onClick={toggle}
      title="Switch between light and dark"
    >
      <span className="when-light">☾ Dark</span>
      <span className="when-dark">☀ Light</span>
    </button>
  );
}
