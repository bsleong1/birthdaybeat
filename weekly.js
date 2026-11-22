/* BirthdayBeat weekly job.
   Reads the customer list named in config.json, finds birthdays in the coming period, and writes
   to output\<date>\ : one PDF (cards + English & Malay messages) and one PNG card per customer.
   It never sends anything. Usage:  node weekly.js            (period starts today)
                                    node weekly.js --date=2026-11-23   (test a specific Monday) */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const BB = require('./core.js');
const XLSX = require('./lib/xlsx.full.min.js');

const HERE = __dirname;
const log = (...a) => { const line = '[' + new Date().toISOString() + '] ' + a.join(' '); console.log(line); try { fs.appendFileSync(path.join(HERE, 'weekly-log.txt'), line + '\n'); } catch (e) { } };

function readSheet(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}
function findEdge() {
  const c = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
  return c.find(p => fs.existsSync(p));
}
const safe = s => String(s).replace(/[^A-Za-z0-9 ._-]/g, '').trim().replace(/\s+/g, '-');

function run(argv) {
  const cfgFile = path.join(HERE, 'config.json');
  if (!fs.existsSync(cfgFile)) throw new Error('config.json not found. Copy config.example.json to config.json and set "dataFile" to your customer list.');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const dArg = (argv.find(a => a.startsWith('--date=')) || '').slice(7);
  const from = dArg ? BB.fromISO(dArg) : BB.todayLocal();
  if (!from) throw new Error('Bad --date. Use --date=YYYY-MM-DD');
  const days = cfg.days || 10, remind = cfg.remindDays == null ? 3 : cfg.remindDays;
  const dataFile = path.resolve(HERE, cfg.dataFile);
  if (!fs.existsSync(dataFile)) throw new Error('Customer list not found: ' + dataFile + '  (update "dataFile" in config.json)');

  const res = BB.buildCustomers(readSheet(dataFile), { dateOrder: cfg.dateOrder || null, todayY: from.y });
  if (res.error) throw new Error(res.error);
  if (cfg.contactsFile && fs.existsSync(path.resolve(HERE, cfg.contactsFile))) {
    const plan = BB.planContactMerge(res.customers, readSheet(path.resolve(HERE, cfg.contactsFile)));
    if (!plan.error) { BB.applyContactMerge(res.customers, plan); log('Contacts merged:', plan.changes.length, 'customers updated;', plan.unmatched.length, 'names not matched'); }
    else log('Contacts file skipped:', plan.error);
  }
  const ok = res.customers.filter(c => !c.blocked);
  const list = BB.upcoming(ok, from, days, remind);
  const heldInPeriod = BB.upcoming(res.held, from, days, remind).map(u => u.c);
  const settings = { senderName: cfg.senderName || '', company: cfg.company || '', useManager: cfg.useManager !== false, cardLang: cfg.cardLang || 'all' };

  const outDir = path.resolve(HERE, cfg.outputDir || 'output', BB.toISO(from));
  fs.mkdirSync(path.join(outDir, 'cards'), { recursive: true });
  const edge = findEdge(); if (!edge) throw new Error('Microsoft Edge not found; it is needed to create the PDF.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbeat-'));
  const prof = path.join(tmp, 'profile');
  const edgeArgs = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--user-data-dir=' + prof];
  try {
    // 1) PNG cards (one per customer) for pasting into WhatsApp / email
    const cardFiles = [];
    // Draw every SVG card onto a canvas inside headless Edge and read the PNGs back from the page.
    if (list.length) {
      const svgs = list.map(u => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(BB.cardSVG(u.c, settings)));
      const html = path.join(tmp, 'cards.html');
      fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body><pre id="out">PENDING</pre><script>
const svgs=${JSON.stringify(svgs)};
Promise.all(svgs.map(s=>new Promise((ok,bad)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=1080;c.height=1080;c.getContext('2d').drawImage(im,0,0,1080,1080);ok(c.toDataURL('image/png'))};im.onerror=()=>bad('image');im.src=s;})))
.then(a=>{document.getElementById('out').textContent='PNGS:'+a.join('|')+':END'}).catch(e=>{document.getElementById('out').textContent='FAIL:'+e});
</script></body></html>`);
      const dom = execFileSync(edge, [...edgeArgs, '--virtual-time-budget=15000', '--dump-dom', 'file:///' + html.replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = dom.match(/PNGS:([^<]*):END/);
      if (!m) throw new Error('Could not draw the card images (' + (dom.match(/FAIL:[^<]*/) || ['no output'])[0] + ')');
      m[1].split('|').forEach((d, i) => {
        const png = path.join(outDir, 'cards', String(i + 1).padStart(2, '0') + '-' + safe(list[i].c.name) + '.png');
        fs.writeFileSync(png, Buffer.from(d.replace(/^data:image\/png;base64,/, ''), 'base64'));
        cardFiles.push(png);
      });
    }
    // 2) PDF list
    const report = BB.reportHTML(list, settings, { from, days, held: heldInPeriod, needsCheck: res.needsCheck, missingFields: res.missingFields, generated: BB.fmtDate(BB.todayLocal()) });
    const rhtml = path.join(tmp, 'report.html'); fs.writeFileSync(rhtml, report);
    const pdf = path.join(outDir, 'Birthday-list-' + BB.toISO(from) + '.pdf');
    execFileSync(edge, [...edgeArgs, '--no-pdf-header-footer', '--print-to-pdf=' + pdf, 'file:///' + rhtml.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 120000 });
    if (!fs.existsSync(pdf)) throw new Error('PDF was not created');
    const summary = { from: BB.toISO(from), days, birthdays: list.length, sendNow: list.filter(u => u.urgency !== 'soon').length, held: heldInPeriod.length, needsCheck: res.needsCheck.length, customers: res.stats.customers, pdf, cards: cardFiles };
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    log('Done:', list.length, 'birthdays from', BB.toISO(from), 'for', days, 'days →', pdf);
    return summary;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  }
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (e) { log('ERROR:', e.message); process.exitCode = 1; }
}
module.exports = { run };
