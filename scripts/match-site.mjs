#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS_DIR = path.join(ROOT, 'references', 'site-patterns');
const query = (process.argv[2] || '').trim();

if (!query || !fs.existsSync(PATTERNS_DIR)) {
  process.exit(0);
}

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const entry of fs.readdirSync(PATTERNS_DIR, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md')) {
    continue;
  }

  const filePath = path.join(PATTERNS_DIR, entry.name);
  const raw = fs.readFileSync(filePath, 'utf8');
  const domain = entry.name.replace(/\.md$/, '');

  const aliasesLine = raw.split(/\r?\n/).find((line) => line.startsWith('aliases:')) || '';
  const aliases = aliasesLine
    .replace(/^aliases:\s*/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const patterns = [domain, ...aliases].map(escaped).join('|');
  if (!patterns) {
    continue;
  }

  const re = new RegExp(patterns, 'i');
  if (!re.test(query)) {
    continue;
  }

  const matches = [...raw.matchAll(/^---\s*$/gm)];
  const body =
    matches.length >= 2
      ? raw.slice(matches[1].index + matches[1][0].length).replace(/^\r?\n/, '')
      : raw;

  process.stdout.write(`--- site pattern: ${domain} ---\n`);
  process.stdout.write(body.trimEnd());
  process.stdout.write('\n\n');
}
