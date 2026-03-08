/**
 * FPS counter for performance telemetry
 */
export class FPSCounter {
  private frames: number = 0;
  private lastTime: number = performance.now();
  private _fps: number = 60;

  update(): void {
    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this._fps = Math.round((this.frames * 1000) / delta);
      this.frames = 0;
      this.lastTime = now;
    }
  }

  get fps(): number {
    return this._fps;
  }
}

/**
 * Generic Ring Buffer for bounded-size collections
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private _size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  get size(): number {
    return this._size;
  }

  getAll(): T[] {
    if (this._size < this.capacity) {
      return this.buffer.slice(0, this._size);
    }
    // Return in chronological order
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  /**
   * Get the most recent `count` items WITHOUT copying the entire buffer.
   * Directly indexes backwards from head.
   */
  getRecent(count: number): T[] {
    const n = Math.min(count, this._size);
    if (n === 0) return [];
    const result = new Array<T>(n);
    for (let i = 0; i < n; i++) {
      // Walk backwards from head
      const idx = (this.head - n + i + this.capacity) % this.capacity;
      result[i] = this.buffer[idx];
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
  }
}

/**
 * Generic Object Pool for recycling objects to avoid GC pressure
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize: number, preAllocate: number = 0) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    for (let i = 0; i < preAllocate; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T | null {
    if (this.active.size >= this.maxSize) return null;

    let obj: T;
    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else {
      obj = this.factory();
    }

    this.reset(obj);
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    this.active.delete(obj);
    this.pool.push(obj);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get availableCount(): number {
    return this.pool.length;
  }

  getActive(): Set<T> {
    return this.active;
  }
}

/**
 * Performance telemetry singleton
 */
export interface PerfStats {
  fps: number;
  activeArcs: number;
  activeMarkers: number;
  bufferSize: number;
  droppedEvents: number;
  reconnectAttempts: number;
  eventsPerSecond: number;
}

/**
 * Ring-buffer based event timestamp tracker.
 * Replaces Array.shift() O(n) with O(1) pointer advancement.
 */
class EventTimestampRing {
  private timestamps: Float64Array;
  private head: number = 0;
  private _size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number = 256) {
    this.capacity = capacity;
    this.timestamps = new Float64Array(capacity);
  }

  push(now: number): void {
    this.timestamps[this.head] = now;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  /** Count timestamps within the last `windowMs` milliseconds */
  countWithin(now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    let count = 0;
    for (let i = 0; i < this._size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      if (this.timestamps[idx] >= cutoff) {
        count++;
      } else {
        break; // timestamps are in order, so once we hit one that's too old, stop
      }
    }
    return count;
  }
}

class PerfTelemetry {
  private fpsCounter = new FPSCounter();
  private eventRing = new EventTimestampRing(512);
  stats: PerfStats = {
    fps: 60,
    activeArcs: 0,
    activeMarkers: 0,
    bufferSize: 0,
    droppedEvents: 0,
    reconnectAttempts: 0,
    eventsPerSecond: 0,
  };

  updateFPS(): void {
    this.fpsCounter.update();
    this.stats.fps = this.fpsCounter.fps;
  }

  recordEvent(): void {
    const now = Date.now();
    this.eventRing.push(now);
    this.stats.eventsPerSecond = Math.round(this.eventRing.countWithin(now, 5000) / 5);
  }
}

export const perfTelemetry = new PerfTelemetry();

/**
 * Fast unique ID generator — replaces uuid v4.
 * Uses a monotonic counter + random suffix for uniqueness.
 * ~50x faster than crypto.randomUUID / uuid library.
 */
let _idCounter = 0;
const _idBase = Math.random().toString(36).slice(2, 8);
export function fastId(): string {
  return _idBase + '-' + (++_idCounter).toString(36);
}
