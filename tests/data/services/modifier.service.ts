/**
 * Modifier Service
 *
 * Replaces the flag-per-feature pattern with a single typed modifiers object.
 * Modifiers split into two phases:
 *
 *   1. Input modifiers  — applied to the payload BEFORE the API call
 *   2. Post modifiers   — applied AFTER the entity is created (payments, status changes)
 *
 * Usage:
 *   import { applyInputModifiers } from '../services/modifier.service';
 *
 *   const input = applyInputModifiers({}, { overdue: true, shipping: true });
 *   const invoice = await createGSTInvoice(api, urlKey, input);
 *
 * Future preset support:
 *   --preset=premium  → applyModifiers(entity, PRESETS.premium)
 */

// ─── types ────────────────────────────────────────────────────────────────

export interface InvoiceModifiers {
  /** Record a full payment after creation. */
  paid?:      boolean;
  /** Record a partial payment of this amount after creation. */
  partial?:   number;
  /** Set due date 30 days in the past to simulate an overdue invoice. */
  overdue?:   boolean;
  /** Add shipping + transport details to the invoice payload. */
  shipping?:  boolean;
  /** Skip payment recording (invoice created normally, no payment added). */
  draft?:     boolean;
}

// ─── presets ──────────────────────────────────────────────────────────────

/**
 * Named modifier presets.
 *
 * Use via CLI:  --preset=paid
 * Use in code:  MODIFIER_PRESETS['premium']
 *
 * Single-state:  paid | overdue | draft | shipping
 * Combos:        paid-shipping | premium | overdue-partial
 */
export const MODIFIER_PRESETS: Record<string, InvoiceModifiers> = {
  // ── single-state shortcuts ─────────────────────────────────────────────
  'paid':            { paid:     true },
  'overdue':         { overdue:  true },
  'draft':           { draft:    true },
  'shipping':        { shipping: true },
  // ── combos ────────────────────────────────────────────────────────────
  'paid-shipping':   { paid: true, shipping: true },
  /** Alias for paid-shipping — readable in scenario names */
  'premium':         { paid: true, shipping: true },
  'overdue-partial': { overdue: true, partial: 5000 },
  'paid-overdue':    { paid: true, overdue: true },
};

// ─── input phase ──────────────────────────────────────────────────────────

/**
 * Apply modifiers that affect the invoice payload before the API call.
 * Returns a new object — does not mutate `input`.
 */
export function applyInputModifiers(
  input:     Record<string, unknown>,
  modifiers: InvoiceModifiers,
): Record<string, unknown> {
  const result = { ...input };

  if (modifiers.overdue) {
    result['dueDate'] = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0];
  }

  if (modifiers.shipping) {
    result['shipping'] = true;
  }

  return result;
}
