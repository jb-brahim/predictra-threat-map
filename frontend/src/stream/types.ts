export type AttackType = 'exploit' | 'malware' | 'phishing';

export type ConnectionStatus = 'live' | 'reconnecting' | 'paused' | 'disconnected';

export interface ThreatEvent {
  id: string;
  _id?: string;
  a_c: number;
  a_n: string;
  a_t: AttackType;
  s_co: string;
  s_la: number;
  s_lo: number;
  d_co: string;
  d_la: number;
  d_lo: number;
  s_ip?: string;
  d_ip?: string;
  source_api?: string;
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
