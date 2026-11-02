import React, { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform, animate } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

export function AnimatedCounter({ value, className = '', prefix = '', suffix = '', duration = 0.8 }: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}{display.toLocaleString('en-IN')}{suffix}
    </span>
  );
}
