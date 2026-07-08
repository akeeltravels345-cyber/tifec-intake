import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TIFEC Intake Forms",
  description: "Secure client intake for TIFEC psychology practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
              <p>Client Intake Forms</p>
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
