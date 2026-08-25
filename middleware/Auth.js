// Any route that uses this middleware requires a logged-in session.
// If there's no session, we bounce the visitor to the login page instead
// of showing them the admin panel.
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = { requireLogin };