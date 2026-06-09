import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { pageTransition } from "./transitions";

type Props = {
  children: ReactNode;
  routeKey: string;
};

/** 路由切换时的页面转场 */
export default function PageTransition({ children, routeKey }: Props) {
  return (
    <motion.div
      key={routeKey}
      className="page-transition"
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      exit={pageTransition.exit}
      transition={pageTransition.transition}
    >
      {children}
    </motion.div>
  );
}
