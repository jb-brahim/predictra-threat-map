import React from 'react';
import { theme } from '../theme/theme';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  hoverable?: boolean;
}

/**
 * Reusable glassmorphism panel with translucent background, blur, and neon border.
 * Accepts any standard div HTML attributes (onClick, onMouseEnter, etc.).
 */
export function GlassPanel({ children, className, style, hoverable = false, ...rest }: GlassPanelProps) {
  return (
    <div
      className={`glass-panel ${hoverable ? 'glass-panel--hoverable' : ''} ${className || ''}`}
      style={{
        background: theme.colors.panel,
        backdropFilter: `blur(${theme.blur.panel})`,
        WebkitBackdropFilter: `blur(${theme.blur.panel})`,
        border: `1px solid ${theme.colors.panelBorder}`,
        borderRadius: theme.radii.panel,
        padding: theme.spacing.lg,
        fontFamily: theme.fonts.body,
        color: theme.colors.textPrimary,
        transition: theme.transitions.normal,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
