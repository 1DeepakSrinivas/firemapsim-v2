"use client";

import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { mode, resolvedTheme, setMode } = useTheme();

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  function handleToggle() {
    // Default is system; toggling should create an explicit override without exposing a "system" option.
    if (mode === "system") {
      setMode(isDark ? "light" : "dark");
      return;
    }
    setMode(mode === "dark" ? "light" : "dark");
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      className={cn(
        "h-6 w-6 border-stroke-secondary/40 bg-card text-muted-foreground hover:bg-muted hover:text-foreground sm:h-7 sm:w-7",
        className,
      )}
      aria-label={label}
      title={mode === "system" ? `${label} (system default)` : label}
    >
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </Button>
  );
}
