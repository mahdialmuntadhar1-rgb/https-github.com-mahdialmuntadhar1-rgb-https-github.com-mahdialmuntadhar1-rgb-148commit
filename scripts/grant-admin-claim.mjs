#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith('--')) continue;
    if (!value || value.startsWith('--')) {
      args[key.slice(2)] = true;
      continue;
    }

    args[key.slice(2)] = value;
    i += 1;
  }

  return args;
}

function assertUid(uid) {
  if (!uid || typeof uid !== 'string') {
    throw new Error('Missing --uid <firebase_uid>.');
  }

  if (!/^[A-Za-z0-9:_-]{6,128}$/.test(uid)) {
    throw new Error('UID format is invalid. Refusing to continue.');
  }
}

async function loadServiceAccount(pathOrJson) {
  if (!pathOrJson) {
    throw new Error('Provide --serviceAccount <path-to-service-account.json>.');
  }

  const raw = await readFile(pathOrJson, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error('Service account JSON is missing required fields.');
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uid = args.uid;
  const yes = Boolean(args.yes);

  assertUid(uid);

  if (!yes) {
    throw new Error('Dry-run safety is enabled. Re-run with --yes to apply admin claim.');
  }

  const serviceAccount = await loadServiceAccount(args.serviceAccount);

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: String(args.project || serviceAccount.project_id)
    });
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingClaims = user.customClaims || {};
  const updatedClaims = { ...existingClaims, admin: true };

  await auth.setCustomUserClaims(uid, updatedClaims);

  console.log(`✅ Admin claim applied to UID: ${uid}`);
  console.log(`Project: ${args.project || serviceAccount.project_id}`);
  console.log(`Claims: ${JSON.stringify(updatedClaims)}`);
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
