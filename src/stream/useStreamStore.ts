import { create } from 'zustand';
import type { ThreatEvent, CounterData, ConnectionStatus, TypeDistribution, ArcData, MarkerData } from './types';
import { RingBuffer, perfTelemetry, fastId } from '../utils/perf';
import { latLonToVector3 } from '../utils/geo';
import { startMockStream } from './mockData';

const MAX_EVENTS = 10000;
const MAX_ARCS = 150;
const MAX_MARKERS = 300;
const ARC_DURATION = 5000; // ms — longer for better visibility
const MARKER_DURATION = 6000; // ms

interface StreamState {
  // Connection
  status: ConnectionStatus;
  reconnectAttempts: number;

  // Events
  eventBuffer: RingBuffer<ThreatEvent>;
  recentEvents: ThreatEvent[];

  // Counter
  counterData: CounterData | null;
  totalAttacks: number;
  attacksPerSecond: number;

  // Type distribution
  typeDistribution: TypeDistribution;

  // Active visual elements
  arcs: ArcData[];
  markers: MarkerData[];

  // Derived count for UI (avoids subscribing to entire arcs array)
  activeArcCount: number;

  // Config flags
  config: {
    rotation: boolean;
    trails: boolean;
    reducedMotion: boolean;
    heatmapMode: boolean;
    audioAlerts: boolean;
    audioVolume: number;
    qualityPreset: 'low' | 'high' | 'cinematic';
    showPerfOverlay: boolean;
  };

  // Actions
  addEvents: (events: ThreatEvent[]) => void;
  updateCounter: (data: CounterData) => void;
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnect: () => void;
  tick: (now: number) => void;
  setConfig: (key: string, value: unknown) => void;
  initStream: () => void;
  _cleanup: (() => void) | null;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  eventBuffer: new RingBuffer<ThreatEvent>(MAX_EVENTS),
  recentEvents: [],
  counterData: null,
  totalAttacks: 0,
  attacksPerSecond: 0,
  typeDistribution: { exploit: 0, malware: 0, phishing: 0 },
  arcs: [],
  markers: [],
  activeArcCount: 0,
  config: {
    rotation: true,
    trails: true,
    reducedMotion: false,
    heatmapMode: false,
    audioAlerts: false,
    audioVolume: 0.3,
    qualityPreset: 'high',
    showPerfOverlay: false,
  },
  _cleanup: null,

  addEvents: (events: ThreatEvent[]) => {
    const state = get();
    const buffer = state.eventBuffer;
    buffer.pushMany(events);

    const now = Date.now();
    const newArcs: ArcData[] = [];
    const newMarkers: MarkerData[] = [];

    for (const event of events) {
      perfTelemetry.recordEvent();

      // Create arc
      if (state.arcs.length + newArcs.length < MAX_ARCS) {
        const sourcePos = latLonToVector3(event.s_la, event.s_lo);
        const targetPos = latLonToVector3(event.d_la, event.d_lo);

        newArcs.push({
          id: event.id || fastId(),
          sourcePos,
          targetPos,
          sourceLat: event.s_la,
          sourceLon: event.s_lo,
          targetLat: event.d_la,
          targetLon: event.d_lo,
          attackType: event.a_t,
          attackName: event.a_n,
          sourceCo: event.s_co,
          targetCo: event.d_co,
          startTime: now + Math.random() * 200, // slight jitter
          duration: ARC_DURATION + Math.random() * 1000,
          progress: 0,
          active: true,
        });
      } else {
        perfTelemetry.stats.droppedEvents++;
      }

      // Source marker
      if (state.markers.length + newMarkers.length < MAX_MARKERS) {
        newMarkers.push({
          id: `src-${event.id || fastId()}`,
          position: latLonToVector3(event.s_la, event.s_lo),
          attackType: event.a_t,
          startTime: now,
          duration: MARKER_DURATION,
          progress: 0,
          active: true,
          isSource: true,
        });
      }

      // Destination marker
      if (state.markers.length + newMarkers.length < MAX_MARKERS) {
        newMarkers.push({
          id: `dst-${event.id || fastId()}`,
          position: latLonToVector3(event.d_la, event.d_lo),
          attackType: event.a_t,
          startTime: now + ARC_DURATION * 0.7,
          duration: MARKER_DURATION,
          progress: 0,
          active: true,
          isSource: false,
        });
      }
    }

    // Update type distribution
    const dist = { ...state.typeDistribution };
    for (const e of events) {
      if (e.a_t in dist) {
        dist[e.a_t as keyof TypeDistribution]++;
      }
    }

    const allArcs = state.arcs.concat(newArcs);
    const allMarkers = state.markers.concat(newMarkers);

    set({
      recentEvents: buffer.getRecent(10),
      arcs: allArcs,
      markers: allMarkers,
      activeArcCount: allArcs.length,
      typeDistribution: dist,
      totalAttacks: state.totalAttacks + events.length,
    });

    perfTelemetry.stats.bufferSize = buffer.size;
  },

