const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();


const { requireLogin } = require('../middleware/Auth.js');
const {
  upload,
  uploadToSupabase,
  uploadFieldsToSupabase,
  deleteFromSupabase
} = require('../middleware/upload.js');
const db = require('../db/index.js');


// ============================================================
// HELPER FUNCTIONS
// ============================================================

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


// ============================================================
// LOGIN / LOGOUT
// ============================================================

router.get('/login', (req, res) => {
  res.render('admin/login', {
    error: null,
    layout: false
  });
});


router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await db.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );

    const user = result.rows[0];

   if (!user) {
      return res.render('admin/login', {
        error: 'Invalid username or password',
        layout: false
      });
    }
    const passwordMatch = await bcrypt.compare(
  password,
  user.password_hash
);

if (!passwordMatch) {
  return res.render('admin/login', {
    error: 'Invalid username or password',
    layout: false
  });
}
     req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect('/admin');

  } catch (error) {
    console.error('LOGIN ERROR:', error);

    res.status(500).send(`
      <pre>
Login error:

${error.stack}
      </pre>
    `);
  }
});


// =========================
// LOGOUT
// =========================

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});
   
// ============================================================
// ADMIN DASHBOARD
// ============================================================

router.get('/', requireLogin, async (req, res) => {
  try {

    const [
      services,
      settings,
      slides,
      stats,
      industries,
      caseStudies,
      team,
      founders,
      partners,
      products,
      requests
    ] = await Promise.all([

      db.query(
        'SELECT * FROM services ORDER BY sort_order'
      ),

      db.query(
        'SELECT key, value FROM settings'
      ),

      db.query(
        'SELECT * FROM slides ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM stats ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM industries ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM case_studies ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM team_members ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM founders ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM partners ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM products ORDER BY sort_order'
      ),

      db.query(
        'SELECT * FROM requests ORDER BY created_at DESC'
      )

    ]);

    res.render('admin/dashboard.ejs', {
      services: services.rows,
      settings: settings.rows,
      slides: slides.rows,
      stats: stats.rows,
      industries: industries.rows,
      caseStudies: caseStudies.rows,
      team: team.rows,
      founders: founders.rows,
      partners: partners.rows,
      products: products.rows,
      requests: requests.rows,
      layout: false
    });

  } catch (error) {

    console.error('Dashboard error:', error);

    res.status(500).send(
      '<pre>' + error.stack + '</pre>'
    );
  }
});


// ============================================================
// SERVICES
// ============================================================

router.get('/services/new', requireLogin, (req, res) => {
  res.render('admin/service-form.ejs', {
    service: null,
    featuresText: '',
    layout: false
  });
});


router.get('/services/:id/edit', requireLogin, async (req, res) => {
  try {

    const serviceResult = await db.query(
      'SELECT * FROM services WHERE id = $1',
      [req.params.id]
    );

    const service = serviceResult.rows[0];

    if (!service) {
      return res.redirect('/admin');
    }

    const featuresResult = await db.query(
      `
      SELECT feature_text
      FROM service_features
      WHERE service_id = $1
      ORDER BY sort_order
      `,
      [req.params.id]
    );

    res.render('admin/service-form.ejs', {
      service,
      featuresText: featuresResult.rows
        .map(f => f.feature_text)
        .join('\n'),
      layout: false
    });

  } catch (error) {

    console.error('Edit service error:', error);

    res.status(500).send(
      '<pre>' + error.stack + '</pre>'
    );
  }
});


