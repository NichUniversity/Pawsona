// Shared CORS helper for the pet-log-backend serverless functions.
// Lives under api/_lib/ (not api/) so Vercel doesn't treat it as its own
// route — only files directly exporting a handler from api/ become
// endpoints; files/dirs prefixed with "_" are ignored by the router.

function setCors(res) {
  // Loosen/tighten origin as needed once you know your app's web origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = { setCors };