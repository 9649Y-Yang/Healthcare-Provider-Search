const https = require('https');
const fs = require('fs');
const cookieJar = {};

function req(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Cookie': Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ')
      },
      rejectUnauthorized: false
    };
    const r = https.request(opts, rsp => {
      (rsp.headers['set-cookie'] || []).forEach(c => {
        const [nameVal] = c.split(';');
        const [k, ...v] = nameVal.split('=');
        cookieJar[k.trim()] = v.join('=').trim();
      });
      let d = Buffer.alloc(0);
      rsp.on('data', c => { d = Buffer.concat([d, Buffer.from(c)]); });
      rsp.on('end', () => res({
        status: rsp.statusCode,
        headers: rsp.headers,
        body: d.toString('utf8'),
        raw: d
      }));
    });
    r.on('error', rej);
    r.setTimeout(60000, () => { r.destroy(); rej(new Error('timeout')); });
    r.end();
  });
}

async function main() {
  const BASE = 'https://www.ndiscommission.gov.au';

  // 1. Get session
  console.log('1. Getting session...');
  await req(BASE + '/provider-registration/find-registered-provider');
  console.log('   Cookies:', JSON.stringify(cookieJar));

  // 2. Trigger export
  console.log('2. Triggering export...');
  const r2 = await req(BASE + '/provider-registration/find-registered-provider/export?field_registration_status_value=Approved&field_legal_name=&field_abn_value=&title=');
  console.log('   Status:', r2.status, 'Loc:', r2.headers['location']);
  const batchId = (r2.headers['location'] || '').match(/batch\?id=(\d+)/)?.[1];
  if (!batchId) { console.log('No batch ID'); return; }
  console.log('   Batch ID:', batchId);

  // 3. Poll until 100%
  console.log('3. Polling...');
  for (let i = 0; i < 120; i++) {
    const r = await req(BASE + '/batch?id=' + batchId + '&op=do_nojs');
    const pct = r.body.match(/aria-valuenow="(\d+)"/)?.[1] || '?';
    process.stdout.write('\r   [' + i + '] ' + pct + '%  ');
    if (pct === '100') {
      console.log('\n4. At 100%! Getting op=finished (no redirect follow)...');
      const final = await req(BASE + '/batch?id=' + batchId + '&op=finished');
      console.log('   Status:', final.status);
      console.log('   Location:', final.headers['location']);
      const nextLoc = final.headers['location'];
      
      if (nextLoc) {
        // Follow the redirect — this might serve the file or queue it
        const nextUrl = nextLoc.startsWith('http') ? nextLoc : BASE + nextLoc.split('#')[0];
        console.log('5. Following redirect to:', nextUrl);
        const r5 = await req(nextUrl);
        console.log('   Status:', r5.status, 'CT:', r5.headers['content-type'], 'Len:', r5.raw.length);
        console.log('   Content-Disposition:', r5.headers['content-disposition'] || 'none');
        if (r5.headers['content-disposition'] && r5.headers['content-disposition'].includes('attachment')) {
          // File download!
          fs.writeFileSync('scripts/ndis_providers.csv', r5.raw);
          console.log('   ✅ CSV downloaded!', r5.raw.length, 'bytes');
          console.log('   Preview:', r5.raw.toString('utf8').substring(0, 400));
        } else {
          console.log('   No file download... body start:', r5.body.substring(0, 200));
          // Check for any CSV links in the page
          const csvLink = r5.body.match(/href="([^"]*\.csv[^"]*)"/) || r5.body.match(/href="([^"]*download[^"]*)"/);
          if (csvLink) {
            console.log('   Found CSV link:', csvLink[1]);
            const fileUrl = csvLink[1].startsWith('http') ? csvLink[1] : BASE + csvLink[1];
            const dl = await req(fileUrl);
            fs.writeFileSync('scripts/ndis_providers.csv', dl.raw);
            console.log('   ✅ CSV from link:', dl.raw.length, 'bytes');
            console.log('   Preview:', dl.raw.toString('utf8').substring(0, 400));
          }
        }
      }
      return;
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  console.log('\nMax attempts reached.');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
