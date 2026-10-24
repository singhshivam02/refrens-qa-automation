function referenceId(value) {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value._id === 'string') return value._id;
  throw new Error('Expected a resource ID or populated resource');
}

function rows(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  throw new Error('Expected an array or a paginated { data: [] } response');
}

function stockAfter(opening, quantity, mode, purchase = false) {
  if (!['UPDATE', 'BLOCK', 'IGNORE'].includes(mode)) throw new Error('Unknown stock mode');
  const delta = quantity * (purchase ? 1 : -1);
  return {
    stockInHand: opening + (mode === 'UPDATE' ? delta : 0),
    stock: opening + (mode === 'IGNORE' ? 0 : delta),
  };
}

function csv(table) {
  return table.map((row) => row.map((cell) => {
    const s = String(cell ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}

function parseCsv(text) {
  const result = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('Invalid CSV quote');
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); result.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (cell || row.length) { row.push(cell); result.push(row); }
  return result;
}

function positiveTimeout(value, fallback) {
  const timeout = Number(value ?? fallback);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Timeout must be a positive integer');
  return timeout;
}

module.exports = { referenceId, rows, stockAfter, csv, parseCsv, positiveTimeout };
