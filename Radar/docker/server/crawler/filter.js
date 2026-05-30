import { getDomain } from '../utils/url.js';

export class FilterEngine {
  #patterns = [];

  addFilter(pattern) {
    if (!this.#patterns.includes(pattern)) {
      this.#patterns.push(pattern);
    }
  }

  removeFilter(pattern) {
    this.#patterns = this.#patterns.filter(p => p !== pattern);
  }

  isFiltered(url) {
    try {
      // Use full hostname instead of getDomain() — preserves subdomains
      // so *.sceea.cn correctly matches www.sceea.cn
      const hostname = new URL(url).hostname;
      if (!hostname) return false;
      return this.#patterns.some(pattern => {
        const regex = FilterEngine.#patternToRegex(pattern);
        return regex.test(hostname);
      });
    } catch {
      return false;
    }
  }

  static #patternToRegex(pattern) {
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2).replace(/\./g, '\\.');
      // Match any subdomain depth (including bare domain):
      // e.g. *.sceea.cn matches sceea.cn, www.sceea.cn, deep.sub.sceea.cn
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
    return this.#patterns;
  }

  static fromJSON(json) {
    const f = new FilterEngine();
    for (const p of json) f.addFilter(p);
    return f;
  }
}
