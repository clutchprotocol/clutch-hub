import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSession, loadSession, saveSession } from './sessionKey.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

test('a saved session is found until it expires, then forgotten', () => {
  const s = memoryStorage();
  saveSession('0xAbC', { privateKey: 'k', address: '0x1', expiresAtMs: 1000 }, s);
  assert.equal(loadSession('0xabc', s, 500)?.privateKey, 'k');
  assert.equal(loadSession('0xabc', s, 1500), null);
  assert.equal(loadSession('0xabc', s, 500), null, 'the expired one was removed');
});

test('clearSession removes it', () => {
  const s = memoryStorage();
  saveSession('0xabc', { privateKey: 'k', expiresAtMs: 9e15 }, s);
  clearSession('0xabc', s);
  assert.equal(loadSession('0xabc', s), null);
});