router.post(
  '/services/save',
  requireLogin,
  upload.single('image'),
uploadToSupabase,
async (req, res) => {

    const client = await db.connect();

    try {

      const {
        id,
        title,
        slug,
        summary,
        features_raw
      } = req.body;

      const featureLines = (features_raw || '')
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean);

      await client.query('BEGIN');

      let serviceId = id;

      if (id) {

        if (req.file) {

          const existingResult = await client.query(
            'SELECT image_path FROM services WHERE id = $1',
            [id]
          );

          const existing = existingResult.rows[0];

          if (existing && existing.image_path) {
            await deleteFromSupabase(existing.image_path);
          }

          const newPath = req.file.publicUrl;

          await client.query(
            `
            UPDATE services
            SET title = $1,
                slug = $2,
                summary = $3,
                image_path = $4
            WHERE id = $5
            `,
            [title, slug, summary, newPath, id]
          );

        } else {

          await client.query(
            `
            UPDATE services
            SET title = $1,
                slug = $2,
                summary = $3
            WHERE id = $4
            `,
            [title, slug, summary, id]
          );
        }

        await client.query(
          'DELETE FROM service_features WHERE service_id = $1',
          [id]
        );

      } else {

        const orderResult = await client.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM services'
        );

        const maxOrder =
          Number(orderResult.rows[0].max_order) || 0;

        const imagePath = req.file
  ? req.file.publicUrl
  : null;

        const result = await client.query(
          `
          INSERT INTO services
          (title, slug, summary, image_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [
            title,
            slug,
            summary,
            imagePath,
            maxOrder + 1
          ]
        );

        serviceId = result.rows[0].id;
      }

      for (let i = 0; i < featureLines.length; i++) {

        await client.query(
          `
          INSERT INTO service_features
          (service_id, feature_text, sort_order)
          VALUES ($1, $2, $3)
          `,
          [
            serviceId,
            featureLines[i],
            i
          ]
        );
      }

      await client.query('COMMIT');

      res.redirect('/admin');

    } catch (error) {

      await client.query('ROLLBACK');

      console.error('Save service error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );

    } finally {

      client.release();

    }
  }
);


router.post(
  '/services/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT image_path FROM services WHERE id = $1',
        [req.params.id]
      );

      const service = result.rows[0];

      if (service && service.image_path) {
        await deleteFromSupabase(service.image_path);
      }

      await db.query(
        'DELETE FROM service_features WHERE service_id = $1',
        [req.params.id]
      );

      await db.query(
        'DELETE FROM services WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete service error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// WORD CARD IMAGES
// ============================================================

router.post(
  '/word-cards/save',
  requireLogin,
  upload.fields([
  { name: 'tagline_image', maxCount: 1 },
  { name: 'about_image', maxCount: 1 },
  { name: 'mission_image', maxCount: 1 },
  { name: 'values_image', maxCount: 1 }
]),
uploadFieldsToSupabase,
  async (req, res) => {

    try {

      const fieldToKey = {
        tagline_image: 'word_card_1_image',
        about_image: 'word_card_2_image',
        mission_image: 'word_card_3_image',
        values_image: 'word_card_4_image'
      };

      for (const [field, key] of Object.entries(fieldToKey)) {

        const uploaded =
          req.files &&
          req.files[field] &&
          req.files[field][0];

        const removeRequested =
          req.body[field + '_remove'] === 'on';

        const oldResult = await db.query(
          'SELECT value FROM settings WHERE key = $1',
          [key]
        );

        const old = oldResult.rows[0];

        if (uploaded) {

          if (old && old.value) {
            await deleteFromSupabase(old.value);
          }

          await db.query(
            `
            INSERT INTO settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT(key)
            DO UPDATE SET value = EXCLUDED.value
            `,
            [
  key,
  uploaded.publicUrl
]
          );

        } else if (
          removeRequested &&
          old &&
          old.value
        ) {

          await deleteFromSupabase(old.value);

          await db.query(
            `
            INSERT INTO settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT(key)
            DO UPDATE SET value = EXCLUDED.value
            `,
            [key, '']
          );
        }
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Word cards error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// SETTINGS
// ============================================================

router.post(
  '/settings/save',
  requireLogin,
  async (req, res) => {

    try {

      for (const [key, value] of Object.entries(req.body)) {

        await db.query(
          `
          INSERT INTO settings (key, value)
          VALUES ($1, $2)
          ON CONFLICT(key)
          DO UPDATE SET value = EXCLUDED.value
          `,
          [key, value]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Settings error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// FOUNDERS / DIRECTORS
// ============================================================

router.get('/founders/new', requireLogin, (req, res) => {
  res.render('admin/founder-form.ejs', {
    founder: null,
    layout: false
  });
});


router.get(
  '/founders/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM founders WHERE id = $1',
        [req.params.id]
      );

      const founder = result.rows[0];

      if (!founder) {
        return res.redirect('/admin');
      }

      res.render('admin/founder-form.ejs', {
        founder,
        layout: false
      });

    } catch (error) {

      console.error('Edit founder error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/founders/save',
  requireLogin,
  upload.single('photo'),
  uploadToSupabase,
  async (req, res) => {

    try {

      const {
        id,
        name,
        title,
        message
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT photo_path FROM founders WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.photo_path) {
            await deleteFromSupabase(existing.photo_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE founders
            SET name = $1,
                title = $2,
                message = $3,
                photo_path = $4
            WHERE id = $5
            `,
            [
              name,
              title,
              message,
              newPath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE founders
            SET name = $1,
                title = $2,
                message = $3
            WHERE id = $4
            `,
            [
              name,
              title,
              message,
              id
            ]
          );
        }

      } else {

        const orderResult = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM founders'
        );

        const maxOrder =
          Number(orderResult.rows[0].max_order) || 0;

        const photoPath = req.file
          ? req.file.publicUrl
          : null;

        await db.query(
          `
          INSERT INTO founders
          (name, title, message, photo_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            name,
            title,
            message,
            photoPath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save founder error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/founders/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT photo_path FROM founders WHERE id = $1',
        [req.params.id]
      );

      const founder = result.rows[0];

      if (founder && founder.photo_path) {
        await deleteFromSupabase(founder.photo_path);
      }

      await db.query(
        'DELETE FROM founders WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete founder error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// SITE LOGO
// ============================================================

router.post(
  '/branding/save',
  requireLogin,
  upload.single('logo'),
uploadToSupabase,
async (req, res) => {
    try {

      if (req.file) {

        const result = await db.query(
          "SELECT value FROM settings WHERE key = 'site_logo'"
        );

        const old = result.rows[0];

        if (old && old.value) {
          await deleteFromSupabase(old.value);
        }

        const newPath = req.file.publicUrl;

        await db.query(
          `
          INSERT INTO settings (key, value)
          VALUES ('site_logo', $1)
          ON CONFLICT(key)
          DO UPDATE SET value = EXCLUDED.value
          `,
          [newPath]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Branding error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// SLIDES
// ============================================================

router.get('/slides/new', requireLogin, (req, res) => {
  res.render('admin/slide-form.ejs', {
    slide: null,
    layout: false
  });
});


router.get(
  '/slides/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM slides WHERE id = $1',
        [req.params.id]
      );

      const slide = result.rows[0];

      if (!slide) {
        return res.redirect('/admin');
      }

      res.render('admin/slide-form.ejs', {
        slide,
        layout: false
      });

    } catch (error) {

      console.error('Edit slide error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/slides/save',
  requireLogin,
  upload.single('image'),
uploadToSupabase,
async (req, res) => {

    try {

      const {
        id,
        caption,
        eyebrow,
        subtitle
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT image_path FROM slides WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.image_path) {
            await deleteFromSupabase(existing.image_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE slides
            SET image_path = $1,
                caption = $2,
                eyebrow = $3,
                subtitle = $4
            WHERE id = $5
            `,
            [
              newPath,
              caption,
              eyebrow,
              subtitle,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE slides
            SET caption = $1,
                eyebrow = $2,
                subtitle = $3
            WHERE id = $4
            `,
            [
              caption,
              eyebrow,
              subtitle,
              id
            ]
          );
        }

      } else {

        if (!req.file) {
          return res.status(400).send(
            'An image is required for a new slide.'
          );
        }

        const orderResult = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM slides'
        );

        const maxOrder =
          Number(orderResult.rows[0].max_order) || 0;

        const newPath = req.file.publicUrl;
        await db.query(
          `
          INSERT INTO slides
          (image_path, caption, eyebrow, subtitle, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            newPath,
            caption,
            eyebrow,
            subtitle,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save slide error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/slides/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT image_path FROM slides WHERE id = $1',
        [req.params.id]
      );

      const slide = result.rows[0];

      if (slide && slide.image_path) {
        await deleteFromSupabase(slide.image_path);
      }

      await db.query(
        'DELETE FROM slides WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete slide error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// STATS
// ============================================================

router.post(
  '/stats/save',
  requireLogin,
  async (req, res) => {

    try {

      const { id, value, label } = req.body;

      if (id) {

        await db.query(
          `
          UPDATE stats
          SET value = $1,
              label = $2
          WHERE id = $3
          `,
          [value, label, id]
        );

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM stats'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        await db.query(
          `
          INSERT INTO stats
          (value, label, sort_order)
          VALUES ($1, $2, $3)
          `,
          [
            value,
            label,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Stats error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/stats/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      await db.query(
        'DELETE FROM stats WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete stats error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// INDUSTRIES
// ============================================================

router.get('/industries/new', requireLogin, (req, res) => {
  res.render('admin/industry-form.ejs', {
    industry: null,
    layout: false
  });
});


router.get(
  '/industries/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM industries WHERE id = $1',
        [req.params.id]
      );

      const industry = result.rows[0];

      if (!industry) {
        return res.redirect('/admin');
      }

      res.render('admin/industry-form.ejs', {
        industry,
        layout: false
      });

    } catch (error) {

      console.error('Edit industry error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/industries/save',
  requireLogin,
 upload.single('image'),
uploadToSupabase,
async (req, res) => {
    try {

      const {
        id,
        title,
        icon,
        description
      } = req.body;

      const imagePath = req.file
  ? req.file.publicUrl
  : null;

      if (id) {

        if (imagePath) {

          const result = await db.query(
            'SELECT image_path FROM industries WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.image_path) {
            await deleteFromSupabase(existing.image_path);
          }

          await db.query(
            `
            UPDATE industries
            SET title = $1,
                icon = $2,
                description = $3,
                image_path = $4
            WHERE id = $5
            `,
            [
              title,
              icon,
              description,
              imagePath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE industries
            SET title = $1,
                icon = $2,
                description = $3
            WHERE id = $4
            `,
            [
              title,
              icon,
              description,
              id
            ]
          );
        }

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM industries'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        await db.query(
          `
          INSERT INTO industries
          (title, icon, description, image_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            title,
            icon,
            description,
            imagePath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save industry error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/industries/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT image_path FROM industries WHERE id = $1',
        [req.params.id]
      );

      const industry = result.rows[0];

      if (industry && industry.image_path) {
        await deleteFromSupabase(industry.image_path);
      }

      await db.query(
        'DELETE FROM industries WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete industry error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// CASE STUDIES
// ============================================================

router.get('/case-studies/new', requireLogin, (req, res) => {
  res.render('admin/case-study-form.ejs', {
    caseStudy: null,
    layout: false
  });
});


router.get(
  '/case-studies/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM case_studies WHERE id = $1',
        [req.params.id]
      );

      const caseStudy = result.rows[0];

      if (!caseStudy) {
        return res.redirect('/admin');
      }

      res.render('admin/case-study-form.ejs', {
        caseStudy,
        layout: false
      });

    } catch (error) {

      console.error('Edit case study error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/case-studies/save',
  requireLogin,
  upload.single('image'),
  uploadToSupabase,
  async (req, res) => {

    try {

      const {
        id,
        title,
        client,
        summary
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT image_path FROM case_studies WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.image_path) {
            await deleteFromSupabase(existing.image_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE case_studies
            SET title = $1,
                client = $2,
                summary = $3,
                image_path = $4
            WHERE id = $5
            `,
            [
              title,
              client,
              summary,
              newPath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE case_studies
            SET title = $1,
                client = $2,
                summary = $3
            WHERE id = $4
            `,
            [
              title,
              client,
              summary,
              id
            ]
          );
        }

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM case_studies'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        const imagePath = req.file
          ? req.file.publicUrl
          : null;

        await db.query(
          `
          INSERT INTO case_studies
          (title, client, summary, image_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            title,
            client,
            summary,
            imagePath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save case study error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/case-studies/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT image_path FROM case_studies WHERE id = $1',
        [req.params.id]
      );

      const caseStudy = result.rows[0];

      if (caseStudy && caseStudy.image_path) {
        await deleteFromSupabase(caseStudy.image_path);
      }

      await db.query(
        'DELETE FROM case_studies WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete case study error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// TEAM MEMBERS
// ============================================================

router.get('/team/new', requireLogin, (req, res) => {

  res.render(
    'admin/team-form.ejs',
    {
      member: null,
      layout: false
    },
    (err, html) => {

      if (err) {

        console.error('>>> RENDER ERROR:', err);

        return res.status(500).send(
          '<pre>' + err.stack + '</pre>'
        );
      }

      console.log(
        '>>> Rendered HTML length:',
        html.length
      );

      res.send(html);
    }
  );
});


router.get(
  '/team/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM team_members WHERE id = $1',
        [req.params.id]
      );

      const member = result.rows[0];

      if (!member) {
        return res.redirect('/admin');
      }

      res.render(
        'admin/team-form.ejs',
        {
          member,
          layout: false
        }
      );

    } catch (error) {

      console.error('Edit team member error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/team/save',
  requireLogin,
  upload.single('photo'),
  uploadToSupabase,
  async (req, res) => {

    try {

      const {
        id,
        name,
        role,
        bio
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT photo_path FROM team_members WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.photo_path) {
            await deleteFromSupabase(existing.photo_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE team_members
            SET name = $1,
                role = $2,
                bio = $3,
                photo_path = $4
            WHERE id = $5
            `,
            [
              name,
              role,
              bio,
              newPath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE team_members
            SET name = $1,
                role = $2,
                bio = $3
            WHERE id = $4
            `,
            [
              name,
              role,
              bio,
              id
            ]
          );
        }

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM team_members'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        const photoPath = req.file
          ? req.file.publicUrl
          : null;

        await db.query(
          `
          INSERT INTO team_members
          (name, role, bio, photo_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            name,
            role,
            bio,
            photoPath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save team member error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/team/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT photo_path FROM team_members WHERE id = $1',
        [req.params.id]
      );

      const member = result.rows[0];

      if (member && member.photo_path) {
        await deleteFromSupabase(member.photo_path);
      }

      await db.query(
        'DELETE FROM team_members WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete team member error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// PARTNERS
// ============================================================

router.get('/partners/new', requireLogin, (req, res) => {
  res.render('admin/partner-form.ejs', {
    partner: null,
    layout: false
  });
});


router.get(
  '/partners/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM partners WHERE id = $1',
        [req.params.id]
      );

      const partner = result.rows[0];

      if (!partner) {
        return res.redirect('/admin');
      }

      res.render('admin/partner-form.ejs', {
        partner,
        layout: false
      });

    } catch (error) {

      console.error('Edit partner error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/partners/save',
  requireLogin,
  upload.single('logo'),
  uploadToSupabase,
  async (req, res) => {

    try {

      const {
        id,
        name,
        website_url
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT logo_path FROM partners WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.logo_path) {
            await deleteFromSupabase(existing.logo_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE partners
            SET name = $1,
                website_url = $2,
                logo_path = $3
            WHERE id = $4
            `,
            [
              name,
              website_url,
              newPath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE partners
            SET name = $1,
                website_url = $2
            WHERE id = $3
            `,
            [
              name,
              website_url,
              id
            ]
          );
        }

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM partners'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        const logoPath = req.file
          ? req.file.publicUrl
          : null;

        await db.query(
          `
          INSERT INTO partners
          (name, website_url, logo_path, sort_order)
          VALUES ($1, $2, $3, $4)
          `,
          [
            name,
            website_url,
            logoPath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save partner error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/partners/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT logo_path FROM partners WHERE id = $1',
        [req.params.id]
      );

      const partner = result.rows[0];

      if (partner && partner.logo_path) {
        await deleteFromSupabase(partner.logo_path);
      }

      await db.query(
        'DELETE FROM partners WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete partner error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// PRODUCTS
// ============================================================

router.get('/products/new', requireLogin, (req, res) => {
  res.render('admin/product-form.ejs', {
    product: null,
    layout: false
  });
});


router.get(
  '/products/:id/edit',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT * FROM products WHERE id = $1',
        [req.params.id]
      );

      const product = result.rows[0];

      if (!product) {
        return res.redirect('/admin');
      }

      res.render('admin/product-form.ejs', {
        product,
        layout: false
      });

    } catch (error) {

      console.error('Edit product error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/products/save',
  requireLogin,
  upload.single('image'),
  uploadToSupabase,
  async (req, res) => {

    try {

      const {
        id,
        name,
        description,
        price_info
      } = req.body;

      if (id) {

        if (req.file) {

          const result = await db.query(
            'SELECT image_path FROM products WHERE id = $1',
            [id]
          );

          const existing = result.rows[0];

          if (existing && existing.image_path) {
            await deleteFromSupabase(existing.image_path);
          }

          const newPath = req.file.publicUrl;

          await db.query(
            `
            UPDATE products
            SET name = $1,
                description = $2,
                price_info = $3,
                image_path = $4
            WHERE id = $5
            `,
            [
              name,
              description,
              price_info,
              newPath,
              id
            ]
          );

        } else {

          await db.query(
            `
            UPDATE products
            SET name = $1,
                description = $2,
                price_info = $3
            WHERE id = $4
            `,
            [
              name,
              description,
              price_info,
              id
            ]
          );
        }

      } else {

        const result = await db.query(
          'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM products'
        );

        const maxOrder =
          Number(result.rows[0].max_order) || 0;

        const imagePath = req.file
          ? req.file.publicUrl
          : null;

        await db.query(
          `
          INSERT INTO products
          (name, description, price_info, image_path, sort_order)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            name,
            description,
            price_info,
            imagePath,
            maxOrder + 1
          ]
        );
      }

      res.redirect('/admin');

    } catch (error) {

      console.error('Save product error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/products/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      const result = await db.query(
        'SELECT image_path FROM products WHERE id = $1',
        [req.params.id]
      );

      const product = result.rows[0];

      if (product && product.image_path) {
        await deleteFromSupabase(product.image_path);
      }

      await db.query(
        'DELETE FROM products WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete product error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// REQUESTS INBOX
// ============================================================

router.post(
  '/requests/:id/handled',
  requireLogin,
  async (req, res) => {

    try {

      await db.query(
        `
        UPDATE requests
        SET status = 'handled'
        WHERE id = $1
        `,
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Handle request error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


router.post(
  '/requests/:id/delete',
  requireLogin,
  async (req, res) => {

    try {

      await db.query(
        'DELETE FROM requests WHERE id = $1',
        [req.params.id]
      );

      res.redirect('/admin');

    } catch (error) {

      console.error('Delete request error:', error);

      res.status(500).send(
        '<pre>' + error.stack + '</pre>'
      );
    }
  }
);


// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;