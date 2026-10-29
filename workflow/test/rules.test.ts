import { describe, expect, it } from 'vitest';
import { checkInvoice, isValidEuVatId, isValidIban } from '../src/rules.js';
import type { Invoice } from '../src/schema.js';

const invoice: Invoice = {
  invoiceNumber: 'INV-1',
  supplierName: 'Atlântico Papel Lda',
  supplierVatId: 'PT507172230',
  iban: 'PT50 0002 0123 1234 5678 9015 4',
  currency: 'EUR',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  lineItems: [{ description: 'Paper', quantity: 20, unitPrice: 4.5, amount: 90 }],
  subtotal: 90,
  vatAmount: 20.7,
  total: 110.7,
};

describe('rules', () => {
  it('accepts a clean invoice', () => {
    expect(checkInvoice(invoice)).toEqual([]);
  });

  it('validates IBAN checksums', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(isValidIban('not an iban')).toBe(false);
  });

  it('only accepts EU VAT prefixes', () => {
    expect(isValidEuVatId('DE123456789')).toBe(true);
    expect(isValidEuVatId('US123456789')).toBe(false);
  });

  it('flags totals that do not add up', () => {
    const rules = checkInvoice({ ...invoice, total: 111 }).map((f) => f.rule);
    expect(rules).toEqual(['total_matches']);
  });

  it('sends long payment terms to a human instead of rejecting', () => {
    const findings = checkInvoice({ ...invoice, dueDate: '2026-12-15' });
    expect(findings).toEqual([expect.objectContaining({ rule: 'payment_term', severity: 'warning' })]);
  });
});
