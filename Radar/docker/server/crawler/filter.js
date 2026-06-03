import { domainToASCII } from 'node:url';
import { safeHostname } from '../utils/url.js';

export class FilterEngine {
  #patterns = [];
  #excludedTypes = [];

  addFilter(pattern) {
    // Normalize IDN domains to punycode to prevent bypass
    const normalized = pattern.includes('://') ? pattern : domainToASCII(pattern) || pattern;
    if (!this.#patterns.includes(normalized)) {
      this.#patterns.push(normalized);
    }
  }

  removeFilter(pattern) {
    this.#patterns = this.#patterns.filter(p => p !== pattern);
  }

  setExcludedTypes(types) {
    this.#excludedTypes = [...types];
  }

  isFiltered(url, linkType) {
    // 1. Check domain patterns (existing logic)
    let domainFiltered = false;
    try {
      const hostname = safeHostname(url);
      // Normalize IDN to punycode so filters like '例子.测试' match 'xn--fsq.xn--0zwm56d'
      const normalizedHost = domainToASCII(hostname) || hostname;
      if (normalizedHost) {
        domainFiltered = this.#patterns.some(pattern => {
          const regex = FilterEngine.#patternToRegex(pattern);
          return regex.test(normalizedHost);
        });
      }
    } catch {}

    // 2. Check link type exclusion (new)
    const typeFiltered = linkType && this.#excludedTypes.length > 0 && this.#excludedTypes.includes(linkType);

    return !!(domainFiltered || typeFiltered);
  }

  static #patternToRegex(pattern) {
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2).replace(/\./g, '\\.');
      return new RegExp('(?:^.+\\.)?' + base + '$');
    }
    if (pattern.startsWith('*')) {
      const base = pattern.slice(1).replace(/\./g, '\\.');
      return new RegExp(`${base}$`);
    }
    const exact = pattern.replace(/\./g, '\\.');
    return new RegExp(`^${exact}$`);
  }

  toJSON() {
    return {
      domains: this.#patterns,
      types: this.#excludedTypes,
    };
  }

  static fromJSON(json) {
    const f = new FilterEngine();
    if (Array.isArray(json)) {
      // Old format: ['qq.com', '*gov.cn']
      for (const p of json) f.addFilter(p);
    } else if (json && typeof json === 'object') {
      // New format: { domains: ['qq.com'], types: ['a', 'img'] }
      if (Array.isArray(json.domains)) {
        for (const p of json.domains) f.addFilter(p);
      }
      if (Array.isArray(json.types)) {
        f.setExcludedTypes(json.types);
      }
    }
    return f;
  }
}
