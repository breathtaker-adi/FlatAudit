/**
 * FlatAudit - Shared Formatting Utilities
 */

/**
 * Formats monetary amounts in standard Indian denomination.
 * @param {number} val - Numeric value in INR
 * @param {object} [opts]
 * @param {boolean} [opts.abbr=false] - Whether to abbreviate to Lakhs (L) and Crores (Cr)
 * @returns {string} e.g. "₹ 1.25 Cr" or "₹ 45,000"
 */
export function formatCurrencyINR(val, opts = {}) {
  if (!val || typeof val !== 'number' || isNaN(val) || val <= 0) return '₹ --';
  if (opts.abbr) {
    if (val >= 10000000) {
      const cr = (val / 10000000).toFixed(2).replace(/(\.[0-9]*[1-9])0+$|\.00$/, '$1');
      return `₹ ${cr} Cr`;
    }
    if (val >= 100000) {
      const l = (val / 100000).toFixed(2).replace(/(\.[0-9]*[1-9])0+$|\.00$/, '$1');
      return `₹ ${l} L`;
    }
  }
  return `₹ ${val.toLocaleString('en-IN')}`;
}

/**
 * Backward-compatible wrapper for abbreviated Indian currency strings.
 * @param {number} val 
 * @returns {string}
 */
export function formatIndianCurrencyAbbr(val) {
  return formatCurrencyINR(val, { abbr: true });
}
