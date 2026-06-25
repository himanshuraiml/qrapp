const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = '/Users/himanshurai/project/qrapp/.env.local';
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fetchAll(table, selectStr, queryBuilderFn) {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase.from(table).select(selectStr).range(page * pageSize, (page + 1) * pageSize - 1);
    if (queryBuilderFn) {
      query = queryBuilderFn(query);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      break;
    }
    allData = allData.concat(data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }
  return allData;
}

async function blockStudents(studentIds) {
  console.log(`Blocking ${studentIds.length} students...`);
  const chunkSize = 100;
  for (let i = 0; i < studentIds.length; i += chunkSize) {
    const chunk = studentIds.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('profiles')
      .update({ qr_blocked: true })
      .in('student_id', chunk);
    if (error) {
      console.error(`Error blocking chunk:`, error);
    } else {
      console.log(`Blocked chunk ${i / chunkSize + 1}`);
    }
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode !== 'strict' && mode !== 'group') {
    console.log('Please specify mode: "strict" (block 744, based on < 4 sessions) or "group" (block 61, based on missed conducted sessions for their group)');
    process.exit(1);
  }

  const students = await fetchAll('profiles', 'student_id, name, qr_blocked, status, department, year, section, batch', q => 
    q.eq('role', 'Student').eq('status', 'Active')
  );

  const attendance = await fetchAll('attendance', 'student_id, session, department, year, section, batch', q => q.eq('date', '2026-06-24'));
  
  const attendanceMap = {};
  attendance.forEach(a => {
    if (!attendanceMap[a.student_id]) {
      attendanceMap[a.student_id] = new Set();
    }
    attendanceMap[a.student_id].add(a.session);
  });

  const toBlock = [];

  if (mode === 'strict') {
    // Strict mode: did not attend all 4 sessions
    students.forEach(s => {
      const attended = attendanceMap[s.student_id] || new Set();
      const hasAll4 = attended.has('FN1') && attended.has('FN2') && attended.has('AN1') && attended.has('AN2');
      if (!hasAll4 && !s.qr_blocked) {
        toBlock.push(s.student_id);
      }
    });
  } else {
    // Group mode: missed at least one session conducted for their group
    students.forEach(s => {
      const conducted = new Set();
      attendance.forEach(a => {
        if (a.department === s.department && a.year === s.year) {
          if (
            (s.batch && s.batch !== '' && a.batch === s.batch)
            ||
            ((!s.batch || s.batch === '') && a.section === s.section && (!a.batch || a.batch === ''))
          ) {
            conducted.add(a.session);
          }
        }
      });

      if (conducted.size === 0) return; // safe

      const attended = attendanceMap[s.student_id] || new Set();
      const missed = [...conducted].some(sess => !attended.has(sess));
      if (missed && !s.qr_blocked) {
        toBlock.push(s.student_id);
      }
    });
  }

  console.log(`Identified ${toBlock.length} students to block in "${mode}" mode.`);
  if (toBlock.length > 0) {
    await blockStudents(toBlock);
    console.log('Blocking complete!');
  } else {
    console.log('No new students to block.');
  }
}

main().catch(console.error);
