"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";

type Container3DProps = {
  children: ReactNode;
  className?: string;
  color?: string;
  style?: CSSProperties;
};

export function Container3D({ children, className, color, style }: Container3DProps) {
  const dark = useDarkMode();

  const lightStyle: CSSProperties = {
    border: "3px solid white",
    background: color ? `${color}80` : "rgba(250, 249, 245, 0.5)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    willChange: "transform, backdrop-filter",
    boxShadow:
      "0px 2px 0px 0px #e8e6e0, -12px 18px 16px 0px rgba(0,0,0,0.14), -6px 10px 8px 0px rgba(0,0,0,0.14), -2px 4px 3px 0px rgba(0,0,0,0.15), inset -1px 2px 3px 0px rgba(0,0,0,0.12)",
  };

  const darkStyle: CSSProperties = {
    border: "3px solid rgb(55,65,81)",
    background: "rgba(0,0,0,0.4)",
    backdropFilter: "blur(12px)",
    borderRadius: "12px",
    willChange: "transform, backdrop-filter",
    boxShadow:
      "0px 2px 0px 0px rgba(0,0,0,0.8), -12px 18px 16px 0px rgba(0,0,0,0.4), -6px 10px 8px 0px rgba(0,0,0,0.4), -2px 4px 3px 0px rgba(0,0,0,0.3), inset -1px 2px 3px 0px rgba(255,255,255,0.05)",
  };

  return (
    <motion.div
      className={cn(className)}
      style={{ ...style, ...(dark ? darkStyle : lightStyle) }}
    >
      {children}
    </motion.div>
  );
}
