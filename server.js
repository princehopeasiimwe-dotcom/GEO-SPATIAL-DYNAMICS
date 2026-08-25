require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const { initDb } = require('./db/init');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

// Creates the SQLite file and tables on first run, and seeds starter content.
// Safe to call every time the server starts - it only creates what's missing.
initDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Every page rendered with res.render('pages/xxx') gets automatically wrapped
// in views/layouts/main.ejs, with that page's content injected at <%- body %>.
// Admin routes render full standalone .ejs files and opt out (see routes/admin.js).
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(express.urlencoded({ extended: true })); // parses <form> submissions
app.use(express.static(path.join(__dirname, 'public'))); // serves css/js/images

// Makes the service list available in EVERY rendered page (via res.locals),
// so the navbar's "Services" dropdown works no matter which route rendered
// the current page - without every route needing to fetch it manually.
const { db } = require('./db/init');
app.use((req, res, next) => {
  res.locals.navServices = db.prepare('SELECT title, slug FROM services ORDER BY sort_order').all();
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // admin stays logged in for 4 hours
}));

app.use('/', publicRoutes);

// Admin pages should never be cached by the browser - stale cached admin
// pages (like an old blank/error response from a since-fixed bug) can
// otherwise keep reappearing indefinitely even after the server is fixed.
app.use('/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/admin', adminRoutes);

// Catch-all 404: anything that didn't match a route above (public or admin)
// falls through to here instead of Express's default plain-text response.
app.use((req, res) => {
  const settingRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingRows.forEach(r => { settings[r.key] = r.value; });
  res.status(404).render('pages/404', { page: '', settings });
});

const PORT = process.env.PORT || 3000;
// Catch-all error handler: if any route throws (including a rendering
// error inside an .ejs file), this shows the real error on-screen instead
// of a mysterious blank page, and always logs it to the terminal too.
app.use((err, req, res, next) => {
  console.error('--- UNHANDLED ERROR ---');
  console.error(err);
  res.status(500).send('<pre style="white-space:pre-wrap; font-family:monospace; padding:20px;">' +
    (err && err.stack ? err.stack : String(err)) + '</pre>');
});

app.listen(PORT, () => {
  console.log(`GDL site running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin`);
});