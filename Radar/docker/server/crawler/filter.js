export class FilterEngine {
  #patterns = [];
  #excludedTypes = [];

  addFilter(pattern) {
    if (!this.#patterns.includes(pattern)) {
      this.#patterns.push(pattern);
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
      const hostname = new URL(url).hostname;
      if (hostname) {
        domainFiltered = this.#patterns.some(pattern => {
          const regex = FilterEngine.#patternToRegex(pattern);
          return regex.test(hostname);
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
