#!/usr/bin/env node
/**
 * Upsert profiles for all auth users that were created by seed_students.js
 * but whose profile inserts failed (profiles table didn't exist yet).
 *
 * Usage: node fix_profiles.js [path/to/students.csv]
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL         = 'https://wgdhuaatzolkrofkwxdb.supabase.co';
const SUPABASE_SERVICE_KEY = 'REDACTED_SECRET';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function parseYear(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d)/);
  return m ? parseInt(m[1], 10) : null;
}

function fixEmail(email) {
  if (!email) return null;
  return String(email).trim().replace(/\.edu\s+in$/, '.edu.in');
}

function parseCSV(content) {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0].split(',');
  const idx    = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row  = {};
    Object.entries(idx).forEach(([key, j]) => {
      row[key] = (cols[j] || '').trim().replace(/^"|"$/g, '');
    });
    if (row['Student_ID']) rows.push(row);
  }
  return rows;
}

async function getAllAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error('listUsers error:', error.message); break; }
    if (!data.users.length) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return users;
}

async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'students.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  // Build email→row map from CSV
  const rows   = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  const byEmail = {};
  for (const r of rows) {
    const email = fixEmail(r['StudentMail']);
    if (email) byEmail[email.toLowerCase()] = r;
  }
  console.log(`CSV loaded: ${rows.length} students`);

  // Fetch all auth users
  console.log('Fetching auth users...');
  const authUsers = await getAllAuthUsers();
  console.log(`Found ${authUsers.length} auth users`);

  let fixed = 0, skipped = 0, errors = 0;

  for (let i = 0; i < authUsers.length; i++) {
    const u     = authUsers[i];
    const email = (u.email || '').toLowerCase();
    const r     = byEmail[email];

    if (!r) {
      // Not a student from our CSV (likely Admin/Faculty account) — skip
      skipped++;
      continue;
    }

    const sid  = r['Student_ID'];
    const name = (r['Name'] || '').trim();
    const dept = (r['Department'] || '').trim();
    const sec  = (r['Section'] || '').trim();
    const year = parseYear(r['Year']);

    process.stdout.write(`[${i+1}/${authUsers.length}] ${sid} ... `);

    const { error: profErr } = await supabase.from('profiles').upsert({
      id:         u.id,
      name,
      role:       'Student',
      student_id: sid,
      department: dept,
      section:    sec,
      year,
      status:     'Active'
    }, { onConflict: 'id' });

    if (profErr) {
      console.error(`ERROR: ${profErr.message}`);
      errors++;
    } else {
      console.log('OK');
      fixed++;
    }

    if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n──────────────────────────────────');
  console.log(`Done.  Fixed: ${fixed}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
