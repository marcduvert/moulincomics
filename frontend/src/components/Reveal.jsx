import { motion } from "framer-motion";

export const Reveal = ({ children, delay = 0, className = "" }) => (
  <motion.div
    className={className}
    initial={{ y: 40, opacity: 0 }}
    whileInView={{ y: 0, opacity: 1 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export const LineReveal = ({ lines, className = "" }) => (
  <span className={className}>
    {lines.map((line, i) => (
      <span key={i} className="block overflow-hidden">
        <motion.span
          className="block"
          initial={{ y: "110%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.85, delay: 0.15 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          {line}
        </motion.span>
      </span>
    ))}
  </span>
);
