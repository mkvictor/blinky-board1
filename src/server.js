import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

const store = createStore(process.env.DATABASE_URL);
const port = Number(process.env.PORT || 3000);

await store.init();

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: 'Bad request' });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      await sendStatic(res, 'index.html');
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      await sendStatic(res, url.pathname.replace('/', ''));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tickets') {
      const body = await readBody(req);
      const ticket = await store.createTicket(body);
      sendJson(res, 201, ticket);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tickets') {
      sendJson(res, 200, await store.listTickets());
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/tickets/')) {
      const ticketId = url.pathname.split('/')[3];
      const ticket = await store.getTicket(ticketId);
      if (!ticket) {
        sendJson(res, 404, { error: 'Ticket not found.' });
        return;
      }
      sendJson(res, 200, ticket);
      return;
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/tickets/')) {
      const parts = url.pathname.split('/');
      if (parts[4] !== 'progress') {
        sendJson(res, 404, { error: 'Route not found' });
        return;
      }
      const ticketId = parts[3];
      const body = await readBody(req);
      const ticket = await store.updateProgress(ticketId, body.motherboardStatus, body.progressPercent);
      sendJson(res, 200, ticket);
      return;
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/tickets/')) {
      const parts = url.pathname.split('/');
      if (parts[4] !== 'pay') {
        sendJson(res, 404, { error: 'Route not found' });
        return;
      }
      const ticketId = parts[3];
      const ticket = await store.markPaid(ticketId);
      sendJson(res, 200, ticket);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/notifications') {
      const email = url.searchParams.get('email');
      if (!email) {
        sendJson(res, 400, { error: 'Email is required.' });
        return;
      }
      sendJson(res, 200, await store.listNotificationsForEmail(email));
      return;
    }

    sendJson(res, 404, { error: 'Route not found' });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Laptop repair app listening on http://localhost:${port}`);
});

async function sendStatic(res, filename) {
  const filePath = join(publicDir, filename);
  const content = await readFile(filePath);
  const extension = extname(filename);
  const contentType = extension === '.css' ? 'text/css' : 'text/html';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error('Body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}
