import { Business } from '@/types/business';

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
    if (!Array.isArray(businesses)) {
      console.log('🏢 addMultiple: businesses is not an array', typeof businesses);
      return;
    }

    if (businesses.length === 0) {
      console.log('🏢 addMultiple: businesses array is empty');
      return;
    }

    let addedCount = 0;
    let validCount = 0;
    
    businesses.forEach((b, index) => {
      if (b?.id) {
        validCount++;
        if (!this.cache.has(b.id)) addedCount++;
        this.cache.set(b.id, b); // overwrite with latest
      } else {
        console.warn(`🏢 Invalid business at index ${index}:`, b);
      }
    });

    console.log(`🏢 addMultiple: processed ${businesses.length} businesses, ${validCount} valid, ${addedCount} new. Cache size: ${this.cache.size}`);
    
    if (addedCount > 0) {
      this.saveToStorage();
    }
  }

  getAll(): Business[] {
    const businesses = Array.from(this.cache.values());
    console.log(`🏢 getAll returning ${businesses.length} businesses`);
    return businesses;
  }

  clear() {
    this.cache.clear();
    localStorage.removeItem(this.storageKey);
    console.log("🗑️ Cleared business cache");
  }
}
