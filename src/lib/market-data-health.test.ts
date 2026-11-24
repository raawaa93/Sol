import assert from 'node:assert/strict';
import test from 'node:test';
import { assessSnapshotFreshness, DEFAULT_SNAPSHOT_STALE_AFTER_MS, formatSourceEventAge } from './market-data-health.ts';

const NOW = Date.UTC(2026, 10, 23, 12);

test('market snapshot freshness is based on local receipt age with a clear one-minute threshold', () => {
  assert.equal(assessSnapshotFreshness(NOW, NOW), 'fresh');
  assert.equal(assessSnapshotFreshness(NOW - DEFAULT_SNAPSHOT_STALE_AFTER_MS, NOW), 'fresh');
  assert.equal(assessSnapshotFreshness(NOW - DEFAULT_SNAPSHOT_STALE_AFTER_MS - 1, NOW), 'stale');
});

test('market snapshot freshness rejects clock-skewed and invalid timestamps', () => {
  assert.equal(assessSnapshotFreshness(NOW + 1_000, NOW), 'fresh');
  assert.equal(assessSnapshotFreshness(NOW + 6_000, NOW), 'future');
  assert.equal(assessSnapshotFreshness(undefined, NOW), 'unknown');
  assert.equal(assessSnapshotFreshness(Number.NaN, NOW), 'unknown');
  assert.equal(assessSnapshotFreshness(NOW, NOW, 0), 'unknown');
});


test('source event age is explicit and never labels event age as feed freshness', () => {
  assert.equal(formatSourceEventAge(undefined, NOW), 'غير متاح');
  assert.equal(formatSourceEventAge('invalid', NOW), 'وقت غير صالح');
  assert.equal(formatSourceEventAge(new Date(NOW - 12_000).toISOString(), NOW), 'منذ 12 ث');
  assert.equal(formatSourceEventAge(new Date(NOW - 5 * 60_000).toISOString(), NOW), 'منذ 5 د');
  assert.equal(formatSourceEventAge(new Date(NOW - 2 * 3_600_000).toISOString(), NOW), 'منذ 2 س');
  assert.equal(formatSourceEventAge(new Date(NOW + 10_000).toISOString(), NOW), 'وقت مستقبلي؛ تحقّق');
});
