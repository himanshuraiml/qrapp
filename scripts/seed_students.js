#!/usr/bin/env node
/**
 * Seed script — creates Supabase auth users + profiles for all students.
 * Usage: node seed_students.js [path/to/students.csv]
 * Default CSV: ./students.csv (in same directory)
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL          = 'https://wgdhuaatzolkrofkwxdb.supabase.co';
const SUPABASE_SERVICE_KEY  = 'REDACTED_SECRET';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseYear(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d)/);
  return m ? parseInt(m[1], 10) : null;
}

function fixEmail(email) {
  if (!email) return null;
  // fix "as3130@srmist.edu in" typo → "as3130@srmist.edu.in"
  return email.trim().replace(/\.edu\s+in$/, '.edu.in');
}

function parseCSV(content) {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0].split(',');

  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // handle commas inside JSON qrData field — split carefully
    const raw = lines[i];

    // Extract qrData JSON (everything between first { and last })
    const qrStart = raw.indexOf('"{');
    const qrEnd   = raw.lastIndexOf('}"');
    let qrData = '';
    let withoutQr = raw;
    if (qrStart !== -1 && qrEnd !== -1) {
      qrData    = raw.slice(qrStart, qrEnd + 2);
      withoutQr = raw.slice(0, qrStart) + '""' + raw.slice(qrEnd + 2);
    }

    const cols = withoutQr.split(',');
    const row  = {};
    Object.entries(idx).forEach(([key, i]) => {
      row[key] = (cols[i] || '').trim().replace(/^"|"$/g, '');
    });
    if (qrData) row['qrData'] = qrData;

    if (row['Student_ID']) rows.push(row);
  }
  return rows;
}

function deduplicate(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (seen.has(r['Student_ID'])) return false;
    seen.add(r['Student_ID']);
    return true;
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'students.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw  = fs.readFileSync(csvPath, 'utf8');
  const rows = deduplicate(parseCSV(raw));

  console.log(`Parsed ${rows.length} unique students from CSV`);

  let created = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sid = r['Student_ID'];
    const email = fixEmail(r['StudentMail']);
    // Password: use CSV value; fallback to Student_ID
    const password = (r['Password'] && r['Password'].trim()) ? r['Password'].trim() : sid;
    const name   = (r['Name'] || '').trim();
    const dept   = (r['Department'] || '').trim();
    const sec    = (r['Section'] || '').trim();
    const year   = parseYear(r['Year']);

    if (!email || !email.includes('@')) {
      console.warn(`[${i+1}] SKIP ${sid} — invalid email: "${email}"`);
      skipped++;
      continue;
    }

    process.stdout.write(`[${i+1}/${rows.length}] ${sid} ... `);

    // 1. Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, student_id: sid }
    });

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.code === 'email_exists') {
        console.log('already exists — skipped');
        skipped++;
      } else {
        console.error(`AUTH ERROR: ${authErr.message}`);
        errors++;
      }
      continue;
    }

    const userId = authData.user.id;

    // 2. Upsert profile
    const { error: profErr } = await supabase.from('profiles').upsert({
      id:         userId,
      name,
      role:       'Student',
      student_id: sid,
      department: dept,
      section:    sec,
      year,
      status:     'Active'
    }, { onConflict: 'id' });

    if (profErr) {
      console.error(`PROFILE ERROR: ${profErr.message}`);
      errors++;
    } else {
      console.log('OK');
      created++;
    }

    // Throttle — Supabase free tier rate-limits admin API
    if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n──────────────────────────────────');
  console.log(`Done.  Created: ${created}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
