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

export const THEME_STORAGE_KEY = "theme";
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_INIT_SCRIPT = `(() => {
  try {
    const key = "${THEME_STORAGE_KEY}";
    const raw = localStorage.getItem(key);
    const mode = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = mode === "dark" || (mode === "system" && prefersDark) ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-mode", mode);
  } catch {}
})();`;

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-mode", mode);
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial = isThemeMode(stored) ? stored : "system";
    setModeState(initial);
    setResolvedTheme(applyTheme(initial));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      setModeState((current) => {
        if (current === "system") {
          setResolvedTheme(applyTheme("system"));
        }
        return current;
      });
    };
    media.addEventListener("change", handleMediaChange);
    return () => media.removeEventListener("change", handleMediaChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setModeState(next);
    setResolvedTheme(applyTheme(next));
  }, []);

  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
