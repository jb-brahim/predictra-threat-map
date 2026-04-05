export const theme = {
  colors: {
    bg: '#050B14',
    bgDeep: '#03070E',
    panel: 'rgba(15, 23, 42, 0.95)',
    panelSolid: '#0F172A',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    panelBorderHover: 'rgba(255, 255, 255, 0.15)',
    exploit: '#EF4444',
    exploitDim: 'rgba(239, 68, 68, 0.2)',
    malware: '#F59E0B',
    malwareDim: 'rgba(245, 158, 11, 0.2)',
    phishing: '#3B82F6',
    phishingDim: 'rgba(59, 130, 246, 0.2)',
    grid: 'rgba(255, 255, 255, 0.03)',
    gridBright: 'rgba(255, 255, 255, 0.06)',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textDim: '#64748B',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    atmosphereGlow: '#0B1221',
    earthBase: '#0F172A',
    earthOutline: 'rgba(255, 255, 255, 0.1)',
  },
  radii: {
    panel: 12,
    chip: 6,
    button: 6,
  },
  blur: {
    panel: '16px',
    heavy: '24px',
  },
  fonts: {
    display: "'Inter', system-ui, sans-serif",
    body: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  transitions: {
    fast: '150ms ease-out',
    normal: '250ms ease-out',
    slow: '400ms ease-out',
  },
} as const;

export type AttackTypeColor = 'exploit' | 'malware' | 'phishing';

export function getAttackColor(type: string): string {
  switch (type) {
    case 'exploit': return theme.colors.exploit;
    case 'malware': return theme.colors.malware;
    case 'phishing': return theme.colors.phishing;
    default: return theme.colors.exploit;
  }
}

export function getAttackColorDim(type: string): string {
  switch (type) {
    case 'exploit': return theme.colors.exploitDim;
    case 'malware': return theme.colors.malwareDim;
    case 'phishing': return theme.colors.phishingDim;
    default: return theme.colors.exploitDim;
  }
}

export function getAttackColorHex(type: string): number {
  switch (type) {
    case 'exploit': return 0xEF4444;
    case 'malware': return 0xF59E0B;
    case 'phishing': return 0x3B82F6;
    default: return 0xEF4444;
  }
}
