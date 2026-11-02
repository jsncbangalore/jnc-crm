// Root-level entry point for hosting panels (Render, Hostinger, etc.)
// that set "Start Command: node start_server.js" at the repository root.
// Delegates to the real start_server.js inside apps/api/.
require('./apps/api/start_server.js');
