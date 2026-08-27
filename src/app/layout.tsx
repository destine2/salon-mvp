import type { Metadata, Viewport } from "next";
import { Playfair_Display, Dancing_Script, Work_Sans } from "next/font/google";
import RegisterServiceWorker from "./register-sw";
import "./globals.css";

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const dancingScript = Dancing_Script({ subsets: ["latin"], variable: "--font-script", display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Salon MVP",
  description: "Payment-integrity and booking management for Nigerian salons and barbershops.",
  manifest: "/manifest.webmanifest",
  // Lets the dashboard install to an Android home screen and open without
  // browser chrome — the no-app-store path the PRD calls for.
  appleWebApp: {
    capable: true,
    title: "Salon",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#171310",
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled deliberately: this is used on cheap phones in bright
  // rooms, and blocking pinch-zoom to look "app-like" costs accessibility.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${dancingScript.variable} ${workSans.variable}`}>
      <body style={{ fontFamily: "var(--font-body), 'Work Sans', sans-serif" }}>
        {/*
          THESIS: a salon's booking link should feel like the studio itself,
          not a government form — refuses the bare-white-form category default.
          OWN-WORLD: warm cream ground, gold (#B38F5C) as committed accent,
          near-black Playfair Display headings, Work Sans body, soft card
          shadows, no harsh borders — the Veloura system, unmodified.
          STORY: a customer decides in seconds this is a real, polished
          business worth a deposit, then books in three steps.
          FIRST VIEWPORT: salon name in large Playfair Display on cream,
          service selection as warm cards, gold accent on selected state.
          FORM: incomplete-brand expansion of the confirmed Veloura system
          (brief-pinned by the user, not a rolled direction) — see PRODUCT.md.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, and DESIGN.md.
        */}
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
