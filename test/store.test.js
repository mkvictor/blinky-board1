import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStore } from '../src/store.js';
import { toSqlNumber, toSqlString } from '../src/postgres.js';

test('toSqlString escapes single quotes', () => {
  assert.equal(toSqlString("O'Brien"), "'O''Brien'");
});

test('toSqlNumber rejects invalid numbers', () => {
  assert.throws(() => toSqlNumber('abc'), /Expected a numeric value/);
});

test('ticket lifecycle on postgres', { skip: !process.env.DATABASE_URL }, async () => {
  const store = createStore(process.env.DATABASE_URL);
  await store.init();

  const uniqueEmail = `ada+${randomUUID()}@example.com`;
  const ticket = await store.createTicket({
    customerName: 'Ada',
    email: uniqueEmail,
    laptopModel: 'ThinkPad T14',
    issueDescription: 'No power on motherboard',
    amountDue: 120
  });

  assert.equal(ticket.paymentStatus, 'Pending');

  const completed = await store.updateProgress(ticket.id, 'Testing', 100);
  assert.equal(completed.motherboardStatus, 'Completed');

  const alerts = await store.listNotificationsForEmail(uniqueEmail);
  assert.equal(alerts.some((item) => item.type === 'repair_complete'), true);

  const paid = await store.markPaid(ticket.id);
  assert.equal(paid.paymentStatus, 'Paid');
});
