#!/usr/bin/env node
/**
 * One-off: create the 2 batch-P students from the Consolidated sheet that
 * were missing from the DB. Section left empty (to be set later by admin).
 *
 * Usage: node create_missing_students.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = m[2] || '';
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  });
}
loadEnv();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Section intentionally omitted (null) — admin will set it later.
const students = [
  { student_id: 'RA2311026050472', name: 'INDAL KUMAR', department: 'III CSE E', year: 3, batch: 'P' },
  { student_id: 'RA2311003050773', name: 'SHALINI M',   department: 'III CSE F', year: 3, batch: 'P' },
];

(async () => {
  for (const s of students) {
    const sid = s.student_id.toUpperCase();
    const email = `${sid.toLowerCase()}@student.local`;
    const password = sid; // matches seed default (reg no as password)

    // Skip if profile already exists
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('student_id', sid).maybeSingle();
    if (existing) { console.log(`${sid}: profile already exists, skipping.`); continue; }

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { role: 'Student', name: s.name, student_id: sid },
    });
    if (authErr) { console.error(`${sid}: AUTH CREATE ERROR: ${authErr.message}`); continue; }

    const { error: profErr } = await supabase.from('profiles').insert({
      id:         authData.user.id,
      name:       s.name,
      role:       'Student',
      student_id: sid,
      department: s.department,
      year:       s.year,
      section:    null,      // left empty per request
      batch:      s.batch,
      status:     'Active',
    });
    if (profErr) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error(`${sid}: PROFILE INSERT ERROR: ${profErr.message}`);
      continue;
    }
    console.log(`${sid}: CREATED (${s.name}, ${s.department}, batch ${s.batch}, section empty)`);
  }
})();
