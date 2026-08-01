#!/usr/bin/env node
/**
 * Seeding & Migration Script — creates Supabase auth users + profiles for all students.
 * Fully idempotent and self-healing:
 *  - Automatically migrates existing accounts with old email addresses to @student.local
 *  - Automatically deletes or links duplicate/orphaned accounts to avoid key conflicts
 *
 * Usage: node seed_students.js [path/to/students.csv]
 * Default CSV: ./students.csv (in same directory)
 */

const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ── Load Environment Variables ──────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove wrapping quotes
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function parseCSV(content) {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0].split(',');

  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];

    // Extract qrData JSON if it exists
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

async function getAllAuthUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(`Error retrieving auth users: ${error.message}`);
      break;
    }
    if (!data.users.length) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  return users;
}

// ── Main Seeding Execution ───────────────────────────────────────────────────
async function main() {
  const csvPath = process.argv[2] || path.join(__dirname, 'students.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const raw  = fs.readFileSync(csvPath, 'utf8');
  const rows = deduplicate(parseCSV(raw));

  console.log('=== IDEMPOTENT SUPABASE STUDENT SEEDING & MIGRATION ===');
  console.log(`Parsed ${rows.length} unique students from CSV`);

  // 1. Fetch Profiles from DB
  console.log('Fetching existing student profiles...');
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, student_id, name')
    .eq('role', 'Student');

  if (profErr) {
    console.error(`PROFILE FETCH ERROR: ${profErr.message}`);
    process.exit(1);
  }
  
  // Create profile lookups
  const profilesByStudentId = new Map(profiles.map(p => [p.student_id.toUpperCase(), p]));
  console.log(`Loaded ${profiles.length} profiles from database.`);

  // 2. Fetch Auth Users from DB
  console.log('Fetching existing auth users...');
  const authUsers = await getAllAuthUsers();
  
  // Create auth lookups
  const authById = new Map(authUsers.map(u => [u.id, u]));
  const authByEmail = new Map(authUsers.map(u => [(u.email || '').toLowerCase(), u]));
  console.log(`Loaded ${authUsers.length} auth users from database.\n`);

  console.log('Starting migration and seeding process...');

  let created = 0, migrated = 0, linked = 0, skipped = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i];
    const sid = r['Student_ID'];
    if (!sid) { skipped++; continue; }

    const email    = `${sid.toLowerCase()}@student.local`;
    const password = (r['Password'] && r['Password'].trim()) ? r['Password'].trim() : sid;
    const name     = (r['Name'] || '').trim();
    const { department: dept, section: sec, year } = parseDepartmentSectionYear(
      (r['Department'] || '').trim(),
      (r['Section'] || '').trim(),
      r['Year']
    );

    process.stdout.write(`[${i+1}/${rows.length}] ${sid} ... `);

    let targetUserId = null;
    let isNewAccount = false;
    let didMigrateAuth = false;

    // Check if a profile already exists for this Student ID
    const existingProfile = profilesByStudentId.get(sid.toUpperCase());

    if (existingProfile) {
      // ── CASE 1: Profile already exists (UUID is existingProfile.id) ──
      targetUserId = existingProfile.id;
      const authUser = authById.get(targetUserId);

      if (authUser) {
        const currentEmail = (authUser.email || '').toLowerCase();
        
        if (currentEmail !== email) {
          // Email needs migration to @student.local
          
          // If the target email is already registered to a different user ID (e.g. orphaned account)
          // we must delete that orphaned account first so the email can be updated.
          const conflictingUser = authByEmail.get(email);
          if (conflictingUser && conflictingUser.id !== targetUserId) {
            await supabase.auth.admin.deleteUser(conflictingUser.id);
          }

          // Update the auth user's email and password
          const { error: updateErr } = await supabase.auth.admin.updateUserById(targetUserId, {
            email,
            password,
            email_confirm: true
          });

          if (updateErr) {
            console.error(`AUTH UPDATE ERROR: ${updateErr.message}`);
            errors++;
            continue;
          }
          didMigrateAuth = true;
          migrated++;
        }
      }
    } else {
      // ── CASE 2: Profile does NOT exist ──
      
      // Check if an auth user with the target email already exists (orphaned account)
      const existingAuthUser = authByEmail.get(email);

      if (existingAuthUser) {
        // Sub-case A: Orphaned auth user exists — link to it!
        targetUserId = existingAuthUser.id;
        
        // Ensure their password is correct
        await supabase.auth.admin.updateUserById(targetUserId, {
          password,
          email_confirm: true
        });
        linked++;
      } else {
        // Sub-case B: Create a brand new account
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, student_id: sid }
        });

        if (authErr) {
          console.error(`AUTH CREATE ERROR: ${authErr.message}`);
          errors++;
          continue;
        }

        targetUserId = authData.user.id;
        isNewAccount = true;
        created++;
      }
    }

    // 3. Remove any duplicate profile rows for this student_id that point to a DIFFERENT UUID.
    //    This prevents the unique constraint violation on profiles_student_id_key which occurs
    //    when previous seed runs created separate profile rows for the same student_id.
    const { error: cleanupErr } = await supabase
      .from('profiles')
      .delete()
      .eq('student_id', sid)
      .neq('id', targetUserId);

    if (cleanupErr) {
      console.error(`CLEANUP ERROR for ${sid}: ${cleanupErr.message}`);
      // Non-fatal — log and attempt the upsert anyway
    }

    // 4. Upsert profile row using the resolved targetUserId
    const { error: profErr } = await supabase.from('profiles').upsert({
      id:         targetUserId,
      name,
      role:       'Student',
      student_id: sid,
      department: dept,
      section:    sec,
      year,
      status:     'Active'
    }, { onConflict: 'id' });

    if (profErr) {
      console.error(`PROFILE UPSERT ERROR: ${profErr.message}`);
      errors++;
    } else {
      if (isNewAccount) {
        console.log('CREATED');
      } else if (didMigrateAuth) {
        console.log('MIGRATED & UPDATED');
      } else if (existingProfile) {
        console.log('OK (Profile Details Verified)');
      } else {
        console.log('LINKED & VERIFIED');
      }
    }

    // Throttle slightly to respect Supabase API rate limits
    if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('SEEDING & MIGRATION SUMMARY:');
  console.log(`Created New:     ${created}`);
  console.log(`Migrated Email:  ${migrated}`);
  console.log(`Linked Orphaned: ${linked}`);
  console.log(`Skipped:         ${skipped}`);
  console.log(`Errors:          ${errors}`);
  console.log('──────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
