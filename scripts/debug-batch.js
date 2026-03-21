const https = require('https');
const fs = require('fs');

function req(url, cookies) {
  return new Promise((res, rej) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Cookie': cookies || ''
      },
      rejectUnauthorized: false
    };
    https.get(url, opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({
        status: r.statusCode,
        loc: r.headers['location'],
        body: d,
        setCookies: r.headers['set-cookie'] || []
      }));
    }).on('error', rej);
  });
}

function mergeCookies(existing, setCookies) {
  const jar = {};
  existing.split('; ').filter(Boolean).forEach(c => {
    const [k, ...v] = c.split('='); jar[k] = v.join('=');
  });
  setCookies.forEach(c => {
    const [nameVal] = c.split(';');
    const [k, ...v] = nameVal.split('='); jar[k.trim()] = v.join('=').trim();
  });
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

async function main() {
  let cookies = '';
  
  console.log('Step 1: Get session cookie...');
  const r1 = await req('https://www.ndiscommission.gov.au/provider-registration/find-registered-provider', cookies);
  cookies = mergeCookies(cookies, r1.setCookies);
  console.log('Cookies after step1:', cookies.substring(0, 120) || '(none)');
  
  console.log('Step 2: Trigger export...');
  const r2 = await req(
    'https://www.ndiscommission.gov.au/provider-registration/find-registered-provider/export?field_registration_status_value=Approved&field_legal_name=&field_abn_value=&title=',
    cookies
  );
  cookies = mergeCookies(cookies, r2.setCookies);
  console.log('Step2 Status:', r2.status, 'Location:', r2.loc);
  console.log('Cookies after step2:', cookies.substring(0, 120) || '(none)');
  
  const m = (r2.loc || '').match(/batch\?id=(\d+)/);
  if (!m) {
    console.log('No batch ID found. Body start:', r2.body.substring(0, 200));
    return;
  }
  const batchId = m[1];
  console.log('Batch ID:', batchId);
  
  // Try op=start first
  console.log('Step 3a: Visit batch start page...');
  const r3a = await req('https://www.ndiscommission.gov.au/batch?id=' + batchId + '&op=start', cookies);
  cookies = mergeCookies(cookies, r3a.setCookies);
  console.log('Start status:', r3a.status, 'loc:', r3a.loc, 'len:', r3a.body.length);
  
  console.log('Step 3b: Poll batch do_nojs...');
  const r3 = await req('https://www.ndiscommission.gov.au/batch?id=' + batchId + '&op=do_nojs', cookies);
  console.log('Batch response status:', r3.status, 'body len:', r3.body.length);
  fs.writeFileSync('scripts/batch_raw.html', r3.body);
  console.log('Body preview:', r3.body.substring(0, 600));
  console.log('Loc:', r3.loc);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
