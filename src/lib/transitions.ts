export const springPanel = { type: "spring" as const, damping: 20, stiffness: 100 };
export const springFast = { type: "spring" as const, damping: 25, stiffness: 200 };

export const slideFromRight = {
  initial: { x: "120%" },
  animate: { x: 0 },
  exit: { x: "120%" },
  transition: springPanel,
};

export const slideFromBottom = {
  initial: { y: "120%" },
  animate: { y: 0 },
  exit: { y: "120%" },
  transition: springPanel,
};

export const dialogMotion = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: springFast,
};
