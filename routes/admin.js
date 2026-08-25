const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { db } = require('../db/init');
const { requireLogin } = require('../middleware/auth.js');
const { upload } = require('../middleware/upload.js');

// --- Login / logout ---

router.get('/login', (req, res) => {
  res.render('admin/login', { error: null, layout: false });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render('admin/login', { error: 'Invalid username or password', layout: false });
  }

  req.session.userId = user.id; // this is what "logs them in"
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// --- Dashboard ---

router.get('/', requireLogin, (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY sort_order').all();
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const slides = db.prepare('SELECT * FROM slides ORDER BY sort_order').all();
  const stats = db.prepare('SELECT * FROM stats ORDER BY sort_order').all();
  const industries = db.prepare('SELECT * FROM industries ORDER BY sort_order').all();
  const caseStudies = db.prepare('SELECT * FROM case_studies ORDER BY sort_order').all();
  const team = db.prepare('SELECT * FROM team_members ORDER BY sort_order').all();
  const founders = db.prepare('SELECT * FROM founders ORDER BY sort_order').all();
  const partners = db.prepare('SELECT * FROM partners ORDER BY sort_order').all();
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order').all();
  const requests = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  res.render('admin/dashboard', { services, settings, slides, stats, industries, caseStudies, team, founders, partners, products, requests, layout: false });
});

// --- Services: create / edit / delete ---

router.get('/services/new', requireLogin, (req, res) => {
  res.render('admin/service-form', { service: null, featuresText: '', layout: false });
});

router.get('/services/:id/edit', requireLogin, (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  const features = db.prepare(
    'SELECT feature_text FROM service_features WHERE service_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  if (!service) return res.redirect('/admin');

  res.render('admin/service-form', {
    service,
    featuresText: features.map(f => f.feature_text).join('\n'),
    layout: false
  });
});

router.post('/services/save', requireLogin, upload.single('image'), (req, res) => {
  const { id, title, slug, summary, features_raw } = req.body;
  const featureLines = features_raw.split('\n').map(f => f.trim()).filter(Boolean);

  let serviceId = id;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT image_path FROM services WHERE id = ?').get(id);
      if (existing && existing.image_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.image_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE services SET title = ?, slug = ?, summary = ?, image_path = ? WHERE id = ?')
        .run(title, slug, summary, newPath, id);
    } else {
      db.prepare('UPDATE services SET title = ?, slug = ?, summary = ? WHERE id = ?')
        .run(title, slug, summary, id);
    }
    db.prepare('DELETE FROM service_features WHERE service_id = ?').run(id);
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM services').get().m || 0;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;
    const result = db.prepare(
      'INSERT INTO services (title, slug, summary, image_path, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(title, slug, summary, imagePath, maxOrder + 1);
    serviceId = result.lastInsertRowid;
  }

  const insertFeature = db.prepare(
    'INSERT INTO service_features (service_id, feature_text, sort_order) VALUES (?, ?, ?)'
  );
  featureLines.forEach((f, i) => insertFeature.run(serviceId, f, i));

  res.redirect('/admin');
});

router.post('/services/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM service_features WHERE service_id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Word card background images (optional, "Who We Are" section) ---

router.post('/word-cards/save', requireLogin, upload.fields([
  { name: 'tagline_image', maxCount: 1 },
  { name: 'about_image', maxCount: 1 },
  { name: 'mission_image', maxCount: 1 },
  { name: 'values_image', maxCount: 1 }
]), (req, res) => {
  const fieldToKey = {
    tagline_image: 'word_card_1_image',
    about_image: 'word_card_2_image',
    mission_image: 'word_card_3_image',
    values_image: 'word_card_4_image'
  };
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  Object.entries(fieldToKey).forEach(([field, key]) => {
    const uploaded = req.files && req.files[field] && req.files[field][0];
    const removeRequested = req.body[field + '_remove'] === 'on';
    const old = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);

    if (uploaded) {
      // A new file was chosen - it replaces whatever was there before.
      if (old && old.value) {
        fs.unlink(path.join(__dirname, '..', 'public', old.value), () => {});
      }
      upsert.run(key, '/uploads/' + uploaded.filename);
    } else if (removeRequested && old && old.value) {
      // "Remove image" was checked and no replacement was uploaded -
      // delete the file and clear the setting back to empty (plain card).
      fs.unlink(path.join(__dirname, '..', 'public', old.value), () => {});
      upsert.run(key, '');
    }
    // Otherwise: no new file, no removal requested - leave it untouched.
  });

  res.redirect('/admin');
});

// --- Settings (About text, mission, contact info, etc.) ---
// This route is used by the plain-text settings form (no file upload).

router.post('/settings/save', requireLogin, (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  Object.entries(req.body).forEach(([key, value]) => upsert.run(key, value));
  res.redirect('/admin');
});

// --- Directors' Messages (multiple founders/directors, each with their
// own photo, title, and message) ---

router.get('/founders/new', requireLogin, (req, res) => {
  res.render('admin/founder-form', { founder: null, layout: false });
});

router.get('/founders/:id/edit', requireLogin, (req, res) => {
  const founder = db.prepare('SELECT * FROM founders WHERE id = ?').get(req.params.id);
  if (!founder) return res.redirect('/admin');
  res.render('admin/founder-form', { founder, layout: false });
});

router.post('/founders/save', requireLogin, upload.single('photo'), (req, res) => {
  const { id, name, title, message } = req.body;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT photo_path FROM founders WHERE id = ?').get(id);
      if (existing && existing.photo_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.photo_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE founders SET name = ?, title = ?, message = ?, photo_path = ? WHERE id = ?')
        .run(name, title, message, newPath, id);
    } else {
      db.prepare('UPDATE founders SET name = ?, title = ?, message = ? WHERE id = ?')
        .run(name, title, message, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM founders').get().m || 0;
    const photoPath = req.file ? '/uploads/' + req.file.filename : null;
    db.prepare('INSERT INTO founders (name, title, message, photo_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(name, title, message, photoPath, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/founders/:id/delete', requireLogin, (req, res) => {
  const founder = db.prepare('SELECT photo_path FROM founders WHERE id = ?').get(req.params.id);
  if (founder && founder.photo_path) {
    fs.unlink(path.join(__dirname, '..', 'public', founder.photo_path), () => {});
  }
  db.prepare('DELETE FROM founders WHERE id = ?').run(req.params.id);

  res.redirect('/admin');
});

// --- Site logo ---

router.post('/branding/save', requireLogin, upload.single('logo'), (req, res) => {
  if (req.file) {
    const old = db.prepare("SELECT value FROM settings WHERE key = 'site_logo'").get();
    if (old && old.value) {
      fs.unlink(path.join(__dirname, '..', 'public', old.value), () => {});
    }
    const newPath = '/uploads/' + req.file.filename;
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('site_logo', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(newPath);
  }
  res.redirect('/admin');
});

// --- Slides (homepage image carousel) ---

router.get('/slides/new', requireLogin, (req, res) => {
  res.render('admin/slide-form', { slide: null, layout: false });
});

router.get('/slides/:id/edit', requireLogin, (req, res) => {
  const slide = db.prepare('SELECT * FROM slides WHERE id = ?').get(req.params.id);
  if (!slide) return res.redirect('/admin');
  res.render('admin/slide-form', { slide, layout: false });
});

router.post('/slides/save', requireLogin, upload.single('image'), (req, res) => {
  const { id, caption, eyebrow, subtitle } = req.body;

  if (id) {
    // Editing an existing slide
    if (req.file) {
      const existing = db.prepare('SELECT image_path FROM slides WHERE id = ?').get(id);
      if (existing) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.image_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE slides SET image_path = ?, caption = ?, eyebrow = ?, subtitle = ? WHERE id = ?')
        .run(newPath, caption, eyebrow, subtitle, id);
    } else {
      db.prepare('UPDATE slides SET caption = ?, eyebrow = ?, subtitle = ? WHERE id = ?')
        .run(caption, eyebrow, subtitle, id);
    }
  } else {
    // New slide - an image is required
    if (!req.file) {
      return res.status(400).send('An image is required for a new slide. Go back and choose a file.');
    }
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM slides').get().m || 0;
    const newPath = '/uploads/' + req.file.filename;
    db.prepare('INSERT INTO slides (image_path, caption, eyebrow, subtitle, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(newPath, caption, eyebrow, subtitle, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/slides/:id/delete', requireLogin, (req, res) => {
  const slide = db.prepare('SELECT image_path FROM slides WHERE id = ?').get(req.params.id);
  if (slide) {
    fs.unlink(path.join(__dirname, '..', 'public', slide.image_path), () => {});
  }
  db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Stats (the numbers strip: "10+ Years", "50+ Projects", etc.) ---

router.post('/stats/save', requireLogin, (req, res) => {
  const { id, value, label } = req.body;
  if (id) {
    db.prepare('UPDATE stats SET value = ?, label = ? WHERE id = ?').run(value, label, id);
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM stats').get().m || 0;
    db.prepare('INSERT INTO stats (value, label, sort_order) VALUES (?, ?, ?)').run(value, label, maxOrder + 1);
  }
  res.redirect('/admin');
});

router.post('/stats/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM stats WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Industries (sectors served) ---

router.get('/industries/new', requireLogin, (req, res) => {
  res.render('admin/industry-form', { industry: null, layout: false });
});

router.get('/industries/:id/edit', requireLogin, (req, res) => {
  const industry = db.prepare('SELECT * FROM industries WHERE id = ?').get(req.params.id);
  if (!industry) return res.redirect('/admin');
  res.render('admin/industry-form', { industry, layout: false });
});

router.post('/industries/save', requireLogin, upload.single('image'), (req, res) => {
  const { id, title, icon, description } = req.body;
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;

  if (id) {
    if (imagePath) {
      const existing = db.prepare('SELECT image_path FROM industries WHERE id = ?').get(id);
      if (existing && existing.image_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.image_path), () => {});
      }
      db.prepare('UPDATE industries SET title = ?, icon = ?, description = ?, image_path = ? WHERE id = ?')
        .run(title, icon, description, imagePath, id);
    } else {
      db.prepare('UPDATE industries SET title = ?, icon = ?, description = ? WHERE id = ?')
        .run(title, icon, description, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM industries').get().m || 0;
    db.prepare('INSERT INTO industries (title, icon, description, image_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(title, icon, description, imagePath, maxOrder + 1);
  }
  res.redirect('/admin');
});

router.post('/industries/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM industries WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Case studies (past project write-ups) ---

router.get('/case-studies/new', requireLogin, (req, res) => {
  res.render('admin/case-study-form', { caseStudy: null, layout: false });
});

router.get('/case-studies/:id/edit', requireLogin, (req, res) => {
  const caseStudy = db.prepare('SELECT * FROM case_studies WHERE id = ?').get(req.params.id);
  if (!caseStudy) return res.redirect('/admin');
  res.render('admin/case-study-form', { caseStudy, layout: false });
});

router.post('/case-studies/save', requireLogin, upload.single('image'), (req, res) => {
  const { id, title, client, summary } = req.body;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT image_path FROM case_studies WHERE id = ?').get(id);
      if (existing && existing.image_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.image_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE case_studies SET title = ?, client = ?, summary = ?, image_path = ? WHERE id = ?')
        .run(title, client, summary, newPath, id);
    } else {
      db.prepare('UPDATE case_studies SET title = ?, client = ?, summary = ? WHERE id = ?')
        .run(title, client, summary, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM case_studies').get().m || 0;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;
    db.prepare('INSERT INTO case_studies (title, client, summary, image_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(title, client, summary, imagePath, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/case-studies/:id/delete', requireLogin, (req, res) => {
  const cs = db.prepare('SELECT image_path FROM case_studies WHERE id = ?').get(req.params.id);
  if (cs && cs.image_path) {
    fs.unlink(path.join(__dirname, '..', 'public', cs.image_path), () => {});
  }
  db.prepare('DELETE FROM case_studies WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Team members ---

router.get('/team/new', requireLogin, (req, res) => {
  res.render('admin/team-form', { member: null, layout: false }, (err, html) => {
    if (err) {
      console.error('>>> RENDER ERROR:', err);
      return res.status(500).send('<pre>' + err.stack + '</pre>');
    }
    console.log('>>> Rendered HTML length:', html.length);
    res.send(html);
  });
});

router.get('/team/:id/edit', requireLogin, (req, res) => {
  const member = db.prepare('SELECT * FROM team_members WHERE id = ?').get(req.params.id);
  if (!member) return res.redirect('/admin');
  res.render('admin/team-form', { member, layout: false });
});

router.post('/team/save', requireLogin, upload.single('photo'), (req, res) => {
  const { id, name, role, bio } = req.body;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT photo_path FROM team_members WHERE id = ?').get(id);
      if (existing && existing.photo_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.photo_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE team_members SET name = ?, role = ?, bio = ?, photo_path = ? WHERE id = ?')
        .run(name, role, bio, newPath, id);
    } else {
      db.prepare('UPDATE team_members SET name = ?, role = ?, bio = ? WHERE id = ?')
        .run(name, role, bio, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM team_members').get().m || 0;
    const photoPath = req.file ? '/uploads/' + req.file.filename : null;
    db.prepare('INSERT INTO team_members (name, role, bio, photo_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(name, role, bio, photoPath, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/team/:id/delete', requireLogin, (req, res) => {
  const member = db.prepare('SELECT photo_path FROM team_members WHERE id = ?').get(req.params.id);
  if (member && member.photo_path) {
    fs.unlink(path.join(__dirname, '..', 'public', member.photo_path), () => {});
  }
  db.prepare('DELETE FROM team_members WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Partners (funders/collaborators logo strip) ---

router.get('/partners/new', requireLogin, (req, res) => {
  res.render('admin/partner-form', { partner: null, layout: false });
});

router.get('/partners/:id/edit', requireLogin, (req, res) => {
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
  if (!partner) return res.redirect('/admin');
  res.render('admin/partner-form', { partner, layout: false });
});

router.post('/partners/save', requireLogin, upload.single('logo'), (req, res) => {
  const { id, name, website_url } = req.body;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT logo_path FROM partners WHERE id = ?').get(id);
      if (existing && existing.logo_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.logo_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE partners SET name = ?, website_url = ?, logo_path = ? WHERE id = ?')
        .run(name, website_url, newPath, id);
    } else {
      db.prepare('UPDATE partners SET name = ?, website_url = ? WHERE id = ?')
        .run(name, website_url, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM partners').get().m || 0;
    const logoPath = req.file ? '/uploads/' + req.file.filename : null;
    db.prepare('INSERT INTO partners (name, website_url, logo_path, sort_order) VALUES (?, ?, ?, ?)')
      .run(name, website_url, logoPath, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/partners/:id/delete', requireLogin, (req, res) => {
  const partner = db.prepare('SELECT logo_path FROM partners WHERE id = ?').get(req.params.id);
  if (partner && partner.logo_path) {
    fs.unlink(path.join(__dirname, '..', 'public', partner.logo_path), () => {});
  }
  db.prepare('DELETE FROM partners WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Software & Equipment products ---

router.get('/products/new', requireLogin, (req, res) => {
  res.render('admin/product-form', { product: null, layout: false });
});

router.get('/products/:id/edit', requireLogin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/admin');
  res.render('admin/product-form', { product, layout: false });
});

router.post('/products/save', requireLogin, upload.single('image'), (req, res) => {
  const { id, name, description, price_info } = req.body;

  if (id) {
    if (req.file) {
      const existing = db.prepare('SELECT image_path FROM products WHERE id = ?').get(id);
      if (existing && existing.image_path) {
        fs.unlink(path.join(__dirname, '..', 'public', existing.image_path), () => {});
      }
      const newPath = '/uploads/' + req.file.filename;
      db.prepare('UPDATE products SET name = ?, description = ?, price_info = ?, image_path = ? WHERE id = ?')
        .run(name, description, price_info, newPath, id);
    } else {
      db.prepare('UPDATE products SET name = ?, description = ?, price_info = ? WHERE id = ?')
        .run(name, description, price_info, id);
    }
  } else {
    const maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM products').get().m || 0;
    const imagePath = req.file ? '/uploads/' + req.file.filename : null;
    db.prepare('INSERT INTO products (name, description, price_info, image_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(name, description, price_info, imagePath, maxOrder + 1);
  }

  res.redirect('/admin');
});

router.post('/products/:id/delete', requireLogin, (req, res) => {
  const product = db.prepare('SELECT image_path FROM products WHERE id = ?').get(req.params.id);
  if (product && product.image_path) {
    fs.unlink(path.join(__dirname, '..', 'public', product.image_path), () => {});
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Requests inbox (service bookings + product buy/hire requests) ---

router.post('/requests/:id/handled', requireLogin, (req, res) => {
  db.prepare("UPDATE requests SET status = 'handled' WHERE id = ?").run(req.params.id);
  res.redirect('/admin');
});

router.post('/requests/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

module.exports = router;