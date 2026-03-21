/**
 * Complete Drupal batch export and download NDIS provider CSV.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

let cookieJar = {};

function mergeCookies(setCookies) {
  (setCookies || []).forEach(c => {
    const [nameVal] = c.split(';');
    const [k, ...v] = nameVal.split('=');
    cookieJar[k.trim()] = v.join('=').trim();
  });
}

function getCookies() {
  return Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function req(url, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Cookie': getCookies(),
        ...extraHeaders
      },
      rejectUnauthorized: false,
      timeout: 60000
    };
    const r = https.request(opts, res => {
      mergeCookies(res.headers['set-cookie']);
      let data = Buffer.alloc(0);
      res.on('data', c => data = Buffer.concat([data, Buffer.from(c)]));
      res.on('end', () => resolve({
        status: res.statusCode,
        loc: res.headers['location'],
        contentType: res.headers['content-type'] || '',
        body: data.toString('utf8'),
        rawBody: data
      }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
    r.end();
  });
}

async function main() {
  const OUT = path.join(__dirname, 'ndis_providers.csv');
  const BASE = 'https://www.ndiscommission.gov.au';

  // Step 1: Establish session
  process.stdout.write('1. Establishing session...');
  await req(`${BASE}/provider-registration/find-registered-provider`);
  console.log(` cookies: ${Object.keys(cookieJar).join(', ') || 'none'}`);

  // Step 2: Trigger export
  process.stdout.write('2. Triggering export...');
  const r2 = await req(`${BASE}/provider-registration/find-registered-provider/export?field_registration_status_value=Approved&field_legal_name=&field_abn_value=&title=`);
  console.log(` status=${r2.status} loc=${r2.loc}`);
  mergeCookies(r2.body.match ? [] : []);

  if (!r2.loc) {
    console.log('No redirect — unexpected. Body:', r2.body.substring(0,200));
    return;
  }

  const bm = r2.loc.match(/batch\?id=(\d+)/);
  if (!bm) { console.log('No batch ID in:', r2.loc); return; }
  const batchId = bm[1];
  console.log(`   Batch ID: ${batchId}`);

  // Step 3: Visit the start page (establishes batch session state)
  await req(`${BASE}/batch?id=${batchId}&op=start`);

  // Step 4: Poll do_nojs until complete
  console.log('3. Polling batch to completion...');
  let attempt = 0;
  const maxAttempts = 120;

  while (attempt < maxAttempts) {
    attempt++;
    const r = await req(`${BASE}/batch?id=${batchId}&op=do_nojs`);
    
    if (r.loc) {
      const downloadUrl = r.loc.startsWith('http') ? r.loc : BASE + r.loc;
      console.log(`\n   Batch redirected to: ${downloadUrl}`);
      
      // Download the file
      console.log('4. Downloading...');
      const dl = await req(downloadUrl);
      if (dl.contentType.includes('csv') || dl.contentType.includes('octet') || dl.rawBody.length > 5000) {
        fs.writeFileSync(OUT, dl.rawBody);
        console.log(`   ✅ Saved ${dl.rawBody.length} bytes to ${path.basename(OUT)}`);
        console.log('\n   First 500 chars of CSV:');
        console.log(dl.rawBody.toString('utf8').substring(0, 500));
      } else {
        // Maybe the redirect is a page with a link to the file
        fs.writeFileSync(OUT.replace('.csv', '_redirect.html'), dl.body);
        const fileMatch = dl.body.match(/href="([^"]*\.csv[^"]*)"/) ||
                          dl.body.match(/href="([^"]*\/private\/[^"]+)"/) ||
                          dl.body.match(/href="([^"]*\/files\/[^"]+\.csv[^"]*)"/) ;
        if (fileMatch) {
          const fileUrl = fileMatch[1].startsWith('http') ? fileMatch[1] : BASE + fileMatch[1];
          const dl2 = await req(fileUrl);
          fs.writeFileSync(OUT, dl2.rawBody);
          console.log(`   ✅ Saved ${dl2.rawBody.length} bytes via secondary redirect`);
          console.log(dl2.rawBody.toString('utf8').substring(0, 500));
        } else {
          console.log(`   Content-Type: ${dl.contentType}, len: ${dl.body.length}`);
          console.log('   Body start:', dl.body.substring(0, 300));
        }
      }
      return;
    }

    // Parse progress from body
    const pctMatch = r.body.match(/aria-valuenow="(\d+)"/) || r.body.match(/style="width:\s*(\d+)%"/) || r.body.match(/(\d+)%<\/div>/);
    const msgMatch = r.body.match(/progress-bar-message"[^>]*>([^<]{5,100})</) || r.body.match(/Estimated[^<]{5,60}/);
    const pct = pctMatch ? pctMatch[1] : '?';
    const msg = msgMatch ? msgMatch[0].substring(0, 80) : '';
    process.stdout.write(`\r   [${attempt}] ${pct}% ${msg}   `);

    // At 100%, save the body and check for any file link or JS redirect
    if (pct === '100') {
      console.log('\n   At 100% — checking body for download link...');
      fs.writeFileSync(path.join(__dirname, 'ndis_batch_100.html'), r.body);
      // Check for meta refresh or JS redirect
      const metaRefresh = r.body.match(/content="[^"]*URL=([^"]+)"/i);
      const jsRedirect = r.body.match(/window\.location[^=]*=\s*["']([^"']+)["']/);
      const hrefLink = r.body.match(/href="([^"]*\.csv[^"]*)"/) || r.body.match(/href="([^"]*\/private\/[^"]+)"/) || r.body.match(/href="([^"]*export[^"]*)"/) ;
      console.log('   meta refresh:', metaRefresh ? metaRefresh[1] : 'none');
      console.log('   JS redirect:', jsRedirect ? jsRedirect[1] : 'none');
      console.log('   CSV href:', hrefLink ? hrefLink[1] : 'none');
      
      if (metaRefresh) {
        // Decode HTML entities in URL
        const rawUrl = metaRefresh[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        const nextUrl = rawUrl.startsWith('http') ? rawUrl : 'https://www.ndiscommission.gov.au' + rawUrl;
        console.log('   Following meta refresh:', nextUrl);
        const r4 = await req(nextUrl);
        console.log('   Status:', r4.status, 'Loc:', r4.loc, 'CT:', r4.contentType, 'Len:', r4.rawBody.length);
        if (r4.status === 200 && r4.rawBody.length > 1000) {
          fs.writeFileSync(OUT, r4.rawBody);
          console.log('   CSV preview:', r4.rawBody.toString('utf8').substring(0, 300));
          return;
        }
        // Follow another redirect if needed
        if (r4.loc) {
          const next2 = r4.loc.startsWith('http') ? r4.loc : 'https://www.ndiscommission.gov.au' + r4.loc;
          const r5 = await req(next2);
          console.log('   r5 status:', r5.status, 'len:', r5.rawBody.length, 'CT:', r5.contentType);
          fs.writeFileSync(OUT, r5.rawBody);
          console.log('   Saved r5 data:', r5.rawBody.toString('utf8').substring(0, 300));
          return;
        }
      }
    }

    if (r.status === 404) {
      console.log('\n   Batch 404 — expired or invalid ID');
      break;
    }

    await new Promise(res => setTimeout(res, 2500));
  }

  console.log('\n   Batch polling exhausted without completion.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
