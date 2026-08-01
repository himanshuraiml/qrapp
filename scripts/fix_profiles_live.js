#!/usr/bin/env node
/**
 * Data Migration Script — Fixes student profiles in the live database.
 * Corrects wrong section values like "B.Tech" and extracts department, section,
 * and year from Roman numeral department strings (e.g. III-ECE-B -> CSE/ECE/etc, section B).
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

function parseDepartmentSectionYear(rawDept, rawSec, rawYearInt) {
  let department = String(rawDept || '').trim();
  let section = String(rawSec || '').trim();
  let year = rawYearInt;

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
    // If not roman-patterned, just strip wrong "B.Tech" entries from section
    if (section === 'B.Tech' || section === 'Btech') {
      section = 'A';
    }
  }

  return { department, section, year };
}

async function main() {
  console.log('=== FIXING PROFILES TABLE ENTRIES ===');
  console.log(`Connecting to: ${SUPABASE_URL}`);

  // 1. Fetch all student profiles
  console.log('Fetching student profiles...');
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'Student');

  if (error) {
    console.error(`Error fetching profiles: ${error.message}`);
    process.exit(1);
  }

  console.log(`Found ${profiles.length} student profiles to evaluate.`);

  let updated = 0, unchanged = 0, errors = 0;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const { department: cleanDept, section: cleanSec, year: cleanYear } = parseDepartmentSectionYear(p.department, p.section, p.year);

    // Only update if there is actually a change in the values
    if (cleanDept !== p.department || cleanSec !== p.section || cleanYear !== p.year) {
      process.stdout.write(`[${i+1}/${profiles.length}] Updating ${p.student_id}: ` +
        `"${p.department}" -> "${cleanDept}", "${p.section}" -> "${cleanSec}", "${p.year}" -> "${cleanYear}" ... `);

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({
          department: cleanDept,
          section:    cleanSec,
          year:       cleanYear
        })
        .eq('id', p.id);

      if (updateErr) {
        console.log(`ERROR: ${updateErr.message}`);
        errors++;
      } else {
        console.log('UPDATED');
        updated++;
      }
    } else {
      unchanged++;
    }

    // Rate limiting throttle
    if ((i + 1) % 20 === 0) await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('DATA REPAIR COMPLETE:');
  console.log(`Updated Records: ${updated}`);
  console.log(`Unchanged:       ${unchanged}`);
  console.log(`Errors:          ${errors}`);
  console.log('──────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
