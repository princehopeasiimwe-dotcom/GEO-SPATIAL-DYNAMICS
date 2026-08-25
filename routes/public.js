const express = require('express');
const router = express.Router();
const { db } = require('../db/init');
const nodemailer = require('nodemailer');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(row => { settings[row.key] = row.value; });
  return settings;
}

router.get('/', (req, res) => {
  const settings = getSettings();
  const services = db.prepare('SELECT * FROM services ORDER BY sort_order').all();
  const slides = db.prepare('SELECT * FROM slides ORDER BY sort_order').all();
  const stats = db.prepare('SELECT * FROM stats ORDER BY sort_order').all();
  const caseStudies = db.prepare('SELECT * FROM case_studies ORDER BY sort_order').all();
  const founders = db.prepare('SELECT * FROM founders ORDER BY sort_order').all();
  const partners = db.prepare('SELECT * FROM partners ORDER BY sort_order').all();
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order').all();
  res.render('pages/home', { settings, services, slides, stats, caseStudies, founders, partners, products, page: 'home' });
});

router.get('/industries', (req, res) => {
  const settings = getSettings();
  const industries = db.prepare('SELECT * FROM industries ORDER BY sort_order').all();
  res.render('pages/industries', { settings, industries, page: 'industries' });
});

router.get('/case-studies', (req, res) => {
  const settings = getSettings();
  const caseStudies = db.prepare('SELECT * FROM case_studies ORDER BY sort_order').all();
  res.render('pages/case-studies', { settings, caseStudies, page: 'case-studies' });
});

router.get('/services', (req, res) => {
  const settings = getSettings();
  const services = db.prepare('SELECT * FROM services ORDER BY sort_order').all();
  const featureStmt = db.prepare(
    'SELECT feature_text FROM service_features WHERE service_id = ? ORDER BY sort_order'
  );
  services.forEach(s => {
    s.features = featureStmt.all(s.id).map(f => f.feature_text);
  });
  res.render('pages/services', { settings, services, page: 'services' });
});

router.get('/about', (req, res) => {
  const settings = getSettings();
  const stats = db.prepare('SELECT * FROM stats ORDER BY sort_order').all();
  const team = db.prepare('SELECT * FROM team_members ORDER BY sort_order').all();
  res.render('pages/about', { settings, stats, team, page: 'about' });
});

router.get('/software', (req, res) => {
  const settings = getSettings();
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order').all();
  res.render('pages/software', { settings, products, page: 'software' });
});

router.get('/services/:slug/book', (req, res) => {
  const settings = getSettings();
  const service = db.prepare('SELECT * FROM services WHERE slug = ?').get(req.params.slug);
  if (!service) return res.redirect('/services');
  res.render('pages/request-form', {
    settings,
    page: 'services',
    heading: `Book: ${service.title}`,
    kind: 'service_booking',
    reference: service.title,
    backLink: `/services#${service.slug}`,
    submitted: false
  });
});

router.get('/software/:id/buy', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/software');
  res.render('pages/request-form', {
    settings,
    page: 'software',
    heading: `Buy: ${product.name}`,
    kind: 'product_buy',
    reference: product.name,
    backLink: '/software',
    submitted: false
  });
});

router.get('/software/:id/hire', (req, res) => {
  const settings = getSettings();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/software');
  res.render('pages/request-form', {
    settings,
    page: 'software',
    heading: `Hire: ${product.name}`,
    kind: 'product_hire',
    reference: product.name,
    backLink: '/software',
    submitted: false
  });
});

// One shared handler for all three request types (service bookings, product
// buy requests, product hire requests). Every submission is saved to the
// database first - so the admin always sees it in /admin regardless of
// whether email sending is configured - then email is attempted as a bonus.
router.post('/requests', async (req, res) => {
  const { kind, reference, name, email, phone, message, backLink } = req.body;
  const settings = getSettings();

  db.prepare(`
    INSERT INTO requests (kind, reference, customer_name, customer_email, customer_phone, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(kind, reference, name, email, phone || '', message || '');

  const hasEmailConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (hasEmailConfig) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.CONTACT_TO_EMAIL || settings.contact_email,
        replyTo: email,
        subject: `New ${kind.replace(/_/g, ' ')} request: ${reference}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\n\n${message || ''}`
      });
    } catch (err) {
      console.error('Request email failed to send:', err.message);
    }
  } else {
    console.log('--- New request (email not configured yet) ---', { kind, reference, name, email, phone, message });
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
});

router.get('/contact', (req, res) => {
  const settings = getSettings();
  res.render('pages/contact', { settings, page: 'contact', submitted: false });
});

router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  const settings = getSettings();

  // Only attempt to actually send email once SMTP details exist in .env.
  // Until then, submissions are just logged to the terminal so nothing
  // breaks or gets silently lost during local development.
  const hasEmailConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (hasEmailConfig) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.CONTACT_TO_EMAIL || settings.contact_email,
        replyTo: email,
        subject: `New website enquiry from ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`
      });
    } catch (err) {
      console.error('Contact form email failed to send:', err.message);
    }
  } else {
    console.log('--- New contact form submission (email sending not configured yet) ---');
    console.log({ name, email, message });
  }

  res.render('pages/contact', { settings, page: 'contact', submitted: true });
});

module.exports = router;