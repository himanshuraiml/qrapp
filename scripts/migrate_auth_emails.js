#!/usr/bin/env node
/**
 * Migration Script - Migrates existing student auth emails to student_id@student.local format.
 * Also cleans up orphaned new auth users created during the aborted seed run.
 *
 * Usage:
 *   Dry run:  node migrate_auth_emails.js
 *   Live run: node migrate_auth_emails.js --run
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wgdhuaatzolkrofkwxdb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REDACTED_SECRET';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const isLive = process.argv.includes('--run');

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseCSV(content) {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0].split(',');

  const idx = {};
  header.forEach((h, i) => { idx[h.trim()] = i; });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];

    // Extract qrData JSON if it exists (everything between first { and last })
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

// ── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log('=== SUPABASE STUDENT AUTH EMAIL MIGRATION ===');
  console.log(`Mode: ${isLive ? 'LIVE' : 'DRY-RUN'}`);
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  const csvPath = path.join(__dirname, 'students.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at: ${csvPath}`);
    process.exit(1);
  }

  // 1. Load CSV data to map passwords
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const csvRows = deduplicate(parseCSV(csvContent));
  const passwordMap = new Map();
  csvRows.forEach(r => {
    const sid = r['Student_ID'];
    const pwd = (r['Password'] && r['Password'].trim()) ? r['Password'].trim() : sid;
    passwordMap.set(sid.toUpperCase(), pwd);
  });
  console.log(`Loaded ${csvRows.length} students from CSV.`);

  // 2. Fetch Profiles from Database
  console.log('Fetching student profiles...');
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, student_id, name')
    .eq('role', 'Student');

  if (profErr) {
    console.error(`Failed to fetch profiles: ${profErr.message}`);
    process.exit(1);
  }
  console.log(`Found ${profiles.length} student profiles in DB.`);

  // Create a fast lookup map of profile IDs (UUIDs) and Student IDs
  const profileIdSet = new Set(profiles.map(p => p.id));
  const profileStudentIdMap = new Map(profiles.map(p => [p.id, p.student_id]));

  // 3. Fetch Auth Users
  console.log('Fetching Supabase auth users...');
  const authUsers = await getAllAuthUsers();
  console.log(`Found ${authUsers.length} total auth users.`);

  // Maps for mapping and checking existence
  const authById = new Map(authUsers.map(u => [u.id, u]));

  // 4. Identify Orphaned New Users
  // These are users with @student.local email that DO NOT have a matching row in profiles
  // (created during the aborted seed run, causing email-taken conflicts for the old UUIDs)
  const orphanedUsers = [];
  authUsers.forEach(u => {
    const email = (u.email || '').toLowerCase();
    if (email.endsWith('@student.local') && !profileIdSet.has(u.id)) {
      orphanedUsers.push(u);
    }
  });

  // 5. Identify Original Users to Migrate
  const usersToMigrate = [];
  profiles.forEach(p => {
    const authUser = authById.get(p.id);
    if (!authUser) {
      console.warn(`WARNING: Profile ID ${p.id} (Student ${p.student_id}) has no corresponding Auth User!`);
      return;
    }
    const currentEmail = (authUser.email || '').toLowerCase();
    const targetEmail = `${p.student_id.toLowerCase()}@student.local`;

    if (currentEmail !== targetEmail) {
      const password = passwordMap.get(p.student_id.toUpperCase()) || p.student_id;
      usersToMigrate.push({
        id: p.id,
        studentId: p.student_id,
        name: p.name,
        currentEmail,
        targetEmail,
        password
      });
    }
  });

  console.log('\n──────────────────────────────────────────────────');
  console.log(`Orphaned new accounts to delete (free up emails): ${orphanedUsers.length}`);
  console.log(`Existing accounts to update to @student.local:    ${usersToMigrate.length}`);
  console.log('──────────────────────────────────────────────────\n');

  if (orphanedUsers.length > 0) {
    console.log('--- ORPHANED ACCOUNTS TO BE DELETED ---');
    orphanedUsers.slice(0, 10).forEach(u => {
      console.log(`  ID: ${u.id} | Email: ${u.email}`);
    });
    if (orphanedUsers.length > 10) console.log(`  ... and ${orphanedUsers.length - 10} more`);
    console.log();
  }

  if (usersToMigrate.length > 0) {
    console.log('--- ACCOUNTS TO BE MIGRATED ---');
    usersToMigrate.slice(0, 10).forEach(m => {
      console.log(`  Student ID: ${m.studentId} | Name: ${m.name} | ${m.currentEmail} → ${m.targetEmail}`);
    });
    if (usersToMigrate.length > 10) console.log(`  ... and ${usersToMigrate.length - 10} more`);
    console.log();
  }

  if (!isLive) {
    console.log('👉 DRY-RUN complete. No database changes were made.');
    console.log('👉 To run the migration live, run:');
    console.log('   node migrate_auth_emails.js --run\n');
    return;
  }

  // 6. Execute Live Migration
  console.log('🚀 Starting live migration...');

  // Phase A: Delete orphaned accounts
  let deletedCount = 0;
  let deleteErrorCount = 0;
  if (orphanedUsers.length > 0) {
    console.log(`\nPhase 1/2: Deleting ${orphanedUsers.length} orphaned @student.local accounts...`);
    for (let i = 0; i < orphanedUsers.length; i++) {
      const u = orphanedUsers[i];
      process.stdout.write(`[${i+1}/${orphanedUsers.length}] Deleting ${u.email} ... `);
      
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) {
        console.log(`ERROR: ${error.message}`);
        deleteErrorCount++;
      } else {
        console.log('Deleted successfully');
        deletedCount++;
      }

      // Throttle slightly to stay within API rate limits
      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 300));
    }
  }

  // Phase B: Update original accounts to new format and set password
  let migratedCount = 0;
  let migrationErrorCount = 0;
  if (usersToMigrate.length > 0) {
    console.log(`\nPhase 2/2: Migrating ${usersToMigrate.length} student auth emails...`);
    for (let i = 0; i < usersToMigrate.length; i++) {
      const m = usersToMigrate[i];
      process.stdout.write(`[${i+1}/${usersToMigrate.length}] Updating ${m.studentId} (${m.currentEmail} → ${m.targetEmail}) ... `);

      const { error } = await supabase.auth.admin.updateUserById(m.id, {
        email: m.targetEmail,
        password: m.password,
        email_confirm: true
      });

      if (error) {
        console.log(`ERROR: ${error.message}`);
        migrationErrorCount++;
      } else {
        console.log('Migrated successfully');
        migratedCount++;
      }

      // Throttle slightly to stay within API rate limits
      if ((i + 1) % 10 === 0) await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('MIGRATION SUMMARY:');
  console.log(`Orphaned Deleted:  ${deletedCount} / ${orphanedUsers.length} (Errors: ${deleteErrorCount})`);
  console.log(`Accounts Migrated: ${migratedCount} / ${usersToMigrate.length} (Errors: ${migrationErrorCount})`);
  console.log('──────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\nAn unexpected error occurred during execution:');
  console.error(err);
  process.exit(1);
});
