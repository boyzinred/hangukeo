"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "koreanQuizThemeV2";

/** Anything that reads as a landmark on the page, in document order. */
const SECTION_SELECTOR = [
  ".hero",
  ".section-heading",
  ".vocab-section",
  ".dash-card",
  ".panel",
  ".exercise-panel",
  ".practice-cta",
  ".week-row",
  ".jump-card",
].join(",");

/** A hair above the sticky header, so the target is not tucked under it. */
const HEADER_OFFSET = 76;

/**
 * The fixed circular controls at the bottom right: step through the page's
 * sections, and the light/dark toggle.
 *
 * Back-to-top was one jump in one direction on pages that are now long lists
 * of sections — a word bank of a thousand rows, a test of a hundred and fifty
 * questions. Stepping is what those pages actually need, and holding the up
 * arrow still gets you to the top.
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

  function step(direction: -1 | 1) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? ("auto" as const)
      : ("smooth" as const);

    const tops = [...document.querySelectorAll<HTMLElement>(SECTION_SELECTOR)]
      .map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET))
      .filter((top) => top >= 0)
      .sort((a, b) => a - b);

    const here = Math.round(window.scrollY);
    // A few pixels of slack so a section you are already parked on does not
    // count as the next one down.
    const next =
      direction === 1
        ? tops.find((top) => top > here + 8)
        : [...tops].reverse().find((top) => top < here - 8);

    window.scrollTo({
      top: next ?? (direction === 1 ? document.body.scrollHeight : 0),
      behavior,
    });
  }

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
        className={`floating-btn section-nav ${scrolled ? "" : "is-hidden"}`}
        onClick={() => step(-1)}
        aria-label="Previous section"
        title="Previous section"
        tabIndex={scrolled ? 0 : -1}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5l-7 7h4v7h6v-7h4z" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        className="floating-btn section-nav"
        onClick={() => step(1)}
        aria-label="Next section"
        title="Next section"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 19l7-7h-4V5H9v7H5z" fill="currentColor" />
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
