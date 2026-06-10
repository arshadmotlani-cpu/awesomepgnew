'use client';

import { motion } from 'framer-motion';

export function EmptyPgList() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="apg-glass rounded-2xl p-12 text-center"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#FF5A1F]/30 bg-[#FF5A1F]/10 text-2xl"
      >
        🏠
      </motion.div>
      <p className="text-lg font-semibold text-[#f4f6f8]">No PGs are accepting bookings yet</p>
      <p className="mt-2 text-sm text-apg-silver">
        New properties will appear here as they become available. Check back soon.
      </p>
    </motion.div>
  );
}