  updateCounter: (data: CounterData) => {
    set({ counterData: data });
  },

  setStatus: (status: ConnectionStatus) => {
    set({ status });
  },

  incrementReconnect: () => {
    set(s => {
      perfTelemetry.stats.reconnectAttempts = s.reconnectAttempts + 1;
      return { reconnectAttempts: s.reconnectAttempts + 1 };
    });
  },

  tick: (now: number) => {
    const state = get();
    let arcsChanged = false;
    let markersChanged = false;

    // Update arc progress in-place, detect expired
    const arcs = state.arcs;
    for (let i = arcs.length - 1; i >= 0; i--) {
      const arc = arcs[i];
      const elapsed = now - arc.startTime;
      if (elapsed > arc.duration + 2000) {
        arcs.splice(i, 1);
        arcsChanged = true;
      } else {
        arc.progress = Math.min(elapsed / arc.duration, 1);
      }
    }

    // Update marker progress in-place, detect expired
    const markers = state.markers;
    for (let i = markers.length - 1; i >= 0; i--) {
      const marker = markers[i];
      const elapsed = now - marker.startTime;
      if (elapsed > marker.duration) {
        markers.splice(i, 1);
        markersChanged = true;
      } else if (elapsed < 0) {
        marker.progress = 0;
      } else {
        marker.progress = elapsed / marker.duration;
      }
    }

    perfTelemetry.stats.activeArcs = arcs.length;
    perfTelemetry.stats.activeMarkers = markers.length;

    // Only trigger React re-render when items are actually added/removed
    if (arcsChanged || markersChanged) {
      set({
        arcs: [...arcs],
        markers: [...markers],
        activeArcCount: arcs.length,
      });
    }
  },

  setConfig: (key: string, value: unknown) => {
    set(s => ({
      config: { ...s.config, [key]: value },
    }));
  },

  initStream: () => {
    const state = get();
    if (state._cleanup) state._cleanup();

    const apiUrl = import.meta.env.VITE_API_URL || '/api/feed';
    const mockMode = import.meta.env.VITE_MOCK_MODE === 'true';

    if (mockMode) {
      set({ status: 'live' });
      const cleanup = startMockStream((events) => {
        get().addEvents(events);
      }, 600);
      set({ _cleanup: cleanup });
      return;
    }

    // SSE connection with exponential backoff
    let reconnectDelay = 1000;
    let eventSource: EventSource | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      set({ status: 'reconnecting' });

      try {
        eventSource = new EventSource(apiUrl);

        eventSource.onopen = () => {
          set({ status: 'live' });
          reconnectDelay = 1000;
        };

        eventSource.addEventListener('attack', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            // Validate and normalize
            if (!data.a_t || !data.s_la || !data.s_lo || !data.d_la || !data.d_lo) return;

            const event: ThreatEvent = {
              id: fastId(),
              a_c: data.a_c || 1,
              a_n: String(data.a_n || 'Unknown').slice(0, 200),
              a_t: (['exploit', 'malware', 'phishing'].includes(data.a_t) ? data.a_t : 'exploit') as ThreatEvent['a_t'],
              s_co: String(data.s_co || '??').slice(0, 2).toUpperCase(),
              s_la: Math.max(-90, Math.min(90, Number(data.s_la) || 0)),
              s_lo: Math.max(-180, Math.min(180, Number(data.s_lo) || 0)),
              d_co: String(data.d_co || '??').slice(0, 2).toUpperCase(),
              d_la: Math.max(-90, Math.min(90, Number(data.d_la) || 0)),
              d_lo: Math.max(-180, Math.min(180, Number(data.d_lo) || 0)),
              ts: new Date().toISOString(),
            };

            get().addEvents([event]);
          } catch {
            // discard malformed events
          }
        });

        eventSource.addEventListener('counter', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.recentPeriod && data.today !== undefined) {
              get().updateCounter(data);
            }
          } catch {
            // discard
          }
        });

        eventSource.onerror = () => {
          eventSource?.close();
          if (destroyed) return;
          get().incrementReconnect();
          set({ status: 'reconnecting' });

          // Exponential backoff with jitter
          const jitter = Math.random() * 1000;
          setTimeout(connect, reconnectDelay + jitter);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };
      } catch {
        // If EventSource constructor fails, fall back to mock mode
        set({ status: 'live' });
        const cleanup = startMockStream((events) => {
          get().addEvents(events);
        }, 600);
        set({ _cleanup: cleanup });
      }
    };

    connect();

    const cleanup = () => {
      destroyed = true;
      eventSource?.close();
    };

    set({ _cleanup: cleanup });
  },
}));
