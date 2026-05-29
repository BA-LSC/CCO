import { provideRtkDesignSystem } from "@cloudflare/realtimekit-react-ui";

export function readCcoCssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value || fallback;
}

export function applyCcoRtkDesignSystem(target: HTMLElement = document.documentElement): void {
  const primary = readCcoCssColor("--color-primary", "#3b9eff");
  const bg = readCcoCssColor("--color-bg", "#090b10");
  const surface = readCcoCssColor("--color-surface", "#111620");
  const surface2 = readCcoCssColor("--color-surface-2", "#141a26");
  const text = readCcoCssColor("--color-text", "#e8edf5");
  const danger = readCcoCssColor("--color-danger", "#f87171");
  const success = readCcoCssColor("--color-success", "#34d399");

  provideRtkDesignSystem(target, {
    theme: "darkest",
    borderRadius: "rounded",
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    colors: {
      brand: { 500: primary, 600: primary, 700: primary },
      background: { 1000: bg, 900: surface, 800: surface2, 700: surface2, 600: surface2 },
      text,
      "text-on-brand": "#ffffff",
      "video-bg": "#000000",
      danger,
      success,
    },
  });

  // Keep RealtimeKit chrome on CCO radius tokens (theme picker updates these).
  target.style.setProperty("--rtk-border-radius-sm", readCcoCssColor("--radius-sm", "8px"));
  target.style.setProperty("--rtk-border-radius-md", readCcoCssColor("--radius-sm", "8px"));
  target.style.setProperty("--rtk-border-radius-lg", readCcoCssColor("--radius-md", "12px"));
}
