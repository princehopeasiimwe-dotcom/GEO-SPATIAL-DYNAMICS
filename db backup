const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// This creates/opens a single file, gdl.db, in the project root.
// SQLite needs no separate database server - it's just a file Node reads and writes.
const db = new Database(path.join(__dirname, '..', 'gdl.db'));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      summary TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS service_features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      feature_text TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS industries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS case_studies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client TEXT,
      summary TEXT,
      image_path TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT,
      bio TEXT,
      photo_path TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS founders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT,
      message TEXT,
      photo_path TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_path TEXT,
      website_url TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_path TEXT,
      price_info TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      reference TEXT,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      message TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  seedAdminUser();
  seedSettings();
  seedServices();
  seedStats();
  seedIndustries();
  seedFounders();
  seedPartners();
  seedProducts();
  ensureColumn('services', 'image_path', 'TEXT');
  ensureColumn('slides', 'eyebrow', 'TEXT');
  ensureColumn('slides', 'subtitle', 'TEXT');
  ensureColumn('industries', 'image_path', 'TEXT');
}

function seedFounders() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM founders').get().c;
  if (count > 0) return;
  // Carry over the old single-founder settings (from before this became a
  // proper multi-director table) so nothing already entered gets lost.
  const old = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(r => { old[r.key] = r.value; });
  if (old.founder_name || old.founder_message) {
    db.prepare('INSERT INTO founders (name, title, message, photo_path, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(old.founder_name || '', old.founder_title || '', old.founder_message || '', old.founder_photo || '', 0);
  }
}

// SQLite has no "ADD COLUMN IF NOT EXISTS". This checks first, so running it
// against a database that already has the column (or is brand new and just
// got it from a fresh CREATE TABLE) is always safe to call repeatedly.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some(c => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added missing column ${table}.${column}`);
  }
}

function seedAdminUser() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync('changeme123', 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('Seeded default admin login -> username: admin / password: changeme123');
  console.log('CHANGE THIS PASSWORD before putting the site online.');
}

function seedSettings() {
  // IMPORTANT: we insert each key individually with INSERT OR IGNORE, rather
  // than checking "is the whole table empty" first. That old approach is why
  // the founder message fields silently failed to appear on databases created
  // before that feature existed - the table wasn't empty, so seeding was
  // skipped entirely, and those specific rows never got added.
  // This version means: whenever we add a new setting in the future (like the
  // site_logo key below), it gets added to EVERY database, old or new,
  // without ever touching keys that already have real values.
  const seedData = [
    ['hero_tagline', 'Scalable, practical geospatial technology for real-world decisions.'],
    ['about_text', 'Geospatial Dynamics Limited (GDL) was incorporated in May 2016 in Kampala, Uganda. GDL provides scalable and practical geospatial technologies in Geo-information, Remote Sensing, Natural Resources Management and Research.'],
    ['mission_text', 'To provide SMART Geographic Information (GI) solutions across Forestry, Biodiversity and Conservation, Agriculture, Health, Education, Utilities, Climate Change and Research.'],
    ['core_values', 'Excellence, Accountability, Industry Responsiveness, Sustainability, Reliability, Integrity, Gender Sensitivity, Transparency'],
    ['contact_email', 'info@geospatialdynamics.example'],
    ['contact_phone', '+256 000 000 000'],
    ['contact_address', 'Kampala, Uganda'],
    ['whatsapp_number', ''],
    ['founder_name', ''],
    ['founder_title', ''],
    ['founder_message', ''],
    ['founder_photo', ''],
    ['site_logo', ''],
    ['cta_heading', "Let's get your project moving in the right direction."],
    ['cta_button_text', 'Talk to Our Team'],
    ['word_card_1_image', ''],
    ['word_card_2_image', ''],
    ['word_card_3_image', ''],
    ['word_card_4_image', '']
  ];
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  seedData.forEach(([k, v]) => insert.run(k, v));
}

