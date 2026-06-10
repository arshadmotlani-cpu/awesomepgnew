'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function MotionReveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionPgGrid({ children }: { children: ReactNode }) {
  return (
    <motion.ul
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06 } },
      }}
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {children}
    </motion.ul>
  );
}

export function MotionPgGridItem({ children }: { children: ReactNode }) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
      }}
    >
      {children}
    </motion.li>
  );
}
