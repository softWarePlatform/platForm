import { motion, useInView, type HTMLMotionProps } from "framer-motion";
import { useRef } from "react";
import { easeOutExpo, revealUp } from "./transitions";

type Props = HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
  once?: boolean;
};

/** 滚动进入视口时渐入（参考 scroll-driven reveal） */
export default function Reveal({
  children,
  delay = 0,
  y = 28,
  once = true,
  className,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-10% 0px -6% 0px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ ...revealUp.hidden, y }}
      animate={inView ? { ...revealUp.visible, y: 0 } : { ...revealUp.hidden, y }}
      transition={{ duration: 0.62, delay, ease: easeOutExpo }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
