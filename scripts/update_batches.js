#!/usr/bin/env node
/**
 * Updates the `batch` column on profiles from the Consolidated sheet mapping.
 * Matches xlsx "Register No" -> profiles.student_id.
 *
 * Usage:
 *   node update_batches.js          # dry run: report matches/mismatches only
 *   node update_batches.js --apply  # apply updates to the live DB
 *
 * Requires the `batch` column to already exist on profiles
 * (run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS batch TEXT;).
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let v = m[2] || '';
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

(async () => {
  const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'batch_data.json'), 'utf8'));
  const regs = Object.keys(mapping);
  console.log(`Loaded ${regs.length} reg->batch mappings.`);

  // Fetch all student profiles (id, student_id) in pages.
  const existing = new Map(); // student_id -> id
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, student_id')
      .eq('role', 'Student')
      .range(from, from + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); process.exit(1); }
    data.forEach(r => { if (r.student_id) existing.set(String(r.student_id).trim().toUpperCase(), r.id); });
    if (data.length < PAGE) break;
  }
  console.log(`Fetched ${existing.size} student profiles from DB.`);

  const matched = [];
  const missing = [];
  for (const reg of regs) {
    const id = existing.get(reg.toUpperCase());
    if (id) matched.push({ id, reg, batch: mapping[reg] });
    else missing.push(reg);
  }
  console.log(`Matched: ${matched.length}  |  Not found in DB: ${missing.length}`);
  if (missing.length) {
    console.log('First 20 unmatched reg nos:', missing.slice(0, 20).join(', '));
  }

  if (!APPLY) {
    console.log('\nDRY RUN — no writes. Re-run with --apply to update.');
    return;
  }

  let ok = 0, fail = 0;
  for (const m of matched) {
    const { error } = await supabase
      .from('profiles')
      .update({ batch: m.batch })
      .eq('id', m.id);
    if (error) { fail++; if (fail <= 10) console.error(`Fail ${m.reg}:`, error.message); }
    else ok++;
    if ((ok + fail) % 200 === 0) console.log(`  ...${ok + fail}/${matched.length}`);
  }
  console.log(`\nApplied. Updated: ${ok}  |  Failed: ${fail}`);
})();
