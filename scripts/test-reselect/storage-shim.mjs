// In-memory storage shim replacing @/utils/storage for logic tests.
const mem = new Map();
let seq = 0;
export const STORAGE_KEYS = {
  currentUserId: 'reswap:current-user-id',
  users: 'reswap:users',
  items: 'reswap:items',
  exchanges: 'reswap:exchanges',
  theme: 'reswap:theme',
  lastClean: 'reswap:last-clean',
};
export const storage = {
  async get(key, fallback) {
    return mem.has(key) ? mem.get(key) : fallback;
  },
  async set(key, payload) {
    const plain = JSON.parse(JSON.stringify(payload));
    mem.set(key, plain);
    return plain;
  },
  async remove(key) {
    mem.delete(key);
  },
  async cleanExpired() {},
  createId(prefix) {
    seq += 1;
    return `${prefix}_t${seq}`;
  },
};