function seedServices() {
  const serviceCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
  if (serviceCount > 0) return;

  const insertService = db.prepare(
    'INSERT INTO services (title, slug, summary, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertFeature = db.prepare(
    'INSERT INTO service_features (service_id, feature_text, sort_order) VALUES (?, ?, ?)'
  );

  const data = [
    {
      title: 'GIS & Remote Sensing',
      slug: 'gis-remote-sensing',
      summary: 'Field data collection, mapping, geodatabase design, and training for organisations using spatial tools.',
      features: [
        'Field GPS data collection',
        'Mapping & map production',
        'Geodatabase design & implementation',
        'Instructor-led GIS/GPS/RS training',
        'Mobile GIS solutions for M&E',
        'Land use & land cover change mapping',
        'GIS/RS applications for biodiversity, agriculture, climate change & disaster risk reduction',
        'Geospatial analysis & modelling',
        'Geo-referencing and digitising',
        'Image interpretation and remote sensing services',
        'GPS equipment hire & sale',
        'GIS software sales & licensing'
      ]
    },
    {
      title: 'Environmental Impact Studies',
      slug: 'environmental-impact-studies',
      summary: 'Systematic environmental and social impact assessment combining GIS and remote sensing tools.',
      features: [
        'Strategic & Environmental Impact Assessments (EIA)',
        'Environmental monitoring & audits',
        'Biodiversity research & forestry services',
        'Forest change, inventory & carbon assessments',
        'Environmental modelling (ecological, climate, watershed)'
      ]
    },
    {
      title: 'Monitoring & Evaluation',
      slug: 'monitoring-evaluation',
      summary: 'Systems and research to track progress of development programmes, projects and policies.',
      features: [
        'Baseline surveys, monitoring & reporting',
        'Mid-term and end-of-project evaluations',
        'Design & implementation of M&E systems',
        'Tailored training in M&E functions',
        'M&E database design & management',
        'Data collection and analysis using modern tools and technology',
        'Social sector and development research'
      ]
    },
    {
      title: 'Other Professional Services',
      slug: 'other-professional-services',
      summary: 'Property valuation, land surveying, and physical & urban planning support.',
      features: [
        'Property development, valuation & management',
        'Land surveys & titling',
        'Quantity surveys & land valuation',
        'Physical and urban planning'
      ]
    }
  ];

  data.forEach((service, index) => {
    const result = insertService.run(service.title, service.slug, service.summary, index + 1);
    service.features.forEach((f, i) => insertFeature.run(result.lastInsertRowid, f, i));
  });
}

function seedStats() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM stats').get().c;
  if (count > 0) return;
  const data = [
    ['10+', 'Years in Operation'],
    ['50+', 'Projects Delivered'],
    ['18', 'Districts Covered'],
    ['4', 'Core Service Areas']
  ];
  const insert = db.prepare('INSERT INTO stats (value, label, sort_order) VALUES (?, ?, ?)');
  data.forEach(([value, label], i) => insert.run(value, label, i));
}

function seedIndustries() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM industries').get().c;
  if (count > 0) return;
  // Pulled directly from GDL's actual mission statement (the sectors it names).
  const data = [
    ['Forestry & Biodiversity', '🌲', 'Forest inventory, change detection, and conservation mapping.'],
    ['Agriculture', '🌾', 'Land use analysis and spatial planning to support farming decisions.'],
    ['Health', '⚕', 'Spatial data supporting health facility planning and service delivery.'],
    ['Education', '🏫', 'Mapping and planning support for education infrastructure.'],
    ['Utilities', '⌁', 'Asset mapping and infrastructure planning for utility providers.'],
    ['Climate Change & Research', '🌍', 'Environmental monitoring and research-grade geospatial analysis.']
  ];
  const insert = db.prepare('INSERT INTO industries (title, icon, description, sort_order) VALUES (?, ?, ?, ?)');
  data.forEach(([title, icon, description], i) => insert.run(title, icon, description, i));
}

function seedPartners() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM partners').get().c;
  if (count > 0) return;
  // From the company profile: "projects funded by the World Bank, USAID and
  // UN agencies and other national and international NGOs." No specific UN
  // agency or NGO is named, and no logo files are seeded here - upload the
  // real, correctly-licensed logos from the admin panel when ready.
  const insert = db.prepare('INSERT INTO partners (name, sort_order) VALUES (?, ?)');
  ['World Bank', 'USAID', 'UN Agencies', 'National & International NGOs']
    .forEach((name, i) => insert.run(name, i));
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count > 0) return;
  // From the company profile: "GPS hire and sale services and GIS software."
  // These are starter placeholders - edit or replace them from /admin with
  // your actual products, prices, and photos.
  const insert = db.prepare(
    'INSERT INTO products (name, description, price_info, sort_order) VALUES (?, ?, ?, ?)'
  );
  insert.run(
    'GIS Software License',
    'Licensed GIS software for mapping, spatial analysis, and data management.',
    'Contact for pricing',
    0
  );
  insert.run(
    'Handheld GPS Unit',
    'Field-grade handheld GPS receiver for survey and data collection work.',
    'Available for hire or purchase',
    1
  );
}

module.exports = { db, initDb };