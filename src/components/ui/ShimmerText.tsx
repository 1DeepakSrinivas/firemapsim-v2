"use client";

import { motion } from "motion/react";
import { Brain, Check, Hammer, X } from "lucide-react";

import { useDarkMode } from "@/hooks/useDarkMode";

export type ShimmerTextState =
  | "in_progress"
  | "complete"
  | "error"
  | "thinking";

type ShimmerTextProps = {
  text: string;
  state: ShimmerTextState;
};

const GREY_LIGHT = "#9CA3AF";
const HIGHLIGHT = "#3b82f6";

export function ShimmerText({ text, state }: ShimmerTextProps) {
  const dark = useDarkMode();
  const chars = text.split("");

  const completeColor = dark ? "#475569" : "#6B7280";
  const errorColor = dark ? "#DC2626" : "#EF4444";

  const animated = state === "in_progress" || state === "thinking";
  const duration = Math.max(text.length, 1) * 0.13;

  const Icon =
    state === "in_progress"
      ? Hammer
      : state === "thinking"
        ? Brain
        : state === "complete"
          ? Check
          : X;

  const settledColor =
    state === "complete" ? completeColor : state === "error" ? errorColor : completeColor;

  return (
    <span className="inline-flex items-center gap-1.5">
      {animated ? (
        <motion.span
          className="inline-flex shrink-0"
          animate={{
            color: [GREY_LIGHT, GREY_LIGHT, HIGHLIGHT, GREY_LIGHT, GREY_LIGHT],
          }}
          transition={{
            duration,
            repeat: Infinity,
            ease: "linear",
            delay: 0,
          }}
        >
          <Icon size={14} />
        </motion.span>
      ) : (
        <span className="inline-flex shrink-0" style={{ color: settledColor }}>
          <Icon size={14} />
        </span>
      )}
      <span className="inline-flex">
        {chars.map((ch, index) =>
          animated ? (
            <motion.span
              key={`${index}-${ch}`}
              animate={{
                color: [GREY_LIGHT, GREY_LIGHT, HIGHLIGHT, GREY_LIGHT, GREY_LIGHT],
              }}
              transition={{
                duration,
                repeat: Infinity,
                ease: "linear",
                delay: index * 0.03,
              }}
            >
              {ch === " " ? "\u00a0" : ch}
            </motion.span>
          ) : (
            <span
              key={`${index}-${ch}`}
              style={{
                color: settledColor,
              }}
            >
              {ch === " " ? "\u00a0" : ch}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
