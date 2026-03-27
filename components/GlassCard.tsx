import React from 'react';
import { motion } from 'motion/react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'button';
  [x: string]: any; // Allow other props like 'key'
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', onClick, as = 'div', ...props }) => {
  const baseClasses = "backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl transition-all duration-300";
  const hoverClasses = onClick ? "hover:bg-white/10 hover:border-primary/50 cursor-pointer" : "";
  
  const combinedClasses = `${baseClasses} ${hoverClasses} ${className}`;

  const Component = as === 'button' ? motion.button : motion.div;

  return (
    <Component 
      className={combinedClasses} 
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02, translateY: -4 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      {...props}
    >
      {children}
    </Component>
  );
};
