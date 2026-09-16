import type { Metadata } from "next";
import Link from "next/link";
import { Outfit } from "next/font/google";
import "./globals.css";
import { FloatingControls } from "@/components/floating-controls";
import { UserIdentity, UserNav } from "@/components/user-chip";
import { ViewingBanner } from "@/components/viewing-banner";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "hangukeo",
  description: "Korean vocabulary practice and progress tracking",
};

/**
 * Applies the saved theme before first paint so the page never flashes light
 * then swaps. Matches the behaviour of the existing practice pages, including
 * the storage key, so a shared preference carries across.
 */
const themeScript = `(() => {
  try {
    const saved = localStorage.getItem("koreanQuizThemeV2");
    const theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ViewingBanner />
        <header className="site-header">
          <div className="header-inner">
            <div className="header-brand">
              <Link className="brand" href="/">
                hangukeo
              </Link>
              <UserIdentity />
            </div>
            <nav className="header-actions">
              <UserNav />
            </nav>
          </div>
        </header>
        {children}
        <FloatingControls />
      </body>
    </html>
  );
}
