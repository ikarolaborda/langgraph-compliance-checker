import type { Finding, Invoice } from './schema.js';

const EU_VAT_PREFIXES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI',
];

// EU Late Payment Directive (2011/7/EU): B2B terms above 60 days need explicit agreement,
// so they go to a human instead of being rejected outright.
const MAX_PAYMENT_TERM_DAYS = 60;
const CENT = 0.01;

const normalize = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const sameAmount = (a: number, b: number) => Math.abs(a - b) < CENT;

export function isValidEuVatId(vatId: string): boolean {
  const id = normalize(vatId);
  return EU_VAT_PREFIXES.includes(id.slice(0, 2)) && /^[0-9A-Z]{2,12}$/.test(id.slice(2));
}

// ISO 13616 mod-97 check: move the first four chars to the end, map letters to 10..35.
export function isValidIban(iban: string): boolean {
  const value = normalize(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) {
    return false;
  }
  const digits = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function checkInvoice(invoice: Invoice): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, severity: Finding['severity'], message: string) =>
    findings.push({ rule, severity, message });

  if (!isValidEuVatId(invoice.supplierVatId)) {
    add('vat_id_format', 'error', `"${invoice.supplierVatId}" is not a valid EU VAT identifier`);
  }

  if (!isValidIban(invoice.iban)) {
    add('iban_checksum', 'error', 'IBAN fails the mod-97 checksum');
  }

  for (const [i, item] of invoice.lineItems.entries()) {
    if (!sameAmount(item.quantity * item.unitPrice, item.amount)) {
      add('line_amount', 'error', `line ${i + 1}: ${item.quantity} x ${item.unitPrice} != ${item.amount}`);
    }
  }

  const linesTotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
  if (!sameAmount(linesTotal, invoice.subtotal)) {
    add('subtotal_matches_lines', 'error', `line items sum to ${linesTotal.toFixed(2)}, subtotal is ${invoice.subtotal}`);
  }

  if (!sameAmount(invoice.subtotal + invoice.vatAmount, invoice.total)) {
    add('total_matches', 'error', `subtotal + VAT = ${(invoice.subtotal + invoice.vatAmount).toFixed(2)}, total is ${invoice.total}`);
  }

  const term = daysBetween(invoice.issueDate, invoice.dueDate);
  if (term < 0) {
    add('due_after_issue', 'error', 'due date is before issue date');
  } else if (term > MAX_PAYMENT_TERM_DAYS) {
    add('payment_term', 'warning', `payment term of ${term} days exceeds ${MAX_PAYMENT_TERM_DAYS}; needs explicit agreement`);
  }

  return findings;
}
