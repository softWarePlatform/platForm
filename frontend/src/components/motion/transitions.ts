/** 与 tubik / 高端落地页相近的缓动曲线 */
export const easeOutExpo = [0.22, 1, 0.36, 1] as const;
export const easeInOut = [0.45, 0, 0.55, 1] as const;

export const pageTransition = {
  initial: { opacity: 0, y: 14, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(2px)" },
  transition: { duration: 0.38, ease: easeOutExpo },
};

export const revealUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: easeOutExpo },
  },
};
