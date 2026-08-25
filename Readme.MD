# Geospatial Dynamics Limited — Website

A database-driven site: the public pages (Home, Services, About, Contact) read
their content from a SQLite database instead of hardcoded HTML. A password-protected
`/admin` panel lets a non-developer ("the handler") edit that content.

## Stack

- **Node.js + Express** — the server
- **EJS** — templates (HTML with a bit of embedded logic)
- **better-sqlite3** — the database (a single file, `gdl.db`, created automatically)
- **express-session + bcryptjs** — admin login

## Setup

```bash
npm install
cp .env.example .env
# open .env and set SESSION_SECRET to a long random string
npm run dev
```

Visit:
- http://localhost:3000 — public site
- http://localhost:3000/admin — admin panel

First run creates `gdl.db` automatically and seeds it with:
- A default admin login: **admin / changeme123** — change this immediately (see below)
- The four services from the GDL company profile (GIS & RS, Environmental Impact
  Studies, M&E, Other Professional Services)
- Site text (hero tagline, about text, mission, contact info)

## Changing the admin password

The seeded password is for local setup only. To change it, easiest path for now:

```bash
node -e "
const bcrypt = require('bcryptjs');
const { db } = require('./db/init');
const newHash = bcrypt.hashSync('YOUR-NEW-PASSWORD', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(newHash, 'admin');
console.log('Password updated.');
"
```

(A "change password" screen inside `/admin` itself is a natural next feature —
see Next Steps below.)

## How content updates actually work

1. Visitor loads `/services`
2. `routes/public.js` runs `SELECT * FROM services` against `gdl.db`
3. The result is handed to `views/services.ejs`, which loops over it and prints HTML
4. When the handler edits a service in `/admin` and hits Save, `routes/admin.js`
   runs an `UPDATE` against the same table
5. The next visitor who loads `/services` sees the new content — no code touched

This is the core idea of "not hardcoding": the page never contains the actual
words "GIS & Remote Sensing" anywhere in the `.ejs` file. It only contains the
*instruction* to go fetch and display whatever is in the database right now.

## Project structure

```
gdl-website/
├── server.js              # entry point — wires everything together
├── db/
│   └── init.js             # creates tables, seeds starter content
├── routes/
│   ├── public.js           # / /services /about /contact
│   └── admin.js             # /admin login, dashboard, CRUD
├── middleware/
│   └── auth.js              # blocks /admin routes if not logged in
├── views/
│   ├── partials/            # shared header/footer
│   ├── index.ejs, services.ejs, about.ejs, contact.ejs
│   └── admin/
│       ├── login.ejs
│       ├── dashboard.ejs
│       └── service-form.ejs
└── public/
    └── css/style.css
```

## Images: how they actually work

Images are never stored *in* the database — only their file path is. The flow:

1. Handler picks a file in an `/admin` form (a slide image, or the founder's photo)
2. The form has `enctype="multipart/form-data"` (required for file uploads)
3. `middleware/upload.js` (using Multer) saves the actual file into `public/uploads/`
   with a generated collision-proof filename
4. Only the resulting path (e.g. `/uploads/1787042704730-714243.png`) gets written
   into the database
5. Because `public/` is served statically (see `app.use(express.static(...))` in
   `server.js`), that path is directly loadable in an `<img src="...">` tag

## Homepage slideshow

- Table: `slides` (`image_path`, `caption`, `sort_order`)
- Manage from `/admin` → "Homepage Slideshow" → Add/Edit/Delete
- If zero slides exist, the homepage just shows the plain hero (no broken carousel)
- Autoplay every 5s, pauses on hover, dot navigation, and respects the visitor's
  OS-level "reduce motion" setting (`public/js/carousel.js`)

## Founder message

- Stored as four `settings` rows: `founder_name`, `founder_title`, `founder_message`,
  `founder_photo`
- Manage from `/admin` → "Message from the Founder"
- Uploading a new photo automatically deletes the old file from `public/uploads/`
  so orphaned images don't pile up
- If `founder_message` is empty, the section doesn't render on the homepage at all

## Next steps worth doing before going live

- **Change the seeded admin password** (above)
- **Add a "Team" and "Projects" table** the same way `services` was built, if you
  want staff bios / project case studies editable too
- **Move to Postgres for production** — SQLite is a single file, which is great
  locally but many hosting platforms (e.g. free tiers on Render/Railway) wipe the
  filesystem on redeploy. Postgres (e.g. via Supabase, Neon, or Railway) persists
  properly. The `db/init.js` queries would need converting from `better-sqlite3`
  syntax to a Postgres client (e.g. `pg`), but the *shape* of everything else stays.
- **Add image uploads** for services/team members (e.g. using `multer` to handle
  file uploads, storing images in `public/uploads/` or an object storage bucket)
- **Contact form → email** — right now `/contact` just displays info; wiring the
  form to actually send mail needs a mail service (e.g. Resend, SendGrid) since
  most hosts block outbound SMTP
- **Deploy** — Render, Railway, and Fly.io all support Node + a persistent disk
  or managed Postgres add-on with a free/cheap tier