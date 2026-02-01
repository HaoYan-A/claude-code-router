import type { ModelMapping } from '@claude-code-router/shared';

interface CacheEntry {
  mappings: ModelMapping[];
  accessedAt: number;
}

class ModelMappingCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  get(apiKeyId: string): ModelMapping[] | undefined {
    const entry = this.cache.get(apiKeyId);
    if (entry) {
      entry.accessedAt = Date.now();
      return entry.mappings;
    }
    return undefined;
  }

  set(apiKeyId: string, mappings: ModelMapping[]): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    this.cache.set(apiKeyId, {
      mappings,
      accessedAt: Date.now(),
    });
  }

  delete(apiKeyId: string): void {
    this.cache.delete(apiKeyId);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

export const modelMappingCache = new ModelMappingCache();
