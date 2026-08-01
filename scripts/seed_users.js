#!/usr/bin/env node
/**
 * Seed Faculty and Admin users from the Users sheet.
 * Usage: node seed_users.js
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

const USERS = [
  { email: 'himanshr2@srmist.edu.in',                         name: 'System Admin',                   role: 'Admin',   password: 'admin123'  },
  { email: 'anitaprr@srmist.edu.in',                          name: 'Dr Anita',                        role: 'Admin',   password: 'anita123'  },
  { email: 'ishusekar.2000@gmail.com',                        name: 'Iswarya',                         role: 'Faculty', password: 'cdc@123'   },
  { email: 'jenifertherasal09@gmail.com',                     name: 'Jenifer.A',                       role: 'Faculty', password: 'cdc@123'   },
  { email: 'sujatha17be@gmail.com',                           name: 'Sujatha',                         role: 'Faculty', password: 'cdc@123'   },
  { email: 'jansi.2214@gmail.com',                            name: 'Jansi S',                         role: 'Faculty', password: 'cdc@123'   },
  { email: 'arjunsarathy0413@gmail.com',                      name: 'Arjun Sarathy J',                 role: 'Faculty', password: 'cdc@123'   },
  { email: 'jeganj@srmist.edu.in',                            name: 'Dr Jegan',                        role: 'Faculty', password: 'cdc@123'   },
  { email: 'kaliappan.a@ist.srmtrichy.edu.in',                name: 'Dr Kaliappan',                    role: 'Faculty', password: 'cdc@123'   },
  { email: 'hariharan.p@ist.srmtrichy.edu.in',                name: 'Dr P Hariharan',                  role: 'Faculty', password: 'cdc@113'   },
  { email: 'bharathv6@srmist.edu.in',                         name: 'Dr V Barathi',                    role: 'Faculty', password: 'cdc@123'   },
  { email: 'levinanbumichelegomez.p@ist.srmtrichy.edu.in',    name: 'Dr. Levin Anbu Michele Gomez',    role: 'Faculty', password: 'cdc@123'   },
  { email: 'cg@srmist.edu.in',                                name: 'Dr C Gunasundari',                role: 'Faculty', password: 'cdc@123'   },
  { email: 'nareshkr@srmist.edu.in',                          name: 'Mr Nareshkumar',                  role: 'Faculty', password: 'cdc@123'   },
  { email: 'srl@srmist.edu.in',                               name: 'Dr Rahamath Nisha',               role: 'Faculty', password: 'cdc@123'   },
  { email: 'nagaraj.p@ist.srmtrichy.edu.in',                  name: 'Dr Nagaraj',                      role: 'Faculty', password: 'cdc@123'   },
  { email: 'shanmugp4@srmist.edu.in',                         name: 'Dr Shanmugasundari',              role: 'Faculty', password: 'cdc@123'   },
  { email: 'sasikala.l@ist.srmtrichy.edu.in',                 name: 'Mrs L Sashikala',                 role: 'Faculty', password: 'cdc@123'   },
  { email: 'maragatharajan.m@ist.srmtrichy.edu.in',           name: 'Dr M Maragatharaja',              role: 'Faculty', password: 'cdc@123'   },
  { email: 'suganyay@srmist.edu.in',                          name: 'Dr Suganya',                      role: 'Faculty', password: 'cdc@123'   },
  { email: 'aalanbabu.a@ist.srmtrichy.edu.in',                name: 'Dr Aalan Babu',                   role: 'Faculty', password: 'cdc@123'   },
  { email: 'murugapandiyan.p@ist.srmtrichy.edu.in',           name: 'Dr Murugupandianb',               role: 'Faculty', password: 'cdc@123'   },
  { email: 'maragatm@srmist.edu.in',                          name: 'Dr Maragathrajan',                role: 'Faculty', password: 'cdc@123'   },
  { email: 'chitrap2@srmist.edu.in',                          name: 'Dr Chitra',                       role: 'Faculty', password: 'cdc@123'   },
  { email: 'rahmathnisha.s@ist.srmtrichy.edu.in',             name: 'Dr. Rahmath Nisha',               role: 'Faculty', password: 'cdc@124'   },
  { email: 'balajitechnie02@gmail.com',                       name: 'Aswin',                           role: 'Faculty', password: 'cdc@123'   },
  { email: 'abilashmagesh686@gmail.com',                      name: 'Abilash',                         role: 'Faculty', password: 'cdc@123'   },
  { email: 'sanjaypradeesan145@gmail.com',                    name: 'Sanjay',                          role: 'Faculty', password: 'cdc@123'   },
  { email: 'himanshurairai560@gmail.com',                     name: 'Dr. Himanshu Rai',                role: 'Faculty', password: 'cdc@123'   },
];

async function main() {
  let created = 0, skipped = 0, errors = 0;

  for (let i = 0; i < USERS.length; i++) {
    const u = USERS[i];
    process.stdout.write(`[${i+1}/${USERS.length}] ${u.email} (${u.role}) ... `);

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:         u.email,
      password:      u.password,
      email_confirm: true,
      user_metadata: { name: u.name }
    });

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.code === 'email_exists') {
        // User exists — still upsert profile in case it's missing
        const { data: existing } = await supabase.auth.admin.getUserByEmail?.(u.email) ||
          { data: null };
        if (existing?.user) {
          await supabase.from('profiles').upsert(
            { id: existing.user.id, name: u.name, role: u.role, status: 'Active' },
            { onConflict: 'id' }
          );
        }
        console.log('already exists — skipped');
        skipped++;
      } else {
        console.error(`AUTH ERROR: ${authErr.message}`);
        errors++;
      }
      continue;
    }

    const { error: profErr } = await supabase.from('profiles').upsert({
      id:     authData.user.id,
      name:   u.name,
      role:   u.role,
      status: 'Active'
    }, { onConflict: 'id' });

    if (profErr) {
      console.error(`PROFILE ERROR: ${profErr.message}`);
      errors++;
    } else {
      console.log('OK');
      created++;
    }
  }

  console.log('\n──────────────────────────────────');
  console.log(`Done.  Created: ${created}  |  Skipped: ${skipped}  |  Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
