const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Retrieves a development password for local seeds and tests.
 * Priority:
 * 1. Process environment variable DEV_PASSWORD
 * 2. Untracked root .dev-passwords.json file
 * 3. Cryptographically random generated password (saved to .dev-passwords.json and printed once)
 */
function getDevPassword() {
  if (process.env.DEV_PASSWORD && process.env.DEV_PASSWORD.trim()) {
    return process.env.DEV_PASSWORD.trim();
  }

  const rootPath = path.resolve(__dirname, '../../');
  const devCredsPath = path.join(rootPath, '.dev-passwords.json');

  if (fs.existsSync(devCredsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(devCredsPath, 'utf8'));
      if (data && data.devPassword && typeof data.devPassword === 'string') {
        return data.devPassword;
      }
    } catch (e) {
      // ignore parse error and regenerate
    }
  }

  // Generate cryptographically secure random password with mixed character classes
  const randomChars = crypto.randomBytes(16).toString('base64url');
  const generatedPassword = `Dev#${randomChars}!9a`;

  try {
    fs.writeFileSync(
      devCredsPath,
      JSON.stringify(
        {
          notice: 'LOCAL DEVELOPMENT PASSWORDS ONLY - DO NOT COMMIT OR SHARE',
          devPassword: generatedPassword,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log('[DEV-SECURITY] Generated new local development password:');
    console.log(`[DEV-SECURITY] Saved to untracked file: .dev-passwords.json`);
    console.log(`[DEV-SECURITY] Password: ${generatedPassword}`);
  } catch (err) {
    console.warn(`[DEV-SECURITY] Warning: Could not write to .dev-passwords.json: ${err.message}`);
  }

  return generatedPassword;
}

module.exports = {
  getDevPassword,
};
