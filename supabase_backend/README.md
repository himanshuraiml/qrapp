# Supabase Backend — QR Attendance System

## Setup Order

1. Go to **Supabase Dashboard → SQL Editor**
2. Run each file in order:

```
01_tables.sql       — Creates all tables and indexes
02_rls_policies.sql — Enables Row Level Security
03_functions.sql    — Stored procedures (mark attendance, stats, reports)
04_seed_data.sql    — Read comments and run the INSERT blocks manually
```

## Environment Variables (web_app/.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only, never expose to client
```

## Auth Strategy

| Role    | Login credential            | Internal Supabase email         |
|---------|-----------------------------|---------------------------------|
| Admin   | admin@srmist.ac.in          | same real email                 |
| Faculty | faculty@srmist.ac.in        | same real email                 |
| Student | Roll number (RA2311…)       | `ra2311...@student.local`       |

Students never see the internal email. The web app converts roll number → virtual email transparently.

## Tables

| Table             | Purpose                                     |
|-------------------|---------------------------------------------|
| `profiles`        | Extends `auth.users` with role/dept/section |
| `attendance`      | All attendance records (FN1–AN2)            |
| `session_settings`| Single-row FN/AN time window config         |

## Key Functions

| Function                  | Used by                         |
|---------------------------|---------------------------------|
| `mark_attendance_safe`    | Faculty QR scanner              |
| `get_dashboard_stats`     | Admin dashboard stats cards     |
| `get_section_summary`     | Admin section-wise table        |
| `get_attendance_report`   | Admin reports page with filters |
| `get_current_session`     | Faculty scanner — auto session  |
