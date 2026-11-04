// Verifica, antes do docker compose up, se as portas publicadas no host estão livres.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';

function readDotEnv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

// Mesma precedência do compose: variável do shell vence o arquivo .env.
function setting(dotEnv, name, fallback) {
  return process.env[name] ?? dotEnv[name] ?? fallback;
}

// Porta já publicada por este projeto (ex.: segundo docker:up) não é conflito.
function publishedByCompose(service, containerPort, hostPort) {
  try {
    const out = execFileSync(
      'docker',
      ['compose', 'port', service, String(containerPort)],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    // Saída no formato "127.0.0.1:5433"; só conta se for a mesma porta verificada.
    return out
      .toString()
      .trim()
      .split(/\r?\n/)
      .some((line) => line.endsWith(`:${hostPort}`));
  } catch {
    return false;
  }
}

function tryListen(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (err) => resolve(err.code ?? 'ERRO'));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(null));
    });
  });
}

async function isPortFree(port) {
  for (const host of ['0.0.0.0', '127.0.0.1']) {
    if ((await tryListen(port, host)) !== null) return false;
  }
  return true;
}

export async function preflight() {
  const dotEnv = readDotEnv('.env');
  const checks = [
    {
      variable: 'DATABASE_HOST_PORT',
      port: Number(setting(dotEnv, 'DATABASE_HOST_PORT', '5433')),
      service: 'db',
      containerPort: 5432,
      label: 'banco (Postgres)',
    },
    {
      variable: 'API_PORT',
      port: Number(setting(dotEnv, 'API_PORT', '3000')),
      service: 'api',
      containerPort: 3000,
      label: 'API',
    },
  ];

  const busy = [];
  for (const check of checks) {
    if (await isPortFree(check.port)) continue;
    if (publishedByCompose(check.service, check.containerPort, check.port))
      continue;
    busy.push(check);
  }

  if (busy.length === 0) return;

  for (const check of busy) {
    console.error(
      `Porta ${check.port} (${check.label}) já está em uso por outro processo.`,
    );
    console.error(
      `  Libere a porta (ex.: pare um "npm run start:dev" ou outro container) ou mude ${check.variable} no .env, por exemplo ${check.variable}=${check.port + 1}.`,
    );
  }
  process.exit(1);
}
