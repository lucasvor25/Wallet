// Garante um .env para o docker compose e valida as portas antes de subir.
import { copyFileSync, existsSync } from 'node:fs';
import { preflight } from './preflight.mjs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log(
    '.env não encontrado: criado a partir do .env.example. Revise os valores (JWT_SECRET, senhas) antes de usar fora da sua máquina.',
  );
}

await preflight();
