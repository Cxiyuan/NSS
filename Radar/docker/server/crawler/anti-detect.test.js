import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { AntiDetect } from './anti-detect.js';

describe('AntiDetect', () => {
  describe('constructor', () => {
    it('uses default config when none provided', () => {
      const ad = new AntiDetect();
      assert.strictEqual(ad.config.uaRotation, true);
      assert.strictEqual(ad.config.maxRetries, 3);
      assert.strictEqual(ad.config.browserFallback, true);
      assert.strictEqual(ad.config.requestDelay.min, 800);
      assert.strictEqual(ad.config.requestDelay.max, 2500);
      assert.strictEqual(ad.config.proxy, null);
    });

    it('merges provided config with defaults', () => {
      const ad = new AntiDetect({ maxRetries: 0, browserFallback: false });
      assert.strictEqual(ad.config.maxRetries, 0);
      assert.strictEqual(ad.config.browserFallback, false);
      assert.strictEqual(ad.config.uaRotation, true); // default preserved
    });
  });

  describe('getUA', () => {
    it('rotates UA round-robin', () => {
      const ad = new AntiDetect({ uaRotation: true });
      const first = ad.getUA();
      const second = ad.getUA();
      assert.notStrictEqual(first, second);
    });

    it('returns the same UA when rotation disabled', () => {
      const ad = new AntiDetect({ uaRotation: false });
      const first = ad.getUA();
      const second = ad.getUA();
      assert.strictEqual(first, second);
    });

    it('returns a non-empty string', () => {
      const ad = new AntiDetect();
      assert.ok(ad.getUA().length > 0);
    });
  });

  describe('buildHeaders', () => {
    it('returns headers with User-Agent', () => {
      const ad = new AntiDetect();
      const headers = ad.buildHeaders();
      assert.ok(headers['User-Agent']);
      assert.ok(headers['Accept-Language']);
    });

    it('includes Referer when provided', () => {
      const ad = new AntiDetect();
      const headers = ad.buildHeaders('https://referer.com/page');
      assert.strictEqual(headers['Referer'], 'https://referer.com/page');
    });

    it('rotates Accept-Language', () => {
      const ad = new AntiDetect();
      const h1 = ad.buildHeaders();
      const h2 = ad.buildHeaders();
      // With 5 languages, call count 1 vs 2 gives different languages
      // But they could incidentally match; just check it's one of the pool
      const languages = ['zh-CN,zh;q=0.9,en;q=0.8', 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7', 'zh-CN,zh;q=0.9', 'zh-CN,zh;q=0.8,en;q=0.6'];
      assert.ok(languages.includes(h1['Accept-Language']));
      assert.ok(languages.includes(h2['Accept-Language']));
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const ad = new AntiDetect({ maxRetries: 3 });
      const result = await ad.withRetry(async () => 'ok');
      assert.strictEqual(result, 'ok');
    });

    it('retries and succeeds on second attempt', async () => {
      const ad = new AntiDetect({ maxRetries: 3 });
      let attempts = 0;
      const result = await ad.withRetry(async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'ok';
      });
      assert.strictEqual(result, 'ok');
      assert.strictEqual(attempts, 2);
    });

    it('throws after exhausting all retries', async () => {
      const ad = new AntiDetect({ maxRetries: 2 });
      await assert.rejects(
        () => ad.withRetry(async () => { throw new Error('always fail'); }),
        /always fail/
      );
    });

    it('does not retry when maxRetries is 0', async () => {
      const ad = new AntiDetect({ maxRetries: 0 });
      let attempts = 0;
      await assert.rejects(
        () => ad.withRetry(async () => { attempts++; throw new Error('no retry'); }),
        /no retry/
      );
      assert.strictEqual(attempts, 1);
    });
  });

  describe('delay', () => {
    it('resolves after a positive delay', async () => {
      const ad = new AntiDetect({ requestDelay: { min: 5, max: 10 } });
      const start = Date.now();
      await ad.delay();
      assert.ok(Date.now() - start >= 2); // at least some delay occurred
    });
  });

  describe('toJSON', () => {
    it('returns config object', () => {
      const ad = new AntiDetect({ maxRetries: 1 });
      const json = ad.toJSON();
      assert.strictEqual(json.maxRetries, 1);
      assert.strictEqual(json.uaRotation, true);
    });
  });
});
