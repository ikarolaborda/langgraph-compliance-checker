import { ChatOpenAI } from '@langchain/openai';

// Returns raw, unvalidated output on purpose: the graph owns validation and repair,
// so every extractor is treated as untrusted.
export interface Extractor {
  extract(text: string, feedback: string[]): Promise<unknown>;
}

const SYSTEM_PROMPT = `You extract supplier invoice data as JSON with exactly these keys:
invoiceNumber, supplierName, supplierVatId, iban, currency (ISO 4217),
issueDate and dueDate (YYYY-MM-DD), lineItems (array of {description, quantity, unitPrice, amount}),
subtotal, vatAmount, total. Numbers are plain JSON numbers without currency symbols.
Copy identifiers exactly as written in the document. Never invent a value: if a field is missing, use null.`;

export class OpenAIExtractor implements Extractor {
  private readonly llm;

  constructor(model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini') {
    this.llm = new ChatOpenAI({ model, temperature: 0 }).withConfig({
      response_format: { type: 'json_object' },
    });
  }

  async extract(text: string, feedback: string[]): Promise<unknown> {
    const repair = feedback.length
      ? `\n\nYour previous answer was rejected for these reasons, fix them:\n- ${feedback.join('\n- ')}`
      : '';
    const response = await this.llm.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Document:\n"""\n${text}\n"""${repair}` },
    ]);
    return JSON.parse(String(response.content));
  }
}

// Deterministic parser for the plain-text invoice layout in fixtures/.
// Lets the graph, tests and evals run offline without an API key.
export class OfflineExtractor implements Extractor {
  async extract(text: string): Promise<unknown> {
    const field = (label: string) => text.match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'))?.[1].trim() ?? null;
    const amount = (label: string) => {
      const value = field(label);
      return value === null ? null : Number(value.replace(/[^\d.-]/g, ''));
    };

    const lineItems = [...text.matchAll(/^-\s*(.+?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*$/gm)].map((m) => ({
      description: m[1],
      quantity: Number(m[2]),
      unitPrice: Number(m[3]),
      amount: Number(m[4]),
    }));

    return {
      invoiceNumber: field('Invoice number'),
      supplierName: field('Supplier'),
      supplierVatId: field('VAT ID'),
      iban: field('IBAN'),
      currency: field('Currency'),
      issueDate: field('Issue date'),
      dueDate: field('Due date'),
      lineItems,
      subtotal: amount('Subtotal'),
      vatAmount: amount('VAT amount'),
      total: amount('Total'),
    };
  }
}

export function extractorFromEnv(): Extractor {
  return process.env.OPENAI_API_KEY ? new OpenAIExtractor() : new OfflineExtractor();
}
