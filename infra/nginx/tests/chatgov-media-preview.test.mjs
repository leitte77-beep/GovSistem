import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const configUrl = new URL('../sites/default.conf', import.meta.url);

test('ChatGov media removes upstream frame restrictions before allowing same-origin preview', async () => {
  const config = await readFile(configUrl, 'utf8');
  const mediaLocation = config.match(
    /location \/media\/ \{([\s\S]*?)\n    \}\n\n    # Frontend SPA/,
  )?.[1];

  assert.ok(mediaLocation, 'location /media/ do ChatGov não encontrada');
  const activeConfig = mediaLocation.replace(/^\s*#.*$/gm, '');

  assert.match(activeConfig, /proxy_hide_header X-Frame-Options;/);
  assert.match(activeConfig, /proxy_hide_header Content-Security-Policy;/);
  assert.match(activeConfig, /proxy_hide_header Strict-Transport-Security;/);
  assert.match(activeConfig, /proxy_hide_header X-XSS-Protection;/);
  assert.match(activeConfig, /add_header X-Frame-Options SAMEORIGIN always;/);
  assert.match(
    activeConfig,
    /add_header Content-Security-Policy "frame-ancestors 'self'" always;/,
  );
  assert.match(
    activeConfig,
    /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;/,
  );
});
