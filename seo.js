// SEO helpers: per-page titles/descriptions, robots.txt, sitemap.xml
const BASE_URL = (process.env.SITE_URL || 'https://geo-spatial-dynamics.onrender.com').replace(/\/$/, '');
const SITE = 'Geospatial Dynamics Limited';

const PAGES = {
  '/': {
    title: 'Geospatial Dynamics Limited (GDL) | GIS & Remote Sensing Services in Uganda',
    description: 'Geospatial Dynamics Limited (GDL) is a Kampala-based company offering GIS, remote sensing, mapping, environmental impact studies, GPS data collection and geospatial training across Uganda and East Africa.'
  },
  '/about': {
    title: 'About Geospatial Dynamics Limited | Geo Spatial Dynamics Uganda',
    description: 'Learn about Geospatial Dynamics Limited: our mission, values, founder and team delivering smart geographic information solutions for forestry, biodiversity, agriculture and climate.'
  },
  '/services': {
    title: 'GIS, Remote Sensing & Mapping Services | Geospatial Dynamics',
    description: 'GIS and remote sensing, environmental impact studies, monitoring and evaluation, field GPS data collection, mapping, geodatabase design and GIS training in Uganda.'
  },
  '/industries': {
    title: 'Industries We Serve | Geospatial Dynamics Limited',
    description: 'Geospatial solutions for forestry, biodiversity, agriculture, climate change, disaster risk reduction and land management across Uganda and East Africa.'
  },
  '/case-studies': {
    title: 'GIS & Remote Sensing Case Studies | Geospatial Dynamics',
    description: 'Explore projects delivered by Geospatial Dynamics Limited: land cover mapping, environmental studies, geodatabases and GIS applications.'
  },
  '/software': {
    title: 'GIS Software, GPS Equipment Sales & Hire | Geospatial Dynamics',
    description: 'Buy or hire GPS equipment and GIS software, with licensing and support from Geospatial Dynamics Limited in Kampala, Uganda.'
  },
  '/contact': {
    title: 'Contact Geospatial Dynamics Limited | Kampala, Uganda',
    description: 'Contact Geospatial Dynamics Limited in Kireka-Namugongo Road, Kampala, Uganda for GIS, remote sensing, mapping and training enquiries.'
  }
};

// Pages that should never appear in Google
const NOINDEX = [/^\/admin/, /^\/requests/, /^\/services\/[^/]+\/book/, /^\/software\/[^/]+\/(buy|hire)/];

function seoMiddleware(req, res, next) {
  const path = req.path.length > 1 ? req.path.replace(/\/$/, '') : req.path;
  const page = PAGES[path];
  const noindex = NOINDEX.some(r => r.test(path)) || (!page && !path.startsWith('/uploads'));
  res.locals.seo = {
    baseUrl: BASE_URL,
    siteName: SITE,
    title: page ? page.title : SITE,
    description: page ? page.description : PAGES['/'].description,
    canonical: BASE_URL + (path === '/' ? '/' : path),
    noindex,
    verification: process.env.GOOGLE_SITE_VERIFICATION || ''
  };
  if (noindex) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

function robots(req, res) {
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /requests
Disallow: /services/*/book
Disallow: /software/*/buy
Disallow: /software/*/hire

Sitemap: ${BASE_URL}/sitemap.xml
`);
}

function sitemap(req, res) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.keys(PAGES).map(p => {
    const prio = p === '/' ? '1.0' : '0.8';
    return `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${prio}</priority>\n  </url>`;
  }).join('\n');
  res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
}

module.exports = { seoMiddleware, robots, sitemap, BASE_URL };