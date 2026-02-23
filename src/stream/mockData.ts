import type { ThreatEvent, AttackType } from './types';
import { fastId } from '../utils/perf';

const COUNTRIES = [
  { co: 'US', la: 37.751, lo: -97.822 },
  { co: 'CN', la: 35.8617, lo: 104.1954 },
  { co: 'RU', la: 61.524, lo: 105.3188 },
  { co: 'DE', la: 51.1657, lo: 10.4515 },
  { co: 'GB', la: 55.3781, lo: -3.436 },
  { co: 'BR', la: -14.235, lo: -51.9253 },
  { co: 'IN', la: 20.5937, lo: 78.9629 },
  { co: 'JP', la: 36.2048, lo: 138.2529 },
  { co: 'AU', la: -25.2744, lo: 133.7751 },
  { co: 'FR', la: 46.2276, lo: 2.2137 },
  { co: 'KR', la: 35.9078, lo: 127.7669 },
  { co: 'IL', la: 31.0461, lo: 34.8516 },
  { co: 'NL', la: 52.1326, lo: 5.2913 },
  { co: 'SE', la: 60.1282, lo: 18.6435 },
  { co: 'CA', la: 56.1304, lo: -106.3468 },
  { co: 'SG', la: 1.3521, lo: 103.8198 },
  { co: 'ZA', la: -30.5595, lo: 22.9375 },
  { co: 'MX', la: 23.6345, lo: -102.5528 },
  { co: 'TR', la: 38.9637, lo: 35.2433 },
  { co: 'UA', la: 48.3794, lo: 31.1656 },
];

const ATTACK_NAMES: Record<AttackType, string[]> = {
  exploit: [
    'Apache Log4j Remote Code Execution (CVE-2021-44228)',
    'Netis Netcore Router Remote Code Execution',
    'React Server Components Remote Code Execution (CVE-2025-55182)',
    'Sensitive Configuration File Disclosure',
    'Command Injection Over HTTP',
    'HTTP Request Smuggling',
    'Web Server Exposed Git Repository Information Disclosure',
    'TP-Link Archer AX21 Command Injection (CVE-2023-1389)',
    'SQL Injection Attack',
    'Cross-Site Scripting Obfuscation Techniques',
  ],
  malware: [
    'dga-4Qp38.TC.322fjvKz',
    'PUA.TC.1d94tUrV',
    'Trojan.GenericKD.47893',
    'Ransomware.WannaCry.Gen',
    'Backdoor.Agent.Generic',
    'Cryptominer.XMRig.Gen',
  ],
  phishing: [
    'Phishing URL Detected',
    'Credential Harvesting Attempt',
    'Suspicious Login Page',
    'Brand Impersonation Detected',
    'Social Engineering Attack',
  ],
};

const ATTACK_TYPES: AttackType[] = ['exploit', 'malware', 'phishing'];
const TYPE_WEIGHTS = [0.65, 0.25, 0.1]; // exploit is most common

function weightedRandomType(): AttackType {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < TYPE_WEIGHTS.length; i++) {
    cumulative += TYPE_WEIGHTS[i];
    if (r <= cumulative) return ATTACK_TYPES[i];
  }
  return 'exploit';
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(value: number, range: number): number {
  return value + (Math.random() - 0.5) * range;
}

export function generateMockEvent(): ThreatEvent {
  const type = weightedRandomType();
  const source = randomFrom(COUNTRIES);
  let dest = randomFrom(COUNTRIES);
  // 30% chance same country attack
  if (Math.random() < 0.3) dest = source;

  return {
    id: fastId(),
    a_c: Math.floor(Math.random() * 15) + 1,
    a_n: randomFrom(ATTACK_NAMES[type]),
    a_t: type,
    s_co: source.co,
    s_la: jitter(source.la, 5),
    s_lo: jitter(source.lo, 5),
    d_co: dest.co,
    d_la: jitter(dest.la, 5),
    d_lo: jitter(dest.lo, 5),
    severity: (Math.floor(Math.random() * 5) + 1) as 1 | 2 | 3 | 4 | 5,
    ts: new Date().toISOString(),
  };
}

export function generateMockBatch(count: number = 3): ThreatEvent[] {
  const events: ThreatEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push(generateMockEvent());
  }
  return events;
}

/**
 * Starts a mock event stream that calls onEvents at regular intervals
 */
export function startMockStream(
  onEvents: (events: ThreatEvent[]) => void,
  intervalMs: number = 800
): () => void {
  const id = setInterval(() => {
    const batchSize = Math.floor(Math.random() * 4) + 1;
    onEvents(generateMockBatch(batchSize));
  }, intervalMs);

  return () => clearInterval(id);
}
