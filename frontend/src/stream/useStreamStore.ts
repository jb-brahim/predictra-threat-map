import { create } from 'zustand';
import type { ThreatEvent, CounterData, ConnectionStatus, TypeDistribution, ArcData, MarkerData } from './types';
import { RingBuffer, perfTelemetry, fastId } from '../utils/perf';
import { latLonToVector3 } from '../utils/geo';

const MAX_EVENTS = 10000;
const MAX_ARCS = 150;
const MAX_MARKERS = 300;
const ARC_DURATION = 5000; // ms — longer for better visibility
const MARKER_DURATION = 6000; // ms

// --- Layer 3 Mutable State (Throttled Analytics Flush) ---
let lastAnalyticsFlush = 0;
let lastRecentEventsFlush = 0;
const pendingType = { exploit: 0, malware: 0, phishing: 0 };
const pendingVector: Record<string, number> = {};
const pendingOrigin: Record<string, number> = {};
const pendingTarget: Record<string, number> = {};
const pendingCorridor: Record<string, number> = {};
const pendingApi: Record<string, number> = {};
let pendingTotal = 0;

interface StreamState {
  // Connection
  status: ConnectionStatus;
  reconnectAttempts: number;

  // Navigation
  currentView: 'map' | 'history' | 'dashboard' | 'country' | 'analytics' | 'stix';
  selectedCountry: { name: string; code: string } | null;
  historySearch: { q: string; ip: string };

  // Events
  eventBuffer: RingBuffer<ThreatEvent>;
  recentEvents: ThreatEvent[];

  // Counter
  counterData: CounterData | null;
  totalAttacks: number;
  attacksPerSecond: number;

  // Type distribution
  typeDistribution: TypeDistribution;
  vectorDistribution: Record<string, number>;
  originDistribution: Record<string, number>;
  targetDistribution: Record<string, number>;
  corridorDistribution: Record<string, number>;
  sourceApiDistribution: Record<string, number>;
  trendData: number[]; // 10-second buckets
  lastTrendTime: number;

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

  projectionMode: '3d' | '2d';

  // Actions
  addEvents: (events: ThreatEvent[]) => void;
  updateCounter: (data: CounterData) => void;
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnect: () => void;
  tick: (now: number) => void;
  setConfig: (key: string, value: unknown) => void;
  setView: (view: 'map' | 'history' | 'dashboard' | 'country' | 'analytics' | 'stix') => void;
  setSelectedCountry: (co: { name: string; code: string } | null) => void;
  setHistorySearch: (search: { q: string, ip: string }) => void;
  setProjectionMode: (mode: '3d' | '2d') => void;
  initStream: () => void;
  _cleanup: (() => void) | null;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  projectionMode: '3d',
  currentView: 'map',
  selectedCountry: null,
  historySearch: { q: '', ip: '' },
  eventBuffer: new RingBuffer<ThreatEvent>(MAX_EVENTS),
  recentEvents: [],
  counterData: null,
  totalAttacks: 0,
  attacksPerSecond: 0,
  typeDistribution: { exploit: 0, malware: 0, phishing: 0 },
  vectorDistribution: {},
  originDistribution: {},
  targetDistribution: {},
  corridorDistribution: {},
  sourceApiDistribution: {},
  trendData: Array(60).fill(0),
  lastTrendTime: Date.now(),
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

