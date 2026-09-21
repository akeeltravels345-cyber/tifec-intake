import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "The Institute for Essential Care",
  description: "The Institute for Essential Care: secure scheduling, client intake, and billing.",
};

// Set the theme (Auto/Light/Dark) on <html> before first paint so there's no
// flash. "Auto" resolves to the device's prefers-color-scheme. See ThemeToggle.
// Intake forms (/intake) are client-facing and must ALWAYS render light, never
// following the device's dark setting — so force light there before paint.
const THEME_INIT = `(function(){try{var p=location.pathname;var forceLight=p==='/intake'||p.indexOf('/intake/')===0;var t=localStorage.getItem('tifec-theme')||'system';var d=!forceLight&&(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Open+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="brandbar">
          <div className="inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tifec-mark.png" alt="TIFEC" className="brand-mark" />
            <div>
              <h1>TIFEC</h1>
              <p>The Institute for Essential Care</p>
            </div>
          </div>
        </div>
        {children}
        <footer className="sitefoot">
          <a href="/privacy">Privacy Policy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms">Terms of Use</a>
        </footer>
      </body>
    </html>
  );
}
