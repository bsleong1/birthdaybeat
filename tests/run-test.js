/* BirthdayBeat tests. Run:  node tests/run-test.js
   1) Messy fictional data: proves nothing is guessed, nobody is missed, and sensitive cases are held back.
   2) Your real file (if present): proves the weekly list for 23 Nov 2026 is complete. */
'use strict';
const fs = require('fs'), path = require('path');
const BB = require('../core.js');
const XLSX = require('../lib/xlsx.full.min.js');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

console.log('\n1. Messy data handling (fictional customers)');
const rows = [
  ['Customer list export', '', '', '', '', ''],
  [],
  ['No.', 'Customer Name', 'Company', 'Date of Birth', 'Mobile No.', 'E-mail', 'Account Manager'],
  [1, 'AHMAD BIN ALI', 'Maju Jaya Sdn Bhd', '25/11/1980', '012-345 6789', 'ahmad@example.com', 'siti aminah'],
  [2, 'Tan Mei Ling', 'Kopi Co', '26/11/1990', '0198765432', 'not-an-email', ''],
  [3, 'RAJESH A/L KUMAR', '', '02/12/1975', '+60 17-222 3333', '', ''],
  [4, 'Lim Ah Kow', '', '', '0123456789', '', ''],                      // missing birthday
  [5, 'Wong Siew Lan', '', 'sometime in May', '', '', ''],              // unreadable
  [6, 'Leap Day Person', '', '29/02/1988', '0111111111', '', ''],       // 29 Feb
  [7, 'Tan Mei Ling', 'Kopi Co', '26/11/1990', '', '', ''],             // duplicate row: merge
  [8, 'Chong Wei', '', '01/01/1985', '12345', '', ''],                 // wraps to next year, bad phone
  [9, 'Double Date', '', '10/10/1970', '', '', ''],
  [10, 'Double Date', '', '11/10/1970', '', '', ''],                    // conflicting birthdays
  [11, '', '', '', '', '', ''],                                         // blank row
  [12, 'Ng Kah Hoe', '', '28 Nov 1966', '016 555 4444', 'kh@example.com', '']
];
const r = BB.buildCustomers(rows, { todayY: 2026 });
ok(!r.error && r.headerIndex === 2, 'finds the header row even with a title above it');
ok(r.map.name === 1 && r.map.birthday === 3 && r.map.phone === 4 && r.map.email === 5 && r.map.manager === 6, 'matches messy column names (Date of Birth, Mobile No., E-mail)');
ok(r.dateOrder === 'DMY', 'works out day/month order from the data (25/11 can only be day-first)');
ok(r.customers.filter(c => c.name === 'Tan Mei Ling').length === 1, 'merges duplicate rows of the same customer');
ok(r.needsCheck.some(n => n.name === 'Lim Ah Kow' && /missing/.test(n.problem)), 'missing birthday → Needs checking (not guessed)');
ok(r.needsCheck.some(n => n.name === 'Wong Siew Lan' && /not a date/.test(n.problem)), 'unreadable birthday → Needs checking');
ok(r.needsCheck.some(n => n.name === 'Double Date' && /Different birthdays/.test(n.problem)), 'conflicting birthdays for one name → Needs checking');
const ahmad = r.customers.find(c => c.name === 'Ahmad bin Ali');
ok(!!ahmad, 'ALL-CAPS names become "Ahmad bin Ali" (Malay particles kept lower-case)');
ok(ahmad && ahmad.wa === '60123456789' && ahmad.manager === 'Siti Aminah', 'Malaysian mobile 012-345 6789 → WhatsApp 60123456789; manager name tidied');
ok(r.customers.find(c => c.name === 'Rajesh a/l Kumar').wa === '60172223333', '+60 17-222 3333 handled');
ok(/not valid/.test(r.customers.find(c => c.name === 'Tan Mei Ling').emailIssue), 'bad email flagged, not used');
const chong = r.customers.find(c => c.name === 'Chong Wei');
ok(chong.wa === '' && /not recognised/.test(chong.phoneIssue), 'bad phone flagged; no WhatsApp link created');

