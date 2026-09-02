// Locate a headless-capable Chrome/Chromium binary. Returns null if none found.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import process from 'node:process';

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

export function findChrome() {
  if (process.env.POC_KIT_NO_CHROME) return null; // force the degraded path (CI / testing)
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const p of CANDIDATES[process.platform] || []) if (existsSync(p)) return p;
  // PATH lookup
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    try {
      const which = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
      const out = execSync(which, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0];
      if (out && existsSync(out)) return out;
    } catch { /* not found */ }
  }
  return null;
}
