export type Business = {
  id: string;
  position?: { lat: number; lng: number };
  [key: string]: any;
};

export class BusinessCache {
  private cache: Map<string, Business>;
  private storageKey: string;

  constructor(storageKey = "businessCache") {
    this.storageKey = storageKey;
    this.cache = new Map();

    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const arr: Business[] = JSON.parse(raw);
        this.cache = new Map(arr.map(b => [b.id, b]));
        console.log(`📦 Restored ${this.cache.size} businesses from cache`);
      }
    } catch (err) {
      console.warn("⚠️ Failed to load business cache from storage", err);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.getAll()));
    } catch (err) {
      console.warn("⚠️ Failed to save business cache to storage", err);
    }
  }

  addMultiple(businesses: Business[]) {
    if (!Array.isArray(businesses)) return;

    let addedCount = 0;
    businesses.forEach(b => {
      if (b?.id) {
        if (!this.cache.has(b.id)) addedCount++;
        this.cache.set(b.id, b); // overwrite with latest
      }
    });

    if (addedCount) {
      console.log(`➕ Added ${addedCount} new businesses (total ${this.cache.size})`);
      this.saveToStorage();
    }
  }

  getAll(): Business[] {
    return Array.from(this.cache.values());
  }

  clear() {
    this.cache.clear();
    localStorage.removeItem(this.storageKey);
    console.log("🗑️ Cleared business cache");
  }
}