// Ambiguous file: every date could be either way → never guessed
const amb = BB.buildCustomers([['Name', 'Birthday'], ['A', '03/04/1980'], ['B', '05/06/1979']], { todayY: 2026 });
ok(amb.customers.length === 0 && amb.needsCheck.length === 2 && /could be/.test(amb.needsCheck[0].problem), 'ambiguous dates (03/04) are held for you to choose, not guessed');
ok(BB.buildCustomers([['Name', 'Birthday'], ['A', '03/04/1980']], { todayY: 2026, dateOrder: 'DMY' }).customers[0].dob.m === 4, '…and read correctly once you choose day/month');

// Week window from Mon 23 Nov 2026, 10 days, remind 3 days before
const from = { y: 2026, m: 11, d: 23 };
const wk = BB.upcoming(r.customers, from, 10, 3);
const names = wk.map(u => u.c.name);
ok(names.join(',') === 'Ahmad bin Ali,Tan Mei Ling,Ng Kah Hoe,Rajesh a/l Kumar', 'week of 23 Nov lists exactly the 4 birthdays from 23 Nov to 2 Dec');
ok(wk[0].urgency === 'late' && wk[0].until === 2, '25 Nov (2 days away) → "send now"');
ok(wk[1].urgency === 'today' && BB.toISO(wk[1].remindOn) === '2026-11-23', '26 Nov → reminder day is 23 Nov (3 days before)');
ok(wk[2].urgency === 'soon' && BB.toISO(wk[2].remindOn) === '2026-11-25', '28 Nov → prepare from 25 Nov');
const jan = BB.upcoming(r.customers, { y: 2026, m: 12, d: 28 }, 10, 3);
ok(jan.some(u => u.c.name === 'Chong Wei' && u.date.y === 2027 && u.date.d === 1), 'year-end: 1 Jan birthday appears in the list run on 28 Dec');
const leap = BB.upcoming(r.customers, { y: 2027, m: 2, d: 22 }, 10, 3).find(u => u.c.name === 'Leap Day Person');
ok(leap && leap.date.d === 28 && leap.leapNote, '29 Feb birthday → celebrated 28 Feb in non-leap years');

// Sensitive status: policy terminated due to death
const pol = [['Policy No.', 'Policy Holder', 'DOB', 'Life Assured', 'Status'],
  [1, 'MR GONE', '24/11/1950', 'MR GONE', 'Terminated (Death)'],
  [2, 'MR GONE', '24/11/1950', 'MR GONE', 'Inforce (Regular)'],
  [3, 'MRS GRIEF', '25/11/1960', 'CHILD OF MRS GRIEF', 'Terminated (Death)'],
  [4, 'MS ACTIVE', '26/11/1970', 'MS ACTIVE', 'Inforce (Regular)'],
  [5, 'MR LAPSED', '27/11/1970', 'MR LAPSED', 'Lapsed (Normal Lapse)']];
const p = BB.buildCustomers(pol, { todayY: 2026 });
ok(p.map.name === 1 && p.map.birthday === 2 && p.map.status === 4 && p.map.lifeAssured === 3, 'insurer policy listing recognised (Policy Holder / DOB / Status)');
ok(p.held.length === 2 && /Do not send/.test(p.customers.find(c => c.name === 'Mr Gone').blocked), '"Terminated (Death)" → customer held back, never in the send list');
ok(/family member/.test(p.customers.find(c => c.name === 'Mrs Grief').blocked), 'death of a family member on the policy → held for a human check');
ok(p.customers.find(c => c.name === 'Mr Lapsed').inforce === false, 'lapsed-only customer is still wished, tagged "No in-force policy"');

