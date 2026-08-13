import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Salon MVP",
  description: "Payment-integrity and booking management for Nigerian salons and barbershops.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
