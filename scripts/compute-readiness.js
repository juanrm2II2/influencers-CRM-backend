#!/usr/bin/env node
/**
 * Pre-ICO readiness score calculator.
 *
 * Parses SECURITY_AUDIT_CHECKLIST.md and computes:
 *
 *   score = 100 - 12·(open High) - 4·(open Medium) - 1·(open Low)
 *
 * Usage (no flags): writes a human summary to stdout and exits 0.
 *
 *   node scripts/compute-readiness.js
 *
 * CI usage:
 *
 *   node scripts/compute-readiness.js --min 90
 *
 * Exits non-zero when the score is below `--min`, so the workflow
 * fails until findings are remediated.
 *
 * The "open" count is determined by lines that begin with
 * `- [ ] **OPEN — Hn`, `Mn`, or `Ln` markers under each section
 * heading; resolved items move to `- [x] **RESOLVED` and stop
 * counting.
 *
 * The script intentionally has zero runtime dependencies so it can
 * run in any Node 20+ environment without `npm ci`.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const minIdx = args.indexOf('--min');
const minScore = minIdx >= 0 ? parseInt(args[minIdx + 1], 10) : null;

const checklistPath = path.join(
  __dirname,
  '..',
  'SECURITY_AUDIT_CHECKLIST.md',
);

if (!fs.existsSync(checklistPath)) {
  console.error(`Audit checklist not found at ${checklistPath}`);
  process.exit(2);
}

const text = fs.readFileSync(checklistPath, 'utf8');

/**
 * Count open findings of a given severity letter (H/M/L).
 * A finding is "open" if its line starts with `- [ ] **OPEN —`
 * followed by the severity letter and a digit.
 */
function countOpen(letter) {
  const re = new RegExp(
    `^- \\[ \\] \\*\\*OPEN — ${letter}\\d+`,
    'gm',
  );
  const matches = text.match(re) ?? [];
  return matches.length;
}

const high = countOpen('H');
const medium = countOpen('M');
const low = countOpen('L');

const score = 100 - 12 * high - 4 * medium - 1 * low;

const summary = {
  high,
  medium,
  low,
  score,
  formula: '100 - 12*H - 4*M - 1*L',
  threshold: minScore,
};

console.log('Pre-ICO Readiness Report');
console.log('========================');
console.log(`  Open High:    ${high}`);
console.log(`  Open Medium:  ${medium}`);
console.log(`  Open Low:     ${low}`);
console.log(`  Score:        ${score} / 100`);
if (minScore !== null && Number.isFinite(minScore)) {
  console.log(`  Threshold:    ${minScore}`);
}

// Emit machine-readable JSON on the last line for CI consumption.
console.log(JSON.stringify(summary));

if (minScore !== null && Number.isFinite(minScore) && score < minScore) {
  console.error(
    `\nFAIL: readiness score ${score} is below the required minimum of ${minScore}.`,
  );
  process.exit(1);
}
