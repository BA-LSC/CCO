import type { Metadata, Viewport } from "next";
import { AppShellWrapper } from "@/components/AppShellWrapper";
import { ThemeProvider } from "@/components/ThemeProvider";
import { appUpdateBootstrapScript } from "@/lib/app-update-bootstrap-script";
import { resolveAppBuildVersion } from "@/lib/build-version.server";
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
  themeColor: "#111620",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appBuildVersion = resolveAppBuildVersion(process.env);
  const updateBootstrapScript = appUpdateBootstrapScript(appBuildVersion);

  return (
    <html lang="en" data-theme="1" suppressHydrationWarning>
      <head>
        <meta name="cco-app-version" content={appBuildVersion} />
        {updateBootstrapScript ? (
          <script
            dangerouslySetInnerHTML={{
              __html: updateBootstrapScript,
            }}
          />
        ) : null}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var n=navigator;if(n.standalone||matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches){document.documentElement.classList.add("standalone-display")}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AppShellWrapper>{children}</AppShellWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
