import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FilterEngine } from './filter.js';

describe('FilterEngine', () => {
  describe('single filter pattern', () => {
    it('matches exact domain qq.com', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      assert.ok(f.isFiltered('https://qq.com/page'));
    });
    it('does not match subdomain of exact filter', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      assert.strictEqual(f.isFiltered('https://news.qq.com/page'), false);
    });
    it('matches wildcard subdomain *.qq.com', () => {
      const f = new FilterEngine();
      f.addFilter('*.qq.com');
      assert.ok(f.isFiltered('https://news.qq.com/page'));
      assert.ok(f.isFiltered('https://sports.qq.com/page'));
      assert.ok(f.isFiltered('https://qq.com/page'));
    });
    it('matches suffix wildcard *gov.cn', () => {
      const f = new FilterEngine();
      f.addFilter('*gov.cn');
      assert.ok(f.isFiltered('https://beijing.gov.cn/notice'));
      assert.ok(f.isFiltered('https://www.moe.gov.cn/page'));
    });
    it('matches suffix wildcard *.edu.cn', () => {
      const f = new FilterEngine();
      f.addFilter('*.edu.cn');
      assert.ok(f.isFiltered('https://tsinghua.edu.cn'));
      assert.ok(f.isFiltered('https://www.pku.edu.cn/page'));
    });
  });

  describe('multiple filters', () => {
    it('matches any of the filters', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      f.addFilter('*gov.cn');
      assert.ok(f.isFiltered('https://qq.com/page'));
      assert.ok(f.isFiltered('https://shanghai.gov.cn/'));
      assert.strictEqual(f.isFiltered('https://example.com'), false);
    });
  });

  describe('remove filter', () => {
    it('no longer matches after removal', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      f.removeFilter('qq.com');
      assert.strictEqual(f.isFiltered('https://qq.com/page'), false);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('serializes and deserializes correctly', () => {
      const f = new FilterEngine();
      f.addFilter('*.qq.com');
      f.addFilter('*gov.cn');
      const json = f.toJSON();
      const f2 = FilterEngine.fromJSON(json);
      assert.ok(f2.isFiltered('https://news.qq.com/page'));
      assert.ok(f2.isFiltered('https://beijing.gov.cn'));
    });
  });

  describe('link type filtering', () => {
    it('filters by excluded link type', () => {
      const f = new FilterEngine();
      f.setExcludedTypes(['img', 'script']);
      assert.ok(f.isFiltered('https://example.com/img.png', 'img'));
      assert.ok(f.isFiltered('https://example.com/app.js', 'script'));
      assert.strictEqual(f.isFiltered('https://example.com/page', 'a'), false);
    });

    it('domain filter and type filter can work together', () => {
      const f = new FilterEngine();
      f.addFilter('qq.com');
      f.setExcludedTypes(['img']);
      // Domain filtered
      assert.ok(f.isFiltered('https://qq.com/page', 'a'));
      // Type filtered
      assert.ok(f.isFiltered('https://other.com/img.png', 'img'));
      // Neither
      assert.strictEqual(f.isFiltered('https://other.com/page', 'a'), false);
    });

    it('no type filter when excludedTypes is empty', () => {
      const f = new FilterEngine();
      assert.strictEqual(f.isFiltered('https://example.com/img.png', 'img'), false);
    });

    it('serializes and deserializes new format correctly', () => {
      const f = new FilterEngine();
      f.addFilter('*.qq.com');
      f.setExcludedTypes(['img', 'css']);
      const json = f.toJSON();
      assert.ok(json.domains.includes('*.qq.com'));
      assert.ok(json.types.includes('img'));
      const f2 = FilterEngine.fromJSON(json);
      assert.ok(f2.isFiltered('https://news.qq.com/page', 'a'));
      assert.ok(f2.isFiltered('https://example.com/img.png', 'img'));
    });

    it('backward compatible: old array format still works', () => {
      const f = FilterEngine.fromJSON(['qq.com', '*gov.cn']);
      assert.ok(f.isFiltered('https://qq.com/page'));
      assert.strictEqual(f.isFiltered('https://example.com'), false);
      // linkType param works even without type filter
      assert.strictEqual(f.isFiltered('https://example.com/img.png', 'img'), false);
    });
  });
});
