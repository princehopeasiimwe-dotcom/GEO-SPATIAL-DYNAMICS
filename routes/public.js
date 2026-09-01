const express = require('express');
const router = express.Router();
const  db  = require('../db');
const nodemailer = require('nodemailer');

// ---------------------------------------------------------
// Helper: get all site settings
// ---------------------------------------------------------
async function getSettings() {
  const result = await db.query(
    'SELECT key, value FROM settings'
  );

  const settings = {};

  result.rows.forEach(row => {
    settings[row.key] = row.value;
  });

  return settings;
}

// ---------------------------------------------------------
// HOME
// ---------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const [
      servicesResult,
      slidesResult,
      statsResult,
      caseStudiesResult,
      foundersResult,
      partnersResult,
      productsResult
    ] = await Promise.all([
      db.query('SELECT * FROM services ORDER BY sort_order'),
      db.query('SELECT * FROM slides ORDER BY sort_order'),
      db.query('SELECT * FROM stats ORDER BY sort_order'),
      db.query('SELECT * FROM case_studies ORDER BY sort_order'),
      db.query('SELECT * FROM founders ORDER BY sort_order'),
      db.query('SELECT * FROM partners ORDER BY sort_order'),
      db.query('SELECT * FROM products ORDER BY sort_order')
    ]);

    res.render('pages/home', {
      settings,
      services: servicesResult.rows,
      slides: slidesResult.rows,
      stats: statsResult.rows,
      caseStudies: caseStudiesResult.rows,
      founders: foundersResult.rows,
      partners: partnersResult.rows,
      products: productsResult.rows,
      page: 'home'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// INDUSTRIES
// ---------------------------------------------------------
router.get('/industries', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM industries ORDER BY sort_order'
    );

    res.render('pages/industries', {
      settings,
      industries: result.rows,
      page: 'industries'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// CASE STUDIES
// ---------------------------------------------------------
router.get('/case-studies', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM case_studies ORDER BY sort_order'
    );

    res.render('pages/case-studies.ejs', {
      settings,
      caseStudies: result.rows,
      page: 'case-studies'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// SERVICES
// ---------------------------------------------------------
router.get('/services', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const servicesResult = await db.query(
      'SELECT * FROM services ORDER BY sort_order'
    );

    const services = servicesResult.rows;

    // Fetch all features at once rather than querying once per service.
    const featuresResult = await db.query(`
      SELECT service_id, feature_text
      FROM service_features
      ORDER BY service_id, sort_order
    `);

    const featuresByService = {};

    featuresResult.rows.forEach(row => {
      if (!featuresByService[row.service_id]) {
        featuresByService[row.service_id] = [];
      }

      featuresByService[row.service_id].push(row.feature_text);
    });

    services.forEach(service => {
      service.features = featuresByService[service.id] || [];
    });

    res.render('pages/services.ejs', {
      settings,
      services,
      page: 'services'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// ABOUT
// ---------------------------------------------------------
router.get('/about', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const [statsResult, teamResult] = await Promise.all([
      db.query('SELECT * FROM stats ORDER BY sort_order'),
      db.query('SELECT * FROM team_members ORDER BY sort_order')
    ]);

    res.render('pages/about.ejs', {
      settings,
      stats: statsResult.rows,
      team: teamResult.rows,
      page: 'about'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// SOFTWARE / PRODUCTS
// ---------------------------------------------------------
router.get('/software', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM products ORDER BY sort_order'
    );

    res.render('pages/software.ejs', {
      settings,
      products: result.rows,
      page: 'software'
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// BOOK A SERVICE
// ---------------------------------------------------------
router.get('/services/:slug/book', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM services WHERE slug = $1',
      [req.params.slug]
    );

    const service = result.rows[0];

    if (!service) {
      return res.redirect('/services');
    }

    res.render('pages/request-form.ejs', {
      settings,
      page: 'services',
      heading: `Book: ${service.title}`,
      kind: 'service_booking',
      reference: service.title,
      backLink: `/services#${service.slug}`,
      submitted: false
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// BUY PRODUCT
// ---------------------------------------------------------
router.get('/software/:id/buy', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM products WHERE id = $1',
      [req.params.id]
    );

    const product = result.rows[0];

    if (!product) {
      return res.redirect('/software');
    }

    res.render('pages/request-form.ejs', {
      settings,
      page: 'software',
      heading: `Buy: ${product.name}`,
      kind: 'product_buy',
      reference: product.name,
      backLink: '/software',
      submitted: false
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// HIRE PRODUCT
// ---------------------------------------------------------
router.get('/software/:id/hire', async (req, res, next) => {
  try {
    const settings = await getSettings();

    const result = await db.query(
      'SELECT * FROM products WHERE id = $1',
      [req.params.id]
    );

    const product = result.rows[0];

    if (!product) {
      return res.redirect('/software');
    }

    res.render('pages/request-form.ejs', {
      settings,
      page: 'software',
      heading: `Hire: ${product.name}`,
      kind: 'product_hire',
      reference: product.name,
      backLink: '/software',
      submitted: false
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// REQUESTS
// ---------------------------------------------------------
router.post('/requests', async (req, res, next) => {
  try {
    const {
      kind,
      reference,
      name,
      email,
      phone,
      message,
      backLink
    } = req.body;

    const settings = await getSettings();

    // Save the request to Supabase FIRST.
    await db.query(
      `
      INSERT INTO requests
      (
        kind,
        reference,
        customer_name,
        customer_email,
        customer_phone,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        kind,
        reference,
        name,
        email,
        phone || '',
        message || ''
      ]
    );

    // Email is optional. Database saving does not depend on email.
    const hasEmailConfig =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (hasEmailConfig) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.CONTACT_TO_EMAIL || settings.contact_email,
          replyTo: email,
          subject: `New ${kind.replace(/_/g, ' ')} request: ${reference}`,
          text:
            `Name: ${name}\n` +
            `Email: ${email}\n` +
            `Phone: ${phone || '-'}\n\n` +
            `${message || ''}`
        });
      } catch (err) {
        console.error(
          'Request email failed to send:',
          err.message
        );
      }
    } else {
      console.log(
        '--- New request (email not configured yet) ---',
        {
          kind,
          reference,
          name,
          email,
          phone,
          message
        }
      );
    }

    res.render('pages/request-form', {
      settings,
      page: '',
      heading: 'Thank you',
      kind,
      reference,
      backLink: backLink || '/',
      submitted: true
    });

  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// CONTACT PAGE
// ---------------------------------------------------------
router.get('/contact', async (req, res, next) => {
  try {
    const settings = await getSettings();

    res.render('pages/contact.ejs', {
      settings,
      page: 'contact',
      submitted: false
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------
// CONTACT FORM
// ---------------------------------------------------------
router.post('/contact', async (req, res, next) => {
  try {
    const {
      name,
      email,
      message
    } = req.body;

    const settings = await getSettings();

    const hasEmailConfig =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS;

    if (hasEmailConfig) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: process.env.CONTACT_TO_EMAIL || settings.contact_email,
          replyTo: email,
          subject: `New website enquiry from ${name}`,
          text: `From: ${name} <${email}>\n\n${message}`
        });

      } catch (err) {
        console.error(
          'Contact form email failed to send:',
          err.message
        );
      }

    } else {
      console.log(
        '--- New contact form submission (email sending not configured yet) ---'
      );

      console.log({
        name,
        email,
        message
      });
    }

    res.render('pages/contact', {
      settings,
      page: 'contact',
      submitted: true
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;

