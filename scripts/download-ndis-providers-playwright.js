/**
 * download-ndis-providers-playwright.js
 *
 * Uses Playwright Chromium to:
 *   1. Navigate to the NDIS Commission registered provider search page
 *   2. Set Registration Status = "Approved"
 *   3. Trigger the CSV export (which fires a Drupal batch job)
 *   4. Wait for the batch to complete and intercept the CSV download
 *   5. Save the raw CSV to scripts/ndis_providers_raw.csv
 *
 * Run from the scripts/ directory:
 *   node download-ndis-providers-playwright.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'ndis_providers_raw.csv');
const BASE_URL = 'https://www.ndiscommission.gov.au';
const SEARCH_URL = `${BASE_URL}/provider-registration/find-registered-provider`;

// How long (ms) to wait for the batch export to finish — may take several minutes
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;

(async () => {
  console.log('Launching browser…');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // ── Step 1: Load the search page ──────────────────────────────────────────
  console.log('Navigating to provider search page…');
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60_000 });

  // ── Step 2: Select "Approved" in the Registration Status dropdown ─────────
  console.log('Setting Registration Status = Approved…');

  // The select element may have multiple selectors depending on the Drupal form.
  // Try common Drupal field patterns.
  const statusSelectors = [
    'select[name="field_registration_status_value"]',
    '#edit-field-registration-status-value',
    'select#edit-field-registration-status-value',
  ];

  let statusSelected = false;
  for (const sel of statusSelectors) {
    try {
      await page.selectOption(sel, { value: 'Approved' }, { timeout: 5_000 });
      console.log(`  Selected using: ${sel}`);
      statusSelected = true;
      break;
    } catch (_) {
      // try next selector
    }
  }

  if (!statusSelected) {
    // Dump the form HTML so we can debug
    const formHTML = await page.content();
    fs.writeFileSync(path.join(__dirname, 'ndis_form_debug.html'), formHTML, 'utf8');
    console.error('Could not find Registration Status dropdown. Saved page HTML to ndis_form_debug.html.');
    await browser.close();
    process.exit(1);
  }

  // ── Step 3: Click the Export CSV link / button ────────────────────────────
  // Drupal Views Bulk Operations typically exposes a "CSV" link or an export
  // button separate from the main "Search" button.
  // Strategy A: look for an explicit export/download link
  // Strategy B: look for a "Export" or "Download CSV" button
  // Strategy C: construct the export URL directly and navigate to it

  console.log('Looking for CSV export link…');

  // First try to find a visible CSV export link on the page
  const exportLinkSelectors = [
    'a[href*="export"]',
    'a[href*="csv"]',
    'a[href*="download"]',
    '.views-data-export-feed a',
    'a.feed-icon',
  ];

  let exportHref = null;
  for (const sel of exportLinkSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        exportHref = await el.getAttribute('href');
        if (exportHref) {
          console.log(`  Found export link via '${sel}': ${exportHref}`);
          break;
        }
      }
    } catch (_) {}
  }

  // If no link found, build the export URL from the known Drupal Views Data Export pattern
  if (!exportHref) {
    console.log('  No export link found on page. Constructing export URL from known pattern…');
    exportHref =
      '/provider-registration/find-registered-provider/export' +
      '?field_registration_status_value=Approved' +
      '&field_registration_groups_target_id=All' +
      '&title=&field_address_locality=&field_address_postal_code=';
  }

  const exportUrl = exportHref.startsWith('http') ? exportHref : `${BASE_URL}${exportHref}`;
  console.log(`Export URL: ${exportUrl}`);

  // ── Step 4: Navigate to export URL — this triggers the Drupal batch ───────
  // The server will redirect to /batch?id=XXX&op=start
  // Set up download listener before navigating
  let downloadPromise = null;
  const downloadHandler = (download) => {
    console.log('  Download event fired:', download.suggestedFilename());
    downloadPromise = download.path().then((p) => {
      if (p) {
        fs.copyFileSync(p, OUTPUT_FILE);
        console.log(`  Saved to ${OUTPUT_FILE}`);
      }
    });
  };
  context.on('download', downloadHandler);
  page.on('download', downloadHandler);

  console.log('Navigating to export URL (triggers batch)…');
  const exportResponse = await page.goto(exportUrl, {
    waitUntil: 'load',
    timeout: 60_000,
  });

  const afterExportUrl = page.url();
  console.log(`After export nav, current URL: ${afterExportUrl}`);

  // ── Step 5: Handle the Drupal batch progress page ─────────────────────────
  if (afterExportUrl.includes('/batch')) {
    console.log('On batch page. Waiting for batch to complete…');

    // Drupal renders a batch progress bar; JS triggers the batch steps.
    // We wait for the redirect away from /batch (happens when 100% done).
    try {
      await page.waitForURL((url) => !url.toString().includes('/batch'), {
        timeout: BATCH_TIMEOUT_MS,
      });
      console.log(`Batch complete. Now at: ${page.url()}`);
    } catch (e) {
      // Batch might have auto-advanced; check current URL
      console.log(`Batch timeout / URL: ${page.url()}`);
    }
  }

  // After the batch redirects, the browser session should download the CSV
  // or we should be on a page with a download link.

  // Give download a moment to start
  await page.waitForTimeout(3000);

  if (downloadPromise) {
    await downloadPromise;
    console.log('Download complete.');
  } else {
    // Download event may not have fired — try to find CSV URL in current page
    console.log('No download event. Scanning current page for CSV link…');
    const pageContent = await page.content();

    const csvMatch = pageContent.match(/href="([^"]*views_data_export[^"]*\.csv[^"]*)"/);
    if (csvMatch) {
      const csvUrl = csvMatch[1].startsWith('http')
        ? csvMatch[1]
        : `${BASE_URL}${csvMatch[1]}`;
      console.log(`Found CSV URL: ${csvUrl}`);

      // Use waitForEvent('download') then click/navigate — page.goto throws when download starts
      const downloadEventPromise = context.waitForEvent('download', { timeout: 60_000 });
      // Trigger navigation in background; it will throw due to download, that's expected
      page.goto(csvUrl).catch(() => {});
      const download = await downloadEventPromise;

      const tmpPath = await download.path();
      if (tmpPath) {
        fs.copyFileSync(tmpPath, OUTPUT_FILE);
        console.log(`Saved CSV via download intercept to ${OUTPUT_FILE}`);
      } else {
        // Fallback: save to explicit location
        await download.saveAs(OUTPUT_FILE);
        console.log(`Saved CSV via download.saveAs to ${OUTPUT_FILE}`);
      }
    } else {
      // Last resort: try the fetch API approach inside the browser (keeps cookies)
      console.log('No CSV link found in page. Trying in-page fetch of export URL…');
      const csvData = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'include' });
        return res.ok ? res.text() : null;
      }, exportUrl);

      if (csvData && csvData.trim().startsWith('"')) {
        fs.writeFileSync(OUTPUT_FILE, csvData, 'utf8');
        console.log(`Saved CSV via in-page fetch to ${OUTPUT_FILE}`);
      } else {
        fs.writeFileSync(path.join(__dirname, 'ndis_after_batch.html'), pageContent, 'utf8');
        console.error('All CSV capture strategies exhausted. Saved debug HTML.');
        await browser.close();
        process.exit(1);
      }
    }
  }

  await browser.close();

  // ── Step 6: Verify the CSV ────────────────────────────────────────────────
  const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
  const lines = content.trim().split('\n');
  if (lines.length < 2 || lines[0].includes('<html') || lines[0].includes('<!DOCTYPE')) {
    console.error(
      `Output file does not look like a CSV (${lines.length} lines, starts with HTML?). ` +
        'Check ndis_providers_raw.csv.'
    );
    process.exit(1);
  }
  console.log(`\nCSV downloaded successfully: ${lines.length} lines (including header)`);
  console.log(`Header: ${lines[0]}`);
  console.log(`First data row: ${lines[1]}`);
  console.log(`\nNext step: node import-ndis-providers.js`);
})();
