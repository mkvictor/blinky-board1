import { randomUUID } from 'node:crypto';
import { createPostgresClient, toSqlNumber, toSqlString } from './postgres.js';

export function createStore(databaseUrl) {
  const pg = createPostgresClient(databaseUrl);

  async function init() {
    await pg.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        laptop_model TEXT NOT NULL,
        issue_description TEXT NOT NULL,
        motherboard_status TEXT NOT NULL DEFAULT 'Received',
        progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
        amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'Pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY,
        ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async function createTicket(payload) {
    const { customerName, email, laptopModel, issueDescription, amountDue } = payload;
    if (!customerName || !email || !laptopModel || !issueDescription) {
      throw new Error('Missing required fields for ticket creation.');
    }

    const ticketId = randomUUID();
    const sql = `
      INSERT INTO tickets (id, customer_name, email, laptop_model, issue_description, amount_due)
      VALUES (
        ${toSqlString(ticketId)},
        ${toSqlString(customerName)},
        ${toSqlString(email)},
        ${toSqlString(laptopModel)},
        ${toSqlString(issueDescription)},
        ${toSqlNumber(amountDue ?? 0)}
      );

      SELECT row_to_json(t) FROM (
        SELECT
          id,
          customer_name AS "customerName",
          email,
          laptop_model AS "laptopModel",
          issue_description AS "issueDescription",
          motherboard_status AS "motherboardStatus",
          progress_percent AS "progressPercent",
          amount_due::float AS "amountDue",
          payment_status AS "paymentStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tickets
        WHERE id = ${toSqlString(ticketId)}
      ) t;
    `;

    return pg.queryJson(sql, null);
  }

  async function listTickets() {
    return pg.queryJson(
      `
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT
          id,
          customer_name AS "customerName",
          email,
          laptop_model AS "laptopModel",
          issue_description AS "issueDescription",
          motherboard_status AS "motherboardStatus",
          progress_percent AS "progressPercent",
          amount_due::float AS "amountDue",
          payment_status AS "paymentStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tickets
        ORDER BY created_at DESC
      ) t;
      `,
      []
    );
  }

  async function getTicket(id) {
    return pg.queryJson(
      `
      SELECT row_to_json(t) FROM (
        SELECT
          id,
          customer_name AS "customerName",
          email,
          laptop_model AS "laptopModel",
          issue_description AS "issueDescription",
          motherboard_status AS "motherboardStatus",
          progress_percent AS "progressPercent",
          amount_due::float AS "amountDue",
          payment_status AS "paymentStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tickets
        WHERE id = ${toSqlString(id)}
      ) t;
      `,
      null
    );
  }

  async function updateProgress(id, status, progressPercent) {
    const parsedProgress = Number(progressPercent);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
      throw new Error('Progress must be a number between 0 and 100.');
    }

    const existing = await getTicket(id);
    if (!existing) {
      throw new Error('Ticket not found.');
    }

    const finalStatus = parsedProgress === 100 ? 'Completed' : status || existing.motherboardStatus;

    const statements = [
      `UPDATE tickets
       SET motherboard_status = ${toSqlString(finalStatus)},
           progress_percent = ${toSqlNumber(parsedProgress)},
           updated_at = NOW()
       WHERE id = ${toSqlString(id)};`
    ];

    if (parsedProgress === 100) {
      statements.push(`
        INSERT INTO notifications (id, ticket_id, email, type, message)
        SELECT
          ${toSqlString(randomUUID())},
          ${toSqlString(id)},
          email,
          'repair_complete',
          'Repair completed for ' || laptop_model || '. You can now pay in-app.'
        FROM tickets
        WHERE id = ${toSqlString(id)}
          AND NOT EXISTS (
            SELECT 1 FROM notifications
            WHERE ticket_id = ${toSqlString(id)}
              AND type = 'repair_complete'
          );
      `);
    }

    await pg.run(statements.join('\n'));
    return getTicket(id);
  }

  async function listNotificationsForEmail(email) {
    return pg.queryJson(
      `
      SELECT COALESCE(json_agg(n), '[]'::json) FROM (
        SELECT
          id,
          ticket_id AS "ticketId",
          email,
          type,
          message,
          created_at AS "createdAt"
        FROM notifications
        WHERE lower(email) = lower(${toSqlString(email)})
        ORDER BY created_at DESC
      ) n;
      `,
      []
    );
  }

  async function markPaid(id) {
    const ticket = await getTicket(id);
    if (!ticket) {
      throw new Error('Ticket not found.');
    }

    await pg.run(`
      UPDATE tickets
      SET payment_status = 'Paid',
          updated_at = NOW()
      WHERE id = ${toSqlString(id)};

      INSERT INTO notifications (id, ticket_id, email, type, message)
      SELECT
        ${toSqlString(randomUUID())},
        ${toSqlString(id)},
        email,
        'payment_confirmed',
        'Payment received for ticket ${id}. Thank you!'
      FROM tickets
      WHERE id = ${toSqlString(id)};
    `);

    return getTicket(id);
  }

  return {
    init,
    createTicket,
    listTickets,
    getTicket,
    updateProgress,
    listNotificationsForEmail,
    markPaid
  };
}
