import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Install CCO — Chat Center Online",
  description: "Browser-only setup for CCO on your Cloudflare account",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
