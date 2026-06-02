import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatePDF } from './export-pdf.js';

const sampleTask = {
  id: 'test-task-1',
  type: 'url_crawl',
  status: 'completed',
  config: { url: 'https://example.com', depth: 2 },
  stats: { crawled: 2, total: 5 },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T01:00:00.000Z',
};

describe('generatePDF', () => {
  it('returns a Buffer for valid input with results', async () => {
    const results = [
      { url: 'https://ext1.com', found_on: 'https://example.com', link_type: 'a', depth: 1, page_title: 'Ext 1', status_code: 200 },
      { url: 'https://ext2.com', found_on: 'https://example.com', link_type: 'script', depth: 2, page_title: '', status_code: 0 },
    ];
    const buffer = await generatePDF(sampleTask, results);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 100);
  });

  it('returns a Buffer for empty results', async () => {
    const buffer = await generatePDF(sampleTask, []);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 50);
  });

  it('returns a Buffer for many results', async () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push({
        url: `https://ext${i}.com/page`,
        found_on: 'https://example.com',
        link_type: i % 2 === 0 ? 'a' : 'img',
        depth: i % 3,
        page_title: i % 2 === 0 ? `Title ${i}` : '',
        status_code: i % 5 === 0 ? 200 : 0,
      });
    }
    const buffer = await generatePDF(sampleTask, results);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 500);
  });

  it('handles results with missing optional fields', async () => {
    const results = [
      { url: 'https://minimal.com', found_on: '', link_type: 'a', depth: 0 },
    ];
    const buffer = await generatePDF(sampleTask, results);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 50);
  });
});
