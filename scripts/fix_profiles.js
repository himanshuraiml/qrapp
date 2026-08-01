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

function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[match[1]] = value;
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function parseDepartmentSectionYear(rawDept, rawSec, rawYearString) {
  let department = String(rawDept || '').trim();
  let section = String(rawSec || '').trim();
  let year = null;

  // Resolve Year
  if (rawYearString) {
    const ym = String(rawYearString).match(/(\d)/);
    year = ym ? parseInt(ym[1], 10) : null;
  }

  const romanToYear = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4 };
  const yearToRoman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

  // Match e.g. "III-ECE-B" or "III-Biotech"
  const match = department.match(/^(I|II|III|IV)-([A-Za-z\s&]+)(?:-([A-Za-z]))?$/i);

  if (match) {
    const roman = match[1].toUpperCase();
    const branch = match[2].trim().toUpperCase();
    const secLetter = match[3];

    year = romanToYear[roman] || year;
    section = secLetter ? secLetter.toUpperCase() : 'A';
    department = `${roman} ${branch} ${section}`;
  } else if (department.toUpperCase() === 'IT' || section.toUpperCase() === 'IT') {
    // Special rule for IT students: department -> "[Roman] IT A", section -> "A"
    const roman = yearToRoman[year] || 'III';
    section = 'A';
    department = `${roman} IT A`;
  } else {
    if (section === 'B.Tech' || section === 'Btech') {
      section = 'A';
    }
  }

  return { department, section, year };
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
    const { department: dept, section: sec, year } = parseDepartmentSectionYear(
      (r['Department'] || '').trim(),
      (r['Section'] || '').trim(),
      r['Year']
    );

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