  /**
   * Action: Ingests an incoming batch of threat events.
   * Runs three critical pipelines:
   *  1. Injects raw events into the 10,000 capacity circular history buffer.
   *  2. Visual sampling: Evaluates client-side frame rates (FPS) and dynamically drops visual arcs/markers to save GPU cycles.
   *  3. Analytics aggregation: Stores counters in temporary local variables to throttle React state renders.
   */
  addEvents: (events: ThreatEvent[]) => {
    const state = get();
    const buffer = state.eventBuffer;
    
    // 1. Store all events immediately in the memory buffer (no sampling here, stats remain accurate)
    buffer.pushMany(events);

    const now = Date.now();
    const newArcs: ArcData[] = [];
    const newMarkers: MarkerData[] = [];

    // 2. Performance Guard (Adaptive Visual Sampling):
    // Check client-side frame rate (FPS). If the system is lagging, reduce the number of 3D elements rendered.
    const fps = perfTelemetry.stats.fps;
    let visualEvents = events;
    if (fps < 30) {
      // Lagging state (below 30 FPS): Drop 66% of visual arcs, keep only 1 in 3 events
      visualEvents = events.filter((_, i) => i % 3 === 0);
    } else if (fps < 45) {
      // Warning state (30 to 45 FPS): Drop 50% of visual arcs, keep only 1 in 2 events
      visualEvents = events.filter((_, i) => i % 2 === 0);
    }

    // Loop through the selected visual events and construct WebGL geometries
    for (const event of visualEvents) {
      perfTelemetry.recordEvent(); // Update telemetry counters

      // Construct and position the 3D flying arc curve
      if (state.arcs.length + newArcs.length < MAX_ARCS) {
        // Map latitude/longitude to 3D Cartesian Vector coordinates on the sphere
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
          startTime: now + Math.random() * 200, // Apply minor startup jitter to stagger rendering
          duration: ARC_DURATION + Math.random() * 1000, // Stagger arc flight time slightly
          progress: 0,
          active: true,
        });
      } else {
        // Track dropped visuals (when cap is hit)
        perfTelemetry.stats.droppedEvents++;
      }

      // Construct the Source Marker (glow at attack origin location)
      if (state.markers.length + newMarkers.length < MAX_MARKERS) {
        newMarkers.push({
          id: `src-${event.id || fastId()}`,
          position: latLonToVector3(event.s_la, event.s_lo),
          lat: event.s_la,
          lon: event.s_lo,
          attackType: event.a_t,
          startTime: now,
          duration: MARKER_DURATION,
          progress: 0,
          active: true,
          isSource: true,
        });
      }

