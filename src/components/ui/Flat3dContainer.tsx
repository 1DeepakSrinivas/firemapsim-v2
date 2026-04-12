"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";

type Flat3dContainerProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Flat3dContainer({ children, className, style }: Flat3dContainerProps) {
  const dark = useDarkMode();

  const surface: CSSProperties = dark
    ? {
        background: "linear-gradient(to bottom, rgb(38,38,38), rgb(20,20,20))",
        boxShadow:
          "0px 1px 0px 0px rgba(0,0,0,0.2), 0 4px 6px 0 rgba(0,0,0,0.20)",
        borderRadius: "8px",
      }
    : {
        background: "linear-gradient(to bottom, #FAFAFA, #F0F0F0)",
        boxShadow: "0px 1px 0px 0px #e8e8e8, 0 4px 6px 0 rgba(0,0,0,0.35)",
        borderRadius: "8px",
      };

  return (
    <motion.div className={cn(className)} style={{ ...surface, ...style }}>
      {children}
    </motion.div>
  );
}
