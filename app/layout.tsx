import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Demo Practice",
  description: "Demo Practice: secure scheduling, client intake, and billing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme on <html> before first paint (no flash). An EXTERNAL
            src script via next/script beforeInteractive — an inline <script>
            (even dangerouslySetInnerHTML) triggers a React 19 dev warning. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        {/* Installable web app (Add to Home Screen). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Demo Practice" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1e232b" media="(prefers-color-scheme: dark)" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Open+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PwaRegister />
        <div className="brandbar">
          <div className="inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tifec-mark.png" alt="Demo Practice" className="brand-mark" />
            <div>
              <h1>Demo Practice</h1>
              <p>Practice management</p>
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
