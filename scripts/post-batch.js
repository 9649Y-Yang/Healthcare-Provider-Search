const https = require('https');
const fs = require('fs');
const cookieJar = {};

function setcookies(setCookieArr) {
  (setCookieArr || []).forEach(c => {
    const [nameVal] = c.split(';');
    const [k, ...v] = nameVal.split('=');
    cookieJar[k.trim()] = v.join('=').trim();
  });
}
function getCookie() {
  return Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function req(url, method, body) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const isPost = method === 'POST';
    const bodyBuf = body ? Buffer.from(body, 'utf8') : null;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Cookie': getCookie(),
        ...(isPost && bodyBuf ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': bodyBuf.length } : {})
      },
      rejectUnauthorized: false
    };
    const r = https.request(opts, rsp => {
      setcookies(rsp.headers['set-cookie']);
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
    r.setTimeout(60000, () => { r.destroy(); rej(new Error('Timeout')); });
    if (bodyBuf) r.write(bodyBuf);
    r.end();
  });
}

async function main() {
  const BASE = 'https://www.ndiscommission.gov.au';
  const OUT = 'd:/Learning/Healthcare Provider Search/scripts/ndis_providers.csv';

  // 1. Session
  console.log('1. Session setup...');
  await req(BASE + '/provider-registration/find-registered-provider');
  console.log('   Cookies:', JSON.stringify(cookieJar));

  // 2. Trigger export
  console.log('2. Triggering export...');
  const r2 = await req(BASE + '/provider-registration/find-registered-provider/export?field_registration_status_value=Approved&field_legal_name=&field_abn_value=&title=');
  const loc = r2.headers['location'] || '';
  console.log('   Status:', r2.status, 'Loc:', loc);
  const batchId = loc.match(/batch\?id=(\d+)/)?.[1];
  if (!batchId) { console.log('No batch ID'); return; }
  console.log('   Batch ID:', batchId);

  // 3. Poll using POST op=do (the JS approach)
  const pollUrl = `${BASE}/batch?id=${batchId}&op=do`;
  console.log('3. Polling via POST op=do...');
  for (let i = 0; i < 120; i++) {
    // Try GET first, then POST
    const r = await req(pollUrl, 'POST', '');
    const ct = r.headers['content-type'] || '';
    process.stdout.write(`\r   [${i}] status=${r.status} ct=${ct.substring(0,30)} len=${r.body.length}  `);

    if (ct.includes('json')) {
      let json;
      try { json = JSON.parse(r.body); } catch { json = null; }
      if (json) {
        process.stdout.write(`pct=${json.percentage || '?'}% `);
        if (json.percentage === '100' || json.percentage === 100) {
          console.log('\n   Batch complete (JSON confirms 100%)!');
          break;
        }
      }
    } else if (r.body.includes('aria-valuenow')) {
      const pct = r.body.match(/aria-valuenow="(\d+)"/)?.[1] || '?';
      process.stdout.write(`pct=${pct}% `);
      if (pct === '100') {
        console.log('\n   Batch complete (HTML 100%)!');
        break;
      }
    }

    if (r.status >= 400) {
      console.log('\n   Error status:', r.status);
      console.log('   Body:', r.body.substring(0, 300));
      break;
    }

    await new Promise(r => setTimeout(r, 2500));
  }

  // 4. Hit op=finished
  console.log('\n4. Accessing op=finished...');
  const finUrl = `${BASE}/batch?id=${batchId}&op=finished`;
  const rf = await req(finUrl);
  console.log('   Status:', rf.status, 'CT:', rf.headers['content-type']);
  console.log('   Content-Disposition:', rf.headers['content-disposition'] || 'none');
  console.log('   Location:', rf.headers['location'] || 'none');

  if (rf.headers['content-disposition']) {
    fs.writeFileSync(OUT, rf.raw);
    console.log('   ✅ File downloaded!', rf.raw.length, 'bytes');
    console.log('   Preview:', rf.raw.toString('utf8').substring(0, 400));
    return;
  }

  // 5. If redirected, follow with session cookie to get the page with CSV link
  if (rf.headers['location']) {
    const redir = rf.headers['location'];
    const nextUrl = redir.startsWith('http') ? redir.split('#')[0] : BASE + redir.split('#')[0];
    console.log('5. Following redirect to get CSV link:', nextUrl);
    const r5 = await req(nextUrl);
    console.log('   Status:', r5.status);
    
    // Extract the CSV URL from the page
    const csvMatch = r5.body.match(/href="([^"]*views_data_export[^"]*\.csv[^"]*)"/) || r5.body.match(/views_data_export[^"\']*\.csv[^"\'\s\<]*/i);
    if (csvMatch) {
      let csvPath = csvMatch[1] || csvMatch[0];
      // Clean up the path - remove extra slashes, decode entities
      csvPath = csvPath.replace(/\\\//g, '/').replace(/\\u00([0-9a-f]{2})/gi, (m, c) => String.fromCharCode(parseInt(c, 16))).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const csvUrl = (csvPath.startsWith('http') ? csvPath : BASE + '/' + csvPath).split('"')[0].split("'")[0];
      console.log('6. Found CSV URL:', csvUrl);
      console.log('   Downloading with session cookie...');
      const csv = await req(csvUrl);
      console.log('   Status:', csv.status, 'len:', csv.raw.length);
      
      // Check if it's actually CSV
      if (csv.raw.length > 1000 && (csv.raw.toString('utf8', 0, 100).includes('Name') || csv.raw.toString('utf8').includes('ABN') || csv.raw.toString('utf8', 0, 50).match(/^[^,]+,[^,\n]+/))) {
        fs.writeFileSync(OUT, csv.raw);
        console.log('   ✅ CSV saved!', csv.raw.length, 'bytes');
        console.log('   Preview (first 500 chars):');
        console.log(csv.raw.toString('utf8').substring(0, 500));
      } else if (csv.body.includes('<!DOCTYPE')) {
        console.log('   ❌ Got HTML, not CSV. CSV URL probably expired.');
      } else {
        fs.writeFileSync(OUT, csv.raw);
        console.log('   Saved as-is:', csv.raw.length, 'bytes');
        console.log('   Preview:', csv.raw.toString('utf8').substring(0, 300));
      }
    } else {
      console.log('   ❌ No CSV link found in page');
      console.log('   Body snippet:', r5.body.substring(0, 500));
    }
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
