import type { PoolConfig } from 'pg';

/** Strip optional surrounding quotes from .env values. */
function stripQuotes(s: string | undefined): string {
  if (!s) return '';
  const t = s.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parsePostgresUrlToConfig(raw: string): PoolConfig {
  let u = raw.trim();
  if (u.startsWith('postgres://')) {
    u = 'postgresql://' + u.slice('postgres://'.length);
  }
  if (!u.startsWith('postgresql://')) {
    throw new Error('POSTGRES_URL must start with postgres:// or postgresql://');
  }
  const rest = u.slice('postgresql://'.length);
  const slashIdx = rest.indexOf('/');
  const netloc = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  const pathPart = slashIdx >= 0 ? rest.slice(slashIdx) : '/';
  const database = safeDecode(pathPart.replace(/^\//, '').split('?')[0] || 'postgres');

  if (!netloc.includes('@')) {
    const colonIdx = netloc.lastIndexOf(':');
    if (colonIdx > 0 && /^\d+$/.test(netloc.slice(colonIdx + 1))) {
      return {
        host: netloc.slice(0, colonIdx),
        port: parseInt(netloc.slice(colonIdx + 1), 10),
        user: 'postgres',
        password: '',
        database,
      };
    }
    return {
      host: netloc,
      port: 5432,
      user: 'postgres',
      password: '',
      database,
    };
  }

  const atIdx = netloc.lastIndexOf('@');
  const userinfo = netloc.slice(0, atIdx);
  const hostport = netloc.slice(atIdx + 1);
  const colonIdx = userinfo.indexOf(':');
  const user = colonIdx >= 0 ? safeDecode(userinfo.slice(0, colonIdx)) : safeDecode(userinfo);
  const password = colonIdx >= 0 ? safeDecode(userinfo.slice(colonIdx + 1)) : '';

  let host: string;
  let port = 5432;
  const hColon = hostport.lastIndexOf(':');
  if (hColon > 0 && /^\d+$/.test(hostport.slice(hColon + 1))) {
    host = hostport.slice(0, hColon);
    port = parseInt(hostport.slice(hColon + 1), 10);
  } else {
    host = hostport;
  }

  return { host, port, user, password, database };
}

export function buildPgPoolConfig(): PoolConfig {
  const password = stripQuotes(process.env.POSTGRES_PASSWORD);
  if (password) {
    return {
      host: stripQuotes(process.env.POSTGRES_HOST) || 'postgres',
      port: parseInt(stripQuotes(process.env.POSTGRES_PORT) || '5432', 10),
      user: stripQuotes(process.env.POSTGRES_USER) || 'postgres',
      password,
      database: stripQuotes(process.env.POSTGRES_DB) || 'notes',
    };
  }

  const url = stripQuotes(process.env.POSTGRES_URL) || stripQuotes(process.env.DATABASE_URL);
  if (!url) {
    return { connectionString: 'postgres://postgres:postgres@postgres:5432/notes' };
  }

  try {
    return parsePostgresUrlToConfig(url);
  } catch {
    return { connectionString: url };
  }
}
