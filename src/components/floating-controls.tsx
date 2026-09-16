"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "koreanQuizThemeV2";

/**
 * The two fixed circular controls the design system specifies at the bottom
 * right: back to top, and the light/dark toggle.
 *
 * The theme button keeps no React state — the theme lives on
 * `<html data-theme>`, set by the inline script in the layout before first
 * paint. Mirroring it into state would need an effect that runs after
 * hydration, which flashes the wrong icon. Both icons are rendered and CSS
 * shows the applicable one.
 */
export function FloatingControls() {
  const [scrolled, setScrolled] = useState(false);

  // Subscribing to an external system, which is what effects are for; the
  // state is set from the listener, not synchronously in the effect body.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  return (
    <div className="floating-controls">
      <button
        type="button"
        className={`floating-btn back-to-top ${scrolled ? "" : "is-hidden"}`}
        onClick={() =>
          window.scrollTo({
            top: 0,
            // Honour the same preference the stylesheet does.
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          })
        }
        aria-label="Back to top"
        title="Back to top"
        tabIndex={scrolled ? 0 : -1}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 5l-7 7h4v7h6v-7h4z"
            fill="currentColor"
          />
        </svg>
      </button>

      <button
        type="button"
        className="floating-btn theme-btn"
        onClick={toggleTheme}
        aria-label="Switch between light and dark"
        title="Switch between light and dark"
      >
        {/* Moon shown in light mode, sun in dark — CSS picks. */}
        <svg
          className="when-light"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
            fill="currentColor"
          />
        </svg>
        <svg
          className="when-dark"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <g fill="currentColor">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      </button>
    </div>
  );
}
