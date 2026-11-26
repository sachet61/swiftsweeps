import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveCandidateEnvPaths(cwd: string): string[] {
  const candidates = [path.resolve(cwd, '.env')];

  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const packageRootEnv = path.resolve(thisDir, '../..', '.env');
    if (!candidates.includes(packageRootEnv)) {
      candidates.push(packageRootEnv);
    }
  } catch {
    // Ignore URL resolution edge cases in non-file module contexts.
  }

  return candidates;
}

/**
 * Loads `.env` from the working directory or package root when present without
 * overwriting variables already provided by systemd EnvironmentFile or shell.
 */
export function loadLocalDotEnv(cwd: string = process.cwd()): void {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  for (const envPath of resolveCandidateEnvPaths(cwd)) {
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
      return;
    }
  }
}
