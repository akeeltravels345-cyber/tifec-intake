import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TIFEC Intake Forms",
  description: "Secure client intake for TIFEC psychology practice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