      // Construct the Destination Marker (glow at victim target location).
      // Starts with a delay matching 70% of the arc's flight time to align with visual impact.
      if (state.markers.length + newMarkers.length < MAX_MARKERS) {
        newMarkers.push({
          id: `dst-${event.id || fastId()}`,
          position: latLonToVector3(event.d_la, event.d_lo),
          lat: event.d_la,
          lon: event.d_lo,
          attackType: event.a_t,
          startTime: now + ARC_DURATION * 0.7,
          duration: MARKER_DURATION,
          progress: 0,
          active: true,
          isSource: false,
        });
      }
    }

    const allArcs = state.arcs.concat(newArcs);
    const allMarkers = state.markers.concat(newMarkers);

    // Build the partial state object to update Zustand store
    const nextState: Partial<StreamState> = {
      arcs: allArcs,
      markers: allMarkers,
      activeArcCount: allArcs.length,
    };

    // 3. UI Throttling (Log Feed):
    // Only update the recent events visual list in the UI every 500ms to avoid thrashing React DOM threads.
    if (now - lastRecentEventsFlush > 500) {
      nextState.recentEvents = buffer.getRecent(40); // Select last 40 threats to display in UI feed
      lastRecentEventsFlush = now;
    }

    // 4. Analytics Accumulation:
    // Stash incoming metrics in out-of-store local variables. This avoids running React state commits
    // dozens of times per second. We flush these aggregated values in a single commit once per second.
    pendingTotal += events.length;
    for (const e of events) {
      if (e.a_t in pendingType) pendingType[e.a_t as keyof TypeDistribution]++;
      
      // For IP-only sources, prioritize showing organization in Vector list
      const vName = String(e.meta?.organization || e.a_n || 'Unknown').trim();
      pendingVector[vName] = (pendingVector[vName] || 0) + 1;
      
      const sCo = String(e.s_co || '??').toUpperCase();
      pendingOrigin[sCo] = (pendingOrigin[sCo] || 0) + 1;
      
      const dCo = String(e.d_co || '??').toUpperCase();
      pendingTarget[dCo] = (pendingTarget[dCo] || 0) + 1;

      const corridor = `${sCo}-${dCo}`;
      pendingCorridor[corridor] = (pendingCorridor[corridor] || 0) + 1;
      
      const api = String(e.source_api || 'unknown');
      pendingApi[api] = (pendingApi[api] || 0) + 1;
    }

    // Trend calculation
    let currentTrend = [...state.trendData];
    let lastTime = state.lastTrendTime;
    const intervalsElapsed = Math.floor((now - lastTime) / 10000);
    if (intervalsElapsed > 0) {
      const empty = Array(Math.min(intervalsElapsed, 60)).fill(0);
      currentTrend = [...empty, ...currentTrend].slice(0, 60);
      lastTime += intervalsElapsed * 10000;
    }
    currentTrend[0] += events.length;
    nextState.trendData = currentTrend;
    nextState.lastTrendTime = lastTime;

    // Flush analytics to Zustand only every 1s
    if (now - lastAnalyticsFlush > 1000) {
      const state = get();
      const mergeDist = (target: Record<string, number>, source: Record<string, number>) => {
        const out = { ...target };
        for (const k in source) out[k] = (out[k] || 0) + source[k];
        return out;
      };

      nextState.typeDistribution = {
        exploit: state.typeDistribution.exploit + pendingType.exploit,
        malware: state.typeDistribution.malware + pendingType.malware,
        phishing: state.typeDistribution.phishing + pendingType.phishing,
      };
      pendingType.exploit = 0; pendingType.malware = 0; pendingType.phishing = 0;

      nextState.vectorDistribution = mergeDist(state.vectorDistribution, pendingVector);
      for (const k in pendingVector) delete pendingVector[k];

      nextState.originDistribution = mergeDist(state.originDistribution, pendingOrigin);
      for (const k in pendingOrigin) delete pendingOrigin[k];

      nextState.targetDistribution = mergeDist(state.targetDistribution, pendingTarget);
      for (const k in pendingTarget) delete pendingTarget[k];

      nextState.corridorDistribution = mergeDist(state.corridorDistribution, pendingCorridor);
      for (const k in pendingCorridor) delete pendingCorridor[k];

      nextState.sourceApiDistribution = mergeDist(state.sourceApiDistribution, pendingApi);
      for (const k in pendingApi) delete pendingApi[k];

      nextState.totalAttacks = state.totalAttacks + pendingTotal;
      pendingTotal = 0;

      lastAnalyticsFlush = now;
    }

    set(nextState);
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

  setView: (view: 'map' | 'history' | 'dashboard' | 'country' | 'analytics' | 'stix') => {
    set({ currentView: view });
  },

  setSelectedCountry: (co) => {
    set({ selectedCountry: co });
  },

  setHistorySearch: (search: { q: string, ip: string }) => {
    set({ historySearch: search });
  },

  setProjectionMode: (mode) => set({ projectionMode: mode }),

  /**
   * Action: Establishes a connection to the backend Server-Sent Events (SSE) feed.
   * Handles initialization, data parsing, payload validation, metrics updates,
   * exponential reconnect loops with network jitter protection, and unmount cleanups.
   */
  initStream: () => {
    const state = get();
    // 1. Double Inits Guard: If an active connection/cleanup hook is already active, dispose of it first.
    if (state._cleanup) state._cleanup();

    // Determine target API URL using Vite environment VITE_API_URL or fallback to local path
    const apiUrl = import.meta.env.VITE_API_URL || '/api/feed';

    // State parameters for connection management
    let reconnectDelay = 1000;         // Starting retry delay of 1s (1000ms)
    let eventSource: EventSource | null = null;
    let destroyed = false;              // Lock flag to check if component has unmounted

    // Asynchronous connector function
    const connect = () => {
      if (destroyed) return; // Stop if store connection has been disposed
      set({ status: 'reconnecting' });

      try {
        // Instantiate the HTML5 EventSource connection pointing to the backend
        eventSource = new EventSource(apiUrl);

        // Bind connection success listener
        eventSource.onopen = () => {
          set({ status: 'live' });
          reconnectDelay = 1000; // Reset reconnection delay to 1s on success
        };

        // Bind the main real-time threat feed event listener ('attacks')
        eventSource.addEventListener('attacks', (e: MessageEvent) => {
          try {
            const batch = JSON.parse(e.data);
            if (!Array.isArray(batch)) return;

            const validEvents: ThreatEvent[] = [];
            // Parse and sanitize every event record in the incoming batch
            for (const data of batch) {
              // Ignore records missing core characteristics (e.g. types, coordinates)
              if (!data.a_t || 
                  data.s_la === undefined || data.s_lo === undefined || 
                  data.d_la === undefined || data.d_lo === undefined) continue;

              validEvents.push({
                id: fastId(), // Generate short local execution ID
                a_c: data.a_c || 1,
                a_n: String(data.a_n || 'Unknown').slice(0, 200), // Slice strings to protect memory
                a_t: (['exploit', 'malware', 'phishing'].includes(data.a_t) ? data.a_t : 'exploit') as ThreatEvent['a_t'],
                s_co: String(data.s_co || '??').slice(0, 2).toUpperCase(),
                s_la: Math.max(-90, Math.min(90, Number(data.s_la) || 0)), // Clamp coordinates to legal limits
                s_lo: Math.max(-180, Math.min(180, Number(data.s_lo) || 0)),
                d_co: String(data.d_co || '??').slice(0, 2).toUpperCase(),
                d_la: Math.max(-90, Math.min(90, Number(data.d_la) || 0)),
                d_lo: Math.max(-180, Math.min(180, Number(data.d_lo) || 0)),
                s_ip: data.s_ip || 'unknown',
                d_ip: data.d_ip || 'unknown',
                source_api: data.source_api || 'stream',
                ts: new Date().toISOString(),
                meta: data.meta || {},
              });
            }

            // Ingest the sanitized list batch into the store
            if (validEvents.length > 0) {
              get().addEvents(validEvents);
            }
          } catch {
            // Discard malformed JSON packets silently
          }
        });

        // Bind fallback listener for legacy individual 'attack' events
        eventSource.addEventListener('attack', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (!data.a_t || 
                data.s_la === undefined || data.s_lo === undefined || 
                data.d_la === undefined || data.d_lo === undefined) return;

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
              s_ip: data.s_ip || 'unknown',
              d_ip: data.d_ip || 'unknown',
              source_api: data.source_api || 'stream',
              ts: new Date().toISOString(),
              meta: data.meta || {},
            };
            get().addEvents([event]);
          } catch {}
        });

        // Bind connection counter update event listener ('counter')
        eventSource.addEventListener('counter', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.recentPeriod && data.today !== undefined) {
              get().updateCounter(data); // Commit metrics summaries
            }
          } catch {
            // Discard
          }
        });

        // Bind failure/error event handler
        eventSource.onerror = () => {
          eventSource?.close(); // Close faulty socket
          if (destroyed) return;
          get().incrementReconnect(); // Increment total reconnection tally
          set({ status: 'reconnecting' });

          // Exponential backoff reconnect loop with network jitter protection:
          // Prevents client instances from swarming the backend server at the same millisecond.
          const jitter = Math.random() * 1000; // Generate up to 1s of random delay
          setTimeout(connect, reconnectDelay + jitter);
          // Double retry interval up to 30s cap
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };
      } catch {
        // Fallback for instant EventSource initialization failures
        set({ status: 'disconnected' });
      }
    };

    // Trigger startup connection
    connect();

    // Define cleanup function to close sockets and set flags when unmounting
    const cleanup = () => {
      destroyed = true;
      eventSource?.close();
    };

    // Stash cleanup handler inside state
    set({ _cleanup: cleanup });
  },
}));
