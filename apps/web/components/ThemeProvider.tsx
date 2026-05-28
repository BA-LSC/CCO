"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import {
  applyThemeToDocument,
  CHAOS_THEME,
  isUserTheme,
  THEME_STORAGE_KEY,
  type UserTheme,
} from "@/lib/themes";

type SessionMe = { userId: string; displayName?: string; theme?: string };

type ThemeContextValue = {
  theme: UserTheme;
  setTheme: (theme: UserTheme) => Promise<void>;
  chaosUnlocked: boolean;
  unlockChaos: () => Promise<void>;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readCachedTheme(): UserTheme | null {
  if (typeof window === "undefined") return null;
  const cached = localStorage.getItem(THEME_STORAGE_KEY);
  return cached && isUserTheme(cached) ? cached : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UserTheme>("1");
  const [chaosUnlocked, setChaosUnlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cached = readCachedTheme();
    if (cached) {
      setThemeState(cached);
      applyThemeToDocument(cached);
      if (cached === CHAOS_THEME) setChaosUnlocked(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiFetch<SessionMe>("/api/v1/session/me")
      .then((me) => {
        if (cancelled || !me.theme || !isUserTheme(me.theme)) return;
        setThemeState(me.theme);
        applyThemeToDocument(me.theme);
        localStorage.setItem(THEME_STORAGE_KEY, me.theme);
        if (me.theme === CHAOS_THEME) setChaosUnlocked(true);
      })
      .catch(() => {
        /* signed out — keep local theme for guests */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persistTheme = useCallback(async (next: UserTheme) => {
    setThemeState(next);
    applyThemeToDocument(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    if (next === CHAOS_THEME) setChaosUnlocked(true);

    try {
      await apiFetch<{ theme: string }>("/api/v1/session/me/theme", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      /* theme still applied locally */
    }
  }, []);

  const setTheme = useCallback(
    async (next: UserTheme) => {
      if (next === CHAOS_THEME && !chaosUnlocked) return;
      await persistTheme(next);
    },
    [chaosUnlocked, persistTheme],
  );

  const unlockChaos = useCallback(async () => {
    setChaosUnlocked(true);
    await persistTheme(CHAOS_THEME);
  }, [persistTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, chaosUnlocked, unlockChaos, ready }),
    [theme, setTheme, chaosUnlocked, unlockChaos, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
