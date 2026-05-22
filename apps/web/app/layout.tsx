import type { Metadata, Viewport } from "next";
import { AppShellWrapper } from "@/components/AppShellWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import "./themes.css";

export const metadata: Metadata = {
  title: {
    default: "CCO — Chat Center Online",
    template: "%s · CCO",
  },
  description: "Chat Center Online — Planning Center groups messaging for your church community",
  appleWebApp: {
    capable: true,
    title: "CCO",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="1" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShellWrapper>{children}</AppShellWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
