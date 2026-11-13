import { describe, expect, it, vi } from 'vitest';
import { registerTicketAutomation as fromAutomation } from './automation.js';
import { registerTicketAutomation, ticketComponents } from './index.js';

vi.mock('@phenix/database', () => ({}));

describe('composants du module tickets', () => {
  it('enregistre chaque bouton, menu et formulaire du module, une seule fois', () => {
    const prefixes = ticketComponents.map((handler) => handler.prefix);

    expect(prefixes.toSorted()).toEqual(
      [
        'ticket:cancel',
        'ticket:choose',
        'ticket:claim',
        'ticket:close',
        'ticket:confirm',
        'ticket:form',
        'ticket:open',
        'ticket:rate',
      ].toSorted(),
    );
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('automatismes du module tickets', () => {
  // Le câblage lui-même (MessageCreate, worker, planification) est testé dans automation.test.ts
  it('index.ts reçoit le câblage testé, pas une copie', () => {
    expect(registerTicketAutomation).toBe(fromAutomation);
  });
});
