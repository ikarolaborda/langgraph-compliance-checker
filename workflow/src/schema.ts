import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const LineItem = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
});

export const Invoice = z.object({
  invoiceNumber: z.string().min(1),
  supplierName: z.string().min(1),
  supplierVatId: z.string().min(4),
  iban: z.string().min(15),
  currency: z.string().regex(/^[A-Z]{3}$/, 'expected ISO 4217 code'),
  issueDate: isoDate,
  dueDate: isoDate,
  lineItems: z.array(LineItem).min(1),
  subtotal: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export type Invoice = z.infer<typeof Invoice>;

export type Severity = 'error' | 'warning';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
}

export type Decision = 'approved' | 'rejected' | 'needs_human_review';

export interface ComplianceRequest {
  documentId: string;
  text: string;
}

export interface ComplianceResult {
  documentId: string;
  decision: Decision;
  invoice: Invoice | null;
  findings: Finding[];
  attempts: number;
  audit: string[];
}

// Zod issues are flattened into short lines because they are fed back to the
// model as repair instructions on the next extraction attempt.
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}
