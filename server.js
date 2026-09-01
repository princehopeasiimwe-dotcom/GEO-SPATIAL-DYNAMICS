require('dotenv').config();

const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

// IMPORTANT:
// This is the NEW database connection.
// It must export `db` using PostgreSQL/Supabase.
const  db  = require('./db');

// ------------------------------------------------------------
// APP
// ------------------------------------------------------------

const app = express();

// ------------------------------------------------------------
// VIEW ENGINE
// ------------------------------------------------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files: CSS, JavaScript, images, uploads, etc.
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------
// SESSION
// ------------------------------------------------------------

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// ------------------------------------------------------------
// NAVIGATION DATA
// ------------------------------------------------------------
// Makes the service list available to every EJS page.

app.use(async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT title, slug FROM services ORDER BY sort_order'
    );

    res.locals.navServices = result.rows;
    next();
  } catch (error) {
    console.error('Navigation database error:', error.message);

    // Don't completely break the website if the navigation query fails.
    res.locals.navServices = [];
    next();
  }
});

// ------------------------------------------------------------
// PUBLIC ROUTES
// ------------------------------------------------------------

app.use('/', publicRoutes);

// ------------------------------------------------------------
// ADMIN CACHE CONTROL
// ------------------------------------------------------------
// Prevent browsers from showing stale admin pages.

app.use('/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// ------------------------------------------------------------
// ADMIN ROUTES
// ------------------------------------------------------------

app.use('/admin', adminRoutes);

// ------------------------------------------------------------
// 404 PAGE
// ------------------------------------------------------------

app.use(async (req, res) => {
  try {
    const result = await db.query(
      'SELECT key, value FROM settings'
    );

    const settings = {};

    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.status(404).render('pages/404', {
      page: '',
      settings
    });
  } catch (error) {
    console.error('404 page error:', error);

    res.status(404).send('Page not found');
  }
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error('========================================');
  console.error('UNHANDLED SERVER ERROR');
  console.error('========================================');
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).send(
    '<pre style="white-space:pre-wrap;font-family:monospace;padding:20px;">' +
      (err && err.stack ? err.stack : String(err)) +
    '</pre>'
  );
});

// ------------------------------------------------------------
// SERVER
// ------------------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('GDL SERVER STARTED');
  console.log('========================================');
  console.log(`Port: ${PORT}`);
  console.log(`Admin: /admin`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
