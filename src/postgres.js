import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function createPostgresClient(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure a Postgres connection string.');
  }

  async function run(sql) {
    const { stdout, stderr } = await execFileAsync(
      'psql',
      ['-X', '-v', 'ON_ERROR_STOP=1', '-d', databaseUrl, '-t', '-A', '-c', sql],
      {
        env: process.env,
        maxBuffer: 1024 * 1024 * 10
      }
    );

    if (stderr && stderr.trim()) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  }

  async function queryJson(sql, fallback) {
    const raw = await run(sql);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  }

  return {
    run,
    queryJson
  };
}

export function toSqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function toSqlNumber(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error('Expected a numeric value.');
  }
  return String(parsed);
}
