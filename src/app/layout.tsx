import type { Metadata, Viewport } from "next";
import RegisterServiceWorker from "./register-sw";

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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