// Messages and card
const m = BB.message(ahmad, 'en', { senderName: 'Your Name', company: 'Example Advisory' });
ok(/Ahmad bin Ali/.test(m) && /Siti Aminah/.test(m), 'English message greets the customer and is signed by the account manager');
ok(/Selamat|Salam/.test(BB.message(ahmad, 'ms', {})), 'Malay message drafted');
ok(/生日快乐/.test(BB.message(ahmad, 'zh', {})) && /祝好/.test(BB.message(ahmad, 'zh', {})) && [0, 1, 2].every(v => /Ahmad bin Ali/.test(BB.message(ahmad, 'zh', {}, v))), 'Chinese message drafted (all 3 wordings greet the customer)');
ok(BB.mailLink(ahmad, 'zh', 'x').includes(encodeURIComponent('生日快乐')) && BB.subject(ahmad, 'zh') === 'Ahmad bin Ali，生日快乐！', 'Chinese email subject line');
ok(/\[Your name\]/.test(BB.message(chong, 'en', {})), 'no sender name set → clear "[Your name]" placeholder, never a made-up name');
ok(BB.waLink(ahmad, 'hi').startsWith('https://wa.me/60123456789?text=hi'), 'WhatsApp link pre-fills the message');
ok(/<svg[\s\S]*Ahmad bin Ali[\s\S]*<\/svg>/.test(BB.cardSVG(ahmad, {})), 'birthday card image contains the customer name');
const merge = BB.planContactMerge(r.customers, [['Name', 'Phone', 'Email'], ['ng kah hoe', '0177777777', ''], ['Unknown Person', '0123', '']]);
ok(merge.changes.length === 1 && merge.unmatched.length === 1 && merge.changes[0].upd.wa === '60177777777', 'contacts file: matches by name, reports unmatched names, changes nothing else');

// Optional: checks against your own customer list (the "dataFile" in config.json). No customer data is printed.
const cfgPath = path.join(__dirname, '..', 'config.json');
const real = fs.existsSync(cfgPath) ? path.resolve(__dirname, '..', JSON.parse(fs.readFileSync(cfgPath, 'utf8')).dataFile || '') : '';
if (real && fs.existsSync(real) && fs.statSync(real).isFile()) {
  console.log('\n2. Your own customer list (from config.json)');
  const wb = XLSX.read(fs.readFileSync(real), { type: 'buffer' });
  const rr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const g = BB.buildCustomers(rr, {});
  ok(!g.error, `list read: ${g.stats ? g.stats.customers : 0} customers, ${g.needsCheck ? g.needsCheck.length : 0} need checking, ${g.held ? g.held.length : 0} held back`);
  if (!g.error) {
    // Independent check: go through every row by hand and compare with the app's list for the next 10 days.
    const from = BB.todayLocal(); const heldKeys = new Set(g.held.map(c => c.key)); const badKeys = new Set(g.needsCheck.map(n => n.key));
    const expect = new Set();
    rr.slice(g.headerIndex + 1).forEach(x => {
      const k = BB.nameKey(x[g.map.name]); if (!k || heldKeys.has(k) || badKeys.has(k)) return;
      const p = BB.parseDate(x[g.map.birthday], g.dateOrder); if (p.status !== 'ok') return;
      for (let i = 0; i < 10; i++) { const day = BB.addDays(from, i); const leap = p.m === 2 && p.d === 29 && !BB.isLeap(day.y);
        if ((day.m === p.m && day.d === p.d) || (leap && day.m === 2 && day.d === 28)) expect.add(k); }
    });
    const got = new Set(BB.upcoming(g.customers.filter(c => !c.blocked), from, 10, 3).map(u => u.c.key));
    ok(got.size === expect.size && [...expect].every(k => got.has(k)), `next 10 days: the app lists ${got.size} birthdays; a row-by-row check finds the same ${expect.size}. Nobody missed.`);
    const seen = new Set();
    for (let w = 0; w < 53; w++) BB.upcoming(g.customers.filter(c => !c.blocked), BB.addDays(from, w * 7), 7, 3).forEach(u => seen.add(u.c.key));
    ok(g.customers.filter(c => !c.blocked).every(c => seen.has(c.key)), 'over a full year of weekly runs, every sendable customer comes up at least once');
  }
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
