"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";

type GlassyPaneProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function GlassyPane({ children, className, style }: GlassyPaneProps) {
  const dark = useDarkMode();

  const surface: CSSProperties = dark
    ? {
        background: "rgba(23,23,23,0.55)",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.05) inset, 0 4px 8px rgba(0,0,0,0.55)",
        borderRadius: "8px",
      }
    : {
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(8px)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 8px rgba(0,0,0,0.25)",
        borderRadius: "8px",
      };

  return (
    <motion.div className={cn(className)} style={{ ...surface, ...style }}>
      {children}
    </motion.div>
  );
}
