export const theme = {
  colors: {
    bg: '#05080F',
    bgDeep: '#020408',
    panel: 'rgba(10, 16, 24, 0.55)',
    panelSolid: '#0A1018',
    panelBorder: 'rgba(0, 224, 255, 0.25)',
    panelBorderHover: 'rgba(0, 224, 255, 0.5)',
    exploit: '#00D1FF',
    exploitDim: 'rgba(0, 209, 255, 0.3)',
    malware: '#FF3737',
    malwareDim: 'rgba(255, 55, 55, 0.3)',
    phishing: '#FF8A00',
    phishingDim: 'rgba(255, 138, 0, 0.3)',
    grid: 'rgba(0, 255, 255, 0.03)',
    gridBright: 'rgba(0, 255, 255, 0.06)',
    textPrimary: '#E6F1FF',
    textSecondary: '#B0C4DE',
    textDim: '#5A7A94',
    success: '#00FF88',
    warning: '#FFD700',
    danger: '#FF4444',
    atmosphereGlow: '#00A8FF',
    earthBase: '#0A1628',
    earthOutline: 'rgba(0, 180, 255, 0.15)',
  },
  radii: {
    panel: 24,
    chip: 12,
    button: 8,
  },
  blur: {
    panel: '14px',
    heavy: '24px',
  },
  fonts: {
    display: "'Orbitron', 'Rajdhani', 'Inter', system-ui, sans-serif",
    body: "'Rajdhani', 'Inter', system-ui, sans-serif",
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
    case 'exploit': return 0x00D1FF;
    case 'malware': return 0xFF3737;
    case 'phishing': return 0xFF8A00;
    default: return 0x00D1FF;
  }
}
