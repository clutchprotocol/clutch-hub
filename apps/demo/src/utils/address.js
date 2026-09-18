/**
 * Shorten a hex address for display (e.g. wallet / tx participant).
 * @param {string} addr
 * @returns {string}
 */
export function truncAddr(addr) {
  if (!addr || addr.length < 12) return addr || '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
