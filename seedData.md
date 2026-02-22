# Seed Data

## Quick Start

```bash
# Run from Backend directory
node scripts/seed-all.js
```

This creates everything needed to log in and test the platform.

## What Gets Created

### Organisation
| Field | Value |
|-------|-------|
| Name | Chelmsford 11 Plus |
| Username | chelmsford11plus |
| Description | Premier 11+ exam preparation centre in Chelmsford, Essex |
| Website | https://chelmsford11plus.com |

### Users (Password for all: `Test@1234`)

| Role | Name | Email | Purpose |
|------|------|-------|---------|
| **owner** | Navin Pathak | navin@chelmsford11plus.com | Director — full access, manages org |
| **admin** (superAdmin) | Vivek Kumar | vivek@chelmsford11plus.com | Developer — full access, platform admin, **super admin** |
| **senior_teacher** | Sarah Williams | sarah@chelmsford11plus.com | Head of Maths — creates/approves papers |
| **teacher** | James Anderson | james@chelmsford11plus.com | English tutor — creates questions/papers |
| **content_reviewer** | Priya Sharma | priya@chelmsford11plus.com | QA lead — reviews and approves questions |
| **student** | Oliver Brown | oliver@chelmsford11plus.com | Year 5 student — takes practice papers |
| **parent** | Emma Johnson | emma@chelmsford11plus.com | Parent of Oliver — monitors progress |

Test@1234

### Membership Roles (7 available)

| Role | Access Level |
|------|-------------|
| `owner` | Full access. Can delete company, manage all members. |
| `admin` | Full access except company deletion. |
| `senior_teacher` | Create/edit/approve questions, papers, blueprints, templates. |
| `teacher` | Create/edit questions and papers. Cannot approve. |
| `content_reviewer` | Review and approve/reject questions. Read-only for papers. |
| `student` | View published papers and take practice tests. |
| `parent` | View child's progress and published paper sets. |

## How to Log In

### Via API (cURL)
```bash
curl -X POST http://localhost:2040/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "navin@chelmsford11plus.com", "password": "Test@1234"}'
```

Response includes `accessToken` — use as `Authorization: Bearer <token>` header.

### Via Frontend
1. Start backend: `npm run dev` (port 2040)
2. Start frontend: `npm run dev` in OrganisationUserFrontend (port 3030)
3. Navigate to login page
4. Enter any email/password from the table above

## Additional Seed Scripts

After running `seed-all.js`, you can optionally run:

```bash
# Pre-built paper templates & blueprints (FSCE, CSSE, 11+ formats)
npx ts-node src/scripts/seedPreBuiltTemplates.ts

# Demo company with SEO datasets (unrelated to 11+ — for dev testing)
node scripts/seed-demo-tenant.js
```

## Idempotency

All seed scripts are safe to run multiple times. They skip existing records and only create what's missing.
