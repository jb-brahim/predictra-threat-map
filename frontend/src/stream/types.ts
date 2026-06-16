// ─── THREAT STREAM DATA SCHEMAS ──────────────────────────────────────────────
// Defines TS interfaces and types mapping the websocket/SSE payloads,
// live visual geometries, and store distributions.

export type AttackType = 'exploit' | 'malware' | 'phishing';

export type ConnectionStatus = 'live' | 'reconnecting' | 'paused' | 'disconnected';

// ─── THREAT EVENT DATA STRUCTURE ─────────────────────────────────────────────
// The main event schema representing individual cyber attack logs.
export interface ThreatEvent {
  id: string;
  _id?: string;
  a_c: number; // Attack count
  a_n: string; // Attack name
  a_t: AttackType; // Attack type
  s_co: string; // Source country
  s_la: number; // Source latitude
  s_lo: number; // Source longitude
  d_co: string; // Destination country
  d_la: number; // Destination latitude
  d_lo: number; // Destination longitude
  s_ip?: string; // Source IP
  d_ip?: string; // Destination IP
  source_api?: string; // Scraper source identifier (e.g. urlhaus)
  severity?: 1 | 2 | 3 | 4 | 5;
  ts?: string;
  timestamp?: string | Date;
  meta?: {
    malware_family?: string;
    tags?: string[];
    port?: number | string;
    as_name?: string;
    as_number?: string;
    confidence?: number;
    url?: string;
    vulnerability?: string;
    threat_type?: string;
    [key: string]: any;
  };
}

export interface CounterData {
  recentPeriod: number[];
  today: number;
}

export interface StreamWorkerMessage {
  type: 'events' | 'counter' | 'status' | 'error';
  events?: ThreatEvent[];
  counter?: CounterData;
  status?: ConnectionStatus;
  error?: string;
}

export interface StreamWorkerCommand {
  type: 'connect' | 'disconnect' | 'setMockMode';
  url?: string;
  mockMode?: boolean;
}

// ─── ACTIVE GEOMETRY SCHEMAS ──────────────────────────────────────────────────
// Maps details required by WebGL lines and points to animate and update frames.
export interface ArcData {
  id: string;
  sourcePos: [number, number, number];
  targetPos: [number, number, number];
  sourceLat: number;
  sourceLon: number;
  targetLat: number;
  targetLon: number;
  attackType: AttackType;
  attackName: string;
  sourceCo: string;
  targetCo: string;
  startTime: number;
  duration: number;
  progress: number;
  active: boolean;
}

export interface MarkerData {
  id: string;
  position: [number, number, number];
  lat: number;
  lon: number;
  attackType: AttackType;
  startTime: number;
  duration: number;
  progress: number;
  active: boolean;
  isSource: boolean;
}

export interface TypeDistribution {
  exploit: number;
  malware: number;
  phishing: number;
}
