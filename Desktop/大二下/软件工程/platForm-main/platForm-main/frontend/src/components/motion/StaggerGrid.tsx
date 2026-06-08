import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { staggerContainer, staggerItem } from "./transitions";

type Props = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
};

/** 卡片网格依次入场 */
export default function StaggerGrid({ children, className, as = "div" }: Props) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-8% 0px" }}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}
