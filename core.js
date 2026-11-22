/* BirthdayBeat core: shared by the browser app (index.html) and the weekly job (weekly.js).
   Pure functions only: reading rows, cleaning data, finding upcoming birthdays, drafting
   messages, drawing the card (SVG) and building the printable PDF page (HTML). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- Column recognition ---------------- */
  const FIELDS = {
    name:      { label: 'Customer name', exact: ['customername', 'name', 'clientname', 'policyholder', 'policyholdername', 'fullname', 'customer', 'client', 'nama', 'namapelanggan'], contains: ['customername', 'clientname', 'policyholder', 'fullname'] },
    preferred: { label: 'Preferred name', exact: ['preferredname', 'nickname', 'callname', 'salutation', 'greetas'], contains: ['preferred', 'nickname'] },
    birthday:  { label: 'Birthday', exact: ['birthday', 'dob', 'dateofbirth', 'birthdate', 'tarikhlahir', 'bday', 'tlahir'], contains: ['birthday', 'dateofbirth', 'birthdate', 'tarikhlahir'] },
    company:   { label: 'Company', exact: ['company', 'companyname', 'employer', 'organisation', 'organization', 'syarikat', 'firm'], contains: ['company', 'employer', 'syarikat'] },
    phone:     { label: 'Phone', exact: ['phone', 'mobile', 'phoneno', 'phonenumber', 'mobileno', 'mobilenumber', 'contact', 'contactno', 'contactnumber', 'handphone', 'hp', 'hpno', 'whatsapp', 'tel', 'telephone', 'notelefon', 'telefon'], contains: ['phone', 'mobile', 'whatsapp', 'handphone', 'telefon'] },
    email:     { label: 'Email', exact: ['email', 'emailaddress', 'mail', 'emel'], contains: ['email', 'emel'] },
    manager:   { label: 'Account manager', exact: ['accountmanager', 'manager', 'rm', 'relationshipmanager', 'advisor', 'adviser', 'servicingagent', 'servicingagentname', 'accountowner', 'owner', 'pic'], contains: ['accountmanager', 'relationshipmanager', 'servicing'] },
    agent:     { label: 'Issuing agent (info only)', exact: ['issuingagent', 'issuingagentname', 'agent', 'agentname'], contains: ['issuingagent'] },
    status:    { label: 'Policy status', exact: ['status', 'policystatus'], contains: ['status'] },
    lifeAssured: { label: 'Life assured', exact: ['lifeassured', 'insured', 'insuredname', 'lifeassuredname'], contains: ['lifeassured'] }
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

  function mapColumns(header) {
    const map = {}; const used = new Set();
    header.forEach((h, i) => {
      const n = norm(h); if (!n) return;
      for (const f in FIELDS) if (map[f] == null && FIELDS[f].exact.includes(n)) { map[f] = i; used.add(i); return; }
    });
    header.forEach((h, i) => {
      if (used.has(i)) return; const n = norm(h); if (!n) return;
      for (const f in FIELDS) if (map[f] == null && FIELDS[f].contains.some(c => n.includes(c))) { map[f] = i; used.add(i); return; }
    });
    return map;
  }

  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const m = mapColumns(rows[r] || []);
      if (m.name != null && m.birthday != null) return { index: r, map: m };
    }
    return null;
  }

  /* ---------------- Dates ---------------- */
  const MONTHS = { jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, mac: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, jul: 7, july: 7, julai: 7, aug: 8, august: 8, ogos: 8, ogo: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, dis: 12, disember: 12 };
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const validDM = (d, m, y) => m >= 1 && m <= 12 && d >= 1 && d <= (y ? dim(y, m) : [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
  const fullYear = (yy, todayY) => { if (yy >= 100) return yy; const c = todayY % 100; return yy > c ? 1900 + yy : 2000 + yy; };

  /* Returns {status:'ok', y, m, d} | {status:'ambiguous', a, b, raw} | {status:'empty'} | {status:'error', raw}
     `order` = 'DMY' | 'MDY' | null. With null, 03/04/1985 is reported as ambiguous, never guessed. */
  function parseDate(v, order, todayY) {
    todayY = todayY || new Date().getFullYear();
    if (v == null || v === '') return { status: 'empty' };
    if (v instanceof Date && !isNaN(v)) return { status: 'ok', y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    if (typeof v === 'number') {
      if (v < 1 || v > 80000 || Math.floor(v) !== v && v % 1 > 0.9999) return { status: 'error', raw: String(v) };
      const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return { status: 'ok', y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    }
    const raw = String(v).trim(); const s = raw.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
    if (!s || /^[-–—n\/a.?]+$/.test(s)) return { status: 'empty' };
    let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ t].*)?$/))) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return validDM(d, mo, y) ? { status: 'ok', y, m: mo, d } : { status: 'error', raw };
    }
    if ((m = s.match(/^(\d{1,2})[-\/. ](\d{1,2})(?:[-\/. ](\d{2,4}))?(?: .*)?$/))) {
      const p1 = +m[1], p2 = +m[2], y = m[3] ? fullYear(+m[3], todayY) : null;
      const dmy = validDM(p1, p2, y), mdy = validDM(p2, p1, y);
      if (dmy && mdy && p1 !== p2) {
        if (order === 'DMY') return { status: 'ok', y, m: p2, d: p1 };
        if (order === 'MDY') return { status: 'ok', y, m: p1, d: p2 };
        return { status: 'ambiguous', raw, a: { y, m: p2, d: p1 }, b: { y, m: p1, d: p2 } };
      }
      if (dmy) return { status: 'ok', y, m: p2, d: p1, hint: p1 > 12 ? 'DMY' : null };
      if (mdy) return { status: 'ok', y, m: p1, d: p2, hint: p2 > 12 ? 'MDY' : null };
      return { status: 'error', raw };
    }
    if ((m = s.match(/^(\d{1,2})[-\/ ]([a-z]+)\.?(?:[-\/ ](\d{2,4}))?$/))) {
      const mo = MONTHS[m[2]]; const y = m[3] ? fullYear(+m[3], todayY) : null;
      return mo && validDM(+m[1], mo, y) ? { status: 'ok', y, m: mo, d: +m[1] } : { status: 'error', raw };
    }
    if ((m = s.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{2,4}))?$/))) {
      const mo = MONTHS[m[1]]; const y = m[3] ? fullYear(+m[3], todayY) : null;
      return mo && validDM(+m[2], mo, y) ? { status: 'ok', y, m: mo, d: +m[2] } : { status: 'error', raw };
    }
    return { status: 'error', raw };
  }

  /* Decide day/month order for a whole column from the unambiguous values (e.g. 25/03 proves DMY). */
  function detectDateOrder(values) {
    let dmy = 0, mdy = 0, ambiguous = 0;
    values.forEach(v => {
      if (typeof v !== 'string') return;
      const r = parseDate(v, null);
      if (r.hint === 'DMY') dmy++; else if (r.hint === 'MDY') mdy++; else if (r.status === 'ambiguous') ambiguous++;
    });
    if (dmy && !mdy) return { order: 'DMY', ambiguous, evidence: dmy };
    if (mdy && !dmy) return { order: 'MDY', ambiguous, evidence: mdy };
    return { order: null, ambiguous, conflict: !!(dmy && mdy) };
  }

  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const utc = (y, m, d) => Date.UTC(y, m - 1, d);
  const fromUTC = t => { const x = new Date(t); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: x.getUTCDay() }; };
  const fmtDate = (o, withDow) => { const f = fromUTC(utc(o.y, o.m, o.d)); return (withDow ? DAY_EN[f.dow] + ', ' : '') + f.d + ' ' + MON_EN[f.m - 1] + ' ' + f.y; };
  const fmtDM = o => o.d + ' ' + MON_EN[o.m - 1];
  const addDays = (o, n) => fromUTC(utc(o.y, o.m, o.d) + n * 864e5);
  const toISO = o => o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0');
  const fromISO = s => { const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const todayLocal = () => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; };

  /* ---------------- Names, phones, emails ---------------- */
  const LOWER = new Set(['bin', 'binti', 'bte', 'bt', 'a/l', 'a/p', 'al', 'ap', 'van', 'de', 'der', 'von', 'anak', 'and', '@']);
  function titleCase(s) {
    s = String(s || '').trim().replace(/\s+/g, ' ');
    if (!s) return '';
    if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s; // already mixed case: respect it
    return s.split(' ').map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && LOWER.has(lw)) return lw;
      return lw.replace(/(^|[-'’(.])([a-z])/g, (a, p, c) => p + c.toUpperCase());
    }).join(' ');
  }
  const nameKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9@\/]/g, ' ').replace(/\s+/g, ' ').trim();

  function cleanPhone(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return { wa: '', issue: null, raw: '' };
    if (/[\/,;]| or /i.test(raw.replace(/^\+/, ''))) {
      const first = raw.split(/[\/,;]| or /i)[0];
      const r = cleanPhone(first); r.raw = raw; r.issue = 'More than one number; using the first (' + first.trim() + '). Please check.'; return r;
    }
    const plus = raw.startsWith('+'); let d = raw.replace(/\D/g, '');
    if (typeof v === 'number' && /^1\d{8,9}$/.test(d)) d = '0' + d; // Excel dropped the leading 0
    if (plus) return d.length >= 8 && d.length <= 15 ? { wa: d, issue: null, raw } : { wa: '', issue: 'Phone number looks incomplete', raw };
    if (/^60\d{8,10}$/.test(d)) return { wa: d, issue: null, raw };
    if (/^0\d{8,10}$/.test(d)) return { wa: '6' + d, issue: null, raw };
    if (/^1\d{8,9}$/.test(d)) return { wa: '60' + d, issue: null, raw };
    if (/^65[89]\d{7}$/.test(d)) return { wa: d, issue: null, raw };
    return { wa: '', issue: 'Phone number not recognised: "' + raw + '"', raw };
  }
  function cleanEmail(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return { email: '', issue: null };
    const e = raw.replace(/^mailto:/i, '').split(/[\s;,]+/)[0];
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) ? { email: e, issue: raw.split(/[\s;,]+/).length > 1 ? 'More than one email; using the first' : null } : { email: '', issue: 'Email not valid: "' + raw + '"' };
  }

  /* ---------------- Build the customer list ---------------- */
  const DEATH = /death|deceased|meninggal|died/i;
  const INFORCE = /in ?force|active|premium waived|fully paid|aktif/i;

  /* rows: array of arrays (whole sheet). opts: { map, headerIndex, dateOrder, todayY, source }
     Returns { customers, needsCheck, held, map, headerIndex, stats, dateOrder, missingFields } */
  function buildCustomers(rows, opts) {
    opts = opts || {};
    let headerIndex = opts.headerIndex, map = opts.map;
    if (headerIndex == null || !map) {
      const h = findHeader(rows);
      if (!h) return { error: 'Could not find a header row with a customer name and a birthday column. Check the file, or rename the columns to "Customer Name" and "Birthday".' };
      headerIndex = h.index; map = opts.map || h.map;
    }
    const data = [];
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (!row.some(c => c !== '' && c != null)) continue;
      data.push({ row, rowNo: r + 1 });
    }
    const get = (row, f) => map[f] == null ? '' : row[map[f]];
    const det = detectDateOrder(data.map(d => get(d.row, 'birthday')));
    const dateOrder = opts.dateOrder || det.order;

    const groups = new Map(); const needsCheck = []; let skippedBlank = 0;
    data.forEach(({ row, rowNo }) => {
      const nameRaw = String(get(row, 'name') == null ? '' : get(row, 'name')).trim();
      if (!nameRaw) { if (row.filter(c => c !== '' && c != null).length > 1) needsCheck.push({ name: '(no name)', rowNo, problem: 'Row has no customer name', raw: '' }); else skippedBlank++; return; }
      const key = nameKey(nameRaw);
      if (!groups.has(key)) groups.set(key, { key, nameRaw, rows: [] });
      groups.get(key).rows.push({ row, rowNo });
    });

    const customers = []; const held = [];
    groups.forEach(g => {
      const dobs = new Map(); const bad = [];
      g.rows.forEach(({ row, rowNo }) => {
        const p = parseDate(get(row, 'birthday'), dateOrder, opts.todayY);
        if (p.status === 'ok') dobs.set(p.y + '-' + p.m + '-' + p.d, p);
        else if (p.status !== 'empty') bad.push({ rowNo, p });
      });
      const first = f => { for (const { row } of g.rows) { const v = get(row, f); if (v !== '' && v != null && String(v).trim()) return v; } return ''; };
      const rowNos = g.rows.map(r => r.rowNo);
      const base = { key: g.key, name: titleCase(g.nameRaw), rowNos };
      if (dobs.size > 1) { needsCheck.push({ ...base, rowNo: rowNos[0], problem: 'Different birthdays on different rows (' + [...dobs.values()].map(fmtDate).join(' / ') + ')', raw: '' }); return; }
      if (dobs.size === 0) {
        if (bad.length) {
          const b = bad[0];
          needsCheck.push({ ...base, rowNo: b.rowNo, raw: b.p.raw, problem: b.p.status === 'ambiguous' ? 'Birthday "' + b.p.raw + '" could be ' + fmtDM(b.p.a) + ' or ' + fmtDM(b.p.b) + ' — confirm which' : 'Birthday "' + b.p.raw + '" is not a date I can read' });
        } else needsCheck.push({ ...base, rowNo: rowNos[0], problem: 'Birthday is missing', raw: '' });
        return;
      }
      const dob = [...dobs.values()][0];
      const ty = opts.todayY || new Date().getFullYear();
      if (dob.y && (dob.y > ty || ty - dob.y > 110)) { needsCheck.push({ ...base, rowNo: rowNos[0], problem: 'Birthday year ' + dob.y + ' looks wrong', raw: '' }); return; }

      const statuses = map.status == null ? [] : g.rows.map(({ row }) => String(get(row, 'status') || '').trim()).filter(Boolean);
      const ph = cleanPhone(first('phone')); const em = cleanEmail(first('email'));
      const c = {
        key: g.key, name: base.name, preferred: titleCase(first('preferred')) || '',
        dob: { y: dob.y, m: dob.m, d: dob.d }, company: String(first('company') || '').trim(),
        phone: ph.raw, wa: ph.wa, phoneIssue: ph.issue, email: em.email, emailIssue: em.issue,
        manager: titleCase(first('manager')), agent: titleCase(first('agent')),
        records: g.rows.length, rowNos, inforce: statuses.length ? statuses.some(s => INFORCE.test(s)) : null,
        source: opts.source || 'excel', notes: []
      };
      if (bad.length) c.notes.push(bad.length + ' other row(s) had an unreadable birthday; used the readable one.');
      // Death: never send a birthday wish without a human check.
      const deathRows = map.status == null ? [] : g.rows.filter(({ row }) => DEATH.test(String(get(row, 'status') || '')));
      if (deathRows.length) {
        const selfInsured = deathRows.some(({ row }) => map.lifeAssured == null || nameKey(get(row, 'lifeAssured')) === g.key);
        c.blocked = selfInsured ? 'A policy shows "Terminated (Death)" with this customer as the life assured. Do not send. Confirm with the office first.'
          : 'A policy on a family member shows "Terminated (Death)". The family may be grieving. Check before sending a cheerful message.';
        held.push(c);
      }
      customers.push(c);
    });
    const missingFields = ['phone', 'email', 'company', 'manager'].filter(f => map[f] == null);
    return {
      customers, needsCheck, held, map, headerIndex, dateOrder, dateDetect: det, missingFields,
      stats: { rows: data.length, customers: customers.length, needsCheck: needsCheck.length, held: held.length, skippedBlank,
        noPhone: customers.filter(c => !c.wa).length, noEmail: customers.filter(c => !c.email).length,
        noInforce: customers.filter(c => c.inforce === false).length }
    };
  }

  /* Merge a contacts sheet (Name + Phone/Email/Company/Preferred/Account manager) into customers, by name.
     Only fills or replaces contact fields; never touches birthdays. Returns a preview of what would change. */
  function planContactMerge(customers, rows) {
    const h = (() => { for (let r = 0; r < Math.min(rows.length, 40); r++) { const m = mapColumns(rows[r] || []); if (m.name != null && (m.phone != null || m.email != null || m.company != null || m.preferred != null || m.manager != null)) return { index: r, map: m }; } return null; })();
    if (!h) return { error: 'No "Name" column plus a Phone / Email / Company column found in the contacts file.' };
    const byKey = new Map(customers.map(c => [c.key, c]));
    const changes = [], unmatched = [];
    for (let r = h.index + 1; r < rows.length; r++) {
      const row = rows[r] || []; const nm = String(row[h.map.name] || '').trim(); if (!nm) continue;
      const c = byKey.get(nameKey(nm));
      if (!c) { if (['phone', 'email', 'company'].some(f => h.map[f] != null && String(row[h.map[f]] || '').trim())) unmatched.push(titleCase(nm)); continue; }
      const upd = {};
      if (h.map.phone != null && String(row[h.map.phone] || '').trim()) { const p = cleanPhone(row[h.map.phone]); if (p.raw !== c.phone) Object.assign(upd, { phone: p.raw, wa: p.wa, phoneIssue: p.issue }); }
      if (h.map.email != null && String(row[h.map.email] || '').trim()) { const e = cleanEmail(row[h.map.email]); if (e.email !== c.email || e.issue) Object.assign(upd, { email: e.email, emailIssue: e.issue }); }
      ['company', 'preferred', 'manager'].forEach(f => { if (h.map[f] != null) { const v = f === 'company' ? String(row[h.map[f]] || '').trim() : titleCase(row[h.map[f]]); if (v && v !== c[f]) upd[f] = v; } });
      if (Object.keys(upd).length) changes.push({ key: c.key, name: c.name, upd });
    }
    return { changes, unmatched };
  }
  function applyContactMerge(customers, plan) {
    const byKey = new Map(customers.map(c => [c.key, c]));
    plan.changes.forEach(ch => Object.assign(byKey.get(ch.key) || {}, ch.upd));
    return customers;
  }

  /* ---------------- Upcoming birthdays ---------------- */
  function nextBirthday(dob, from) {
    let y = from.y;
    const occ = yy => (dob.m === 2 && dob.d === 29 && !isLeap(yy)) ? { y: yy, m: 2, d: 28 } : { y: yy, m: dob.m, d: dob.d };
    let o = occ(y);
    if (utc(o.y, o.m, o.d) < utc(from.y, from.m, from.d)) o = occ(y + 1);
    return o;
  }
  /* Customers whose birthday falls within [from, from + days - 1]. remindDays = 3 by default. */
  function upcoming(customers, from, days, remindDays) {
    remindDays = remindDays == null ? 3 : remindDays;
    const out = [];
    customers.forEach(c => {
      if (!c.dob) return;
      const nb = nextBirthday(c.dob, from);
      const until = Math.round((utc(nb.y, nb.m, nb.d) - utc(from.y, from.m, from.d)) / 864e5);
      if (until >= days) return;
      const remindOn = addDays(nb, -remindDays);
      const urgency = until < remindDays ? 'late' : until === remindDays ? 'today' : 'soon';
      out.push({ c, date: nb, until, remindOn, urgency, turning: c.dob.y ? nb.y - c.dob.y : null, leapNote: c.dob.m === 2 && c.dob.d === 29 && nb.d === 28 });
    });
    return out.sort((a, b) => a.until - b.until || a.c.name.localeCompare(b.c.name));
  }

  /* ---------------- Messages ---------------- */
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const TEMPLATES = {
    en: [
      n => `Dear ${n},\n\nWishing you a very happy birthday! May the year ahead bring you good health, happiness and wonderful moments with your loved ones.\n\nThank you for your continued trust. Have a great celebration!`,
      n => `Happy birthday, ${n}! 🎂\n\nOn your special day, I hope you get to enjoy time with the people who matter most to you. Wishing you good health, joy and success in the year ahead.`,
      n => `Dear ${n},\n\nMany happy returns of the day! It is always a pleasure working with you, and I wish you a year full of good health, peace of mind and new achievements.\n\nEnjoy your birthday!`
    ],
    ms: [
      n => `Salam sejahtera ${n},\n\nSelamat Hari Jadi! Semoga tahun yang mendatang membawa kesihatan yang baik, kebahagiaan dan saat-saat indah bersama insan tersayang.\n\nTerima kasih atas kepercayaan anda yang berterusan. Selamat menyambut hari istimewa ini!`,
      n => `Selamat Hari Jadi, ${n}! 🎂\n\nPada hari istimewa ini, semoga anda dapat meluangkan masa bersama insan-insan yang paling bermakna. Semoga sentiasa sihat, gembira dan terus berjaya pada tahun yang mendatang.`,
      n => `Salam sejahtera ${n},\n\nSelamat menyambut ulang tahun kelahiran! Sungguh menyenangkan dapat berurusan dengan anda. Semoga tahun ini dipenuhi kesihatan yang baik, ketenangan dan pencapaian baharu.\n\nSelamat bergembira!`
    ],
    zh: [
      n => `亲爱的${n}：\n\n祝您生日快乐！愿新的一岁身体健康、幸福美满，与家人共度更多美好时光。\n\n感谢您一直以来的信任与支持，祝您度过一个愉快的生日！`,
      n => `${n}，生日快乐！🎂\n\n在这个特别的日子里，愿您与最重要的人共享欢乐时光。祝您新的一岁身体健康、心想事成、事事顺利。`,
      n => `亲爱的${n}：\n\n今天是您的生日，在此送上最诚挚的祝福！很荣幸能为您服务，愿您在新的一年里平安健康、万事如意，收获更多新的成就。\n\n祝您生日愉快！`
    ]
  };
  const SIGN = { en: 'Warm regards,', ms: 'Salam hormat,', zh: '祝好！' };
  const SUBJECT = { en: n => `Happy Birthday, ${n}!`, ms: n => `Selamat Hari Jadi, ${n}!`, zh: n => `${n}，生日快乐！` };
  const greetName = c => c.preferred || c.name;
  const senderOf = (c, s) => (s && s.useManager !== false && c.manager) ? c.manager : ((s && s.senderName) || '');
  function message(c, lang, settings, variant) {
    const v = variant == null ? hash(c.key) % 3 : ((variant % 3) + 3) % 3;
    const sender = senderOf(c, settings) || '[Your name]';
    const company = (settings && settings.company) || '';
    return TEMPLATES[lang][v](greetName(c)) + '\n\n' + SIGN[lang] + '\n' + sender + (company ? '\n' + company : '');
  }
  const subject = (c, lang) => SUBJECT[lang](greetName(c));
  const waLink = (c, text) => c.wa ? 'https://wa.me/' + c.wa + '?text=' + encodeURIComponent(text) : '';
  const mailLink = (c, lang, text) => c.email ? 'mailto:' + c.email + '?subject=' + encodeURIComponent(subject(c, lang)) + '&body=' + encodeURIComponent(text) : '';

  /* ---------------- Birthday card (SVG, 1080 x 1080) ---------------- */
  const THEMES = [
    { bg1: '#0E2A47', bg2: '#1D4A78', accent: '#D4AF5A', text: '#FFFFFF', soft: '#BFD2E8', name: 'Navy & gold' },
    { bg1: '#0F3B33', bg2: '#1C6152', accent: '#E0C27A', text: '#FFFFFF', soft: '#BFE0D6', name: 'Emerald & gold' },
    { bg1: '#4A1426', bg2: '#7A2540', accent: '#F0CF8A', text: '#FFFFFF', soft: '#F1CBD5', name: 'Burgundy & cream' }
  ];
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function splitName(n) {
    if (n.length <= 22) return [n];
    const words = n.split(' '); let best = [n], bestDiff = 1e9;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); const d = Math.max(a.length, b.length); if (d < bestDiff) { bestDiff = d; best = [a, b]; } }
    return best;
  }
  const CJK = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'Noto Sans SC', 'Heiti SC', sans-serif";
  const CARD_TEXT = {
    en: { title: 'Happy Birthday', wish: 'Wishing you health, happiness and success' },
    ms: { title: 'Selamat Hari Jadi', wish: 'Semoga sihat, bahagia dan terus berjaya' },
    zh: { title: '生日快乐', wish: '祝您身体健康、幸福快乐、万事如意' }
  };
  function cardSVG(c, settings, opts) {
    opts = opts || {};
    // Card languages: 'all' (English + Malay + Chinese), 'both' (English + Malay), 'en', 'ms', 'zh'
    const lang = opts.lang || (settings && settings.cardLang) || 'all';
    const langs = lang === 'all' ? ['en', 'ms', 'zh'] : lang === 'both' ? ['en', 'ms'] : [CARD_TEXT[lang] ? lang : 'en'];
    const t = THEMES[(opts.theme != null ? opts.theme : hash(c.key + 'card')) % THEMES.length];
    const nm = greetName(c); const lines = splitName(nm);
    const longest = Math.max(...lines.map(l => l.length));
    const fs = Math.max(44, Math.min(86, Math.floor(900 / (longest * 0.56))));
    const sender = senderOf(c, settings); const company = (settings && settings.company) || '';
    const from = [sender, company].filter(Boolean).join('  ·  ');
    const id = 'g' + (hash(c.key) % 100000);
    const three = langs.length === 3;
    // Vertical layout (px on a 1080 canvas)
    const L = three ? { cake: 206, title: 388, subs: [446, 510], line: 552, name: 652, wish0: 78, wishStep: 46 }
      : langs.length === 2 ? { cake: 236, title: 420, subs: [486], line: 530, name: 640, wish0: 92, wishStep: 50 }
      : { cake: 236, title: 440, subs: [], line: 500, name: 640, wish0: 92, wishStep: 50 };
    const nameY0 = L.name - (lines.length - 1) * fs * 0.55;
    const nameEnd = nameY0 + (lines.length - 1) * fs * 1.1;
    const titleFont = langs[0] === 'zh' ? `${CJK}" font-weight="bold` : `Georgia, 'Times New Roman', serif" font-style="italic`;
    const titleHTML = `<text x="540" y="${L.title}" text-anchor="middle" font-family="${titleFont}" font-size="${langs[0] === 'zh' ? 110 : langs[0] === 'ms' ? 92 : 104}" fill="${t.text}">${esc(CARD_TEXT[langs[0]].title)}</text>`;
    const subHTML = langs.slice(1).map((lg, i) => lg === 'zh'
      ? `<text x="540" y="${L.subs[i]}" text-anchor="middle" font-family="${CJK}" font-size="50" letter-spacing="10" fill="${t.text}">${esc(CARD_TEXT.zh.title)}</text>`
      : `<text x="540" y="${L.subs[i]}" text-anchor="middle" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="${three ? 34 : 38}" letter-spacing="6" fill="${t.accent}">${esc(CARD_TEXT[lg].title.toUpperCase())}</text>`).join('\n');
    const wishHTML = langs.map((lg, i) => `<text x="540" y="${(nameEnd + L.wish0 + i * L.wishStep).toFixed(0)}" text-anchor="middle" font-family="${lg === 'zh' ? CJK : "'Segoe UI', Roboto, Arial, sans-serif"}" font-size="${i === 0 ? (three ? 32 : 34) : (lg === 'zh' ? 30 : 29)}"${lg === 'ms' && i > 0 ? ' font-style="italic"' : ''} fill="${t.soft}"${i > 0 ? ' opacity="0.92"' : ''}>${esc(CARD_TEXT[lg].wish)}</text>`).join('\n');
    // decorative confetti dots, deterministic per customer
    let dots = ''; let seed = hash(c.key + 'dots');
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 34; i++) {
      const x = rnd() * 1080, y = rnd() * 1080; if (x > 120 && x < 960 && y > 220 && y < 900) continue;
      const r = 3 + rnd() * 9; const op = (0.25 + rnd() * 0.5).toFixed(2);
      dots += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${i % 3 ? t.accent : t.soft}" opacity="${op}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="${opts.width || 1080}" height="${opts.width || 1080}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg1}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>
<rect width="1080" height="1080" fill="url(#${id})"/>
${dots}
<rect x="54" y="54" width="972" height="972" rx="28" fill="none" stroke="${t.accent}" stroke-width="3" opacity="0.85"/>
<rect x="72" y="72" width="936" height="936" rx="20" fill="none" stroke="${t.accent}" stroke-width="1" opacity="0.45"/>
<g transform="translate(540 ${L.cake})" fill="${t.accent}">
  <rect x="-70" y="-6" width="140" height="78" rx="10" opacity="0.95"/>
  <rect x="-86" y="66" width="172" height="16" rx="8"/>
  <rect x="-70" y="22" width="140" height="8" fill="${t.bg1}" opacity="0.35"/>
  <rect x="-44" y="-40" width="8" height="34" rx="3"/><rect x="-4" y="-40" width="8" height="34" rx="3"/><rect x="36" y="-40" width="8" height="34" rx="3"/>
  <path d="M-40 -48c-8-10 0-20 0-26c6 8 10 16 0 26z M0 -48c-8-10 0-20 0-26c6 8 10 16 0 26z M40 -48c-8-10 0-20 0-26c6 8 10 16 0 26z" fill="${t.soft}"/>
</g>
${titleHTML}
${subHTML}
<line x1="400" y1="${L.line}" x2="680" y2="${L.line}" stroke="${t.accent}" stroke-width="2"/>
${lines.map((l, i) => `<text x="540" y="${(nameY0 + i * fs * 1.1).toFixed(0)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="${fs}" fill="${t.text}">${esc(l)}</text>`).join('\n')}
${wishHTML}
${from ? `<text x="540" y="950" text-anchor="middle" font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="30" letter-spacing="1" fill="${t.accent}">${esc('With warm wishes from ' + from)}</text>` : ''}
</svg>`;
  }

  /* ---------------- Printable weekly list (HTML → PDF) ---------------- */
  function reportHTML(list, settings, meta) {
    meta = meta || {};
    const from = meta.from, to = addDays(meta.from, meta.days - 1);
    const badge = u => u.urgency === 'late' ? `<span class="b late">Send now · ${u.until === 0 ? 'birthday is today' : 'only ' + u.until + ' day' + (u.until > 1 ? 's' : '') + ' to go'}</span>` : u.urgency === 'today' ? '<span class="b today">Reminder day: 3 days to go</span>' : `<span class="b soon">Prepare from ${esc(fmtDate(u.remindOn, true))}</span>`;
    const blocks = list.map((u, i) => {
      const c = u.c; const en = message(c, 'en', settings, u.variant), ms = message(c, 'ms', settings, u.variant), zh = message(c, 'zh', settings, u.variant);
      const contact = [
        c.wa ? `WhatsApp: <a href="${esc(waLink(c, en))}">+${esc(c.wa)}</a>` : '<span class="miss">No phone on file</span>',
        c.email ? `Email: <a href="${esc(mailLink(c, 'en', en))}">${esc(c.email)}</a>` : '<span class="miss">No email on file</span>'
      ].join(' &nbsp;·&nbsp; ');
      const extra = [c.company && 'Company: ' + esc(c.company), c.agent && 'Issuing agent: ' + esc(c.agent), c.inforce === false && 'No in-force policy', c.phoneIssue && esc(c.phoneIssue), c.emailIssue && esc(c.emailIssue), u.leapNote && 'Born 29 Feb (celebrating 28 Feb this year)'].filter(Boolean).join(' · ');
      return `<section class="cust">
  <div class="head"><div><div class="nm">${esc(c.name)}</div><div class="dt">Birthday: <b>${esc(fmtDate(u.date, true))}</b>${u.turning ? ' · turning ' + u.turning : ''}</div></div>${badge(u)}</div>
  <div class="row"><div class="card">${meta.cardImg ? `<img src="${esc(meta.cardImg(c))}" alt="Birthday card">` : cardSVG(c, settings, { width: 230 })}</div>
  <div class="msgs"><div class="msg"><div class="lb">English</div><pre>${esc(en)}</pre></div><div class="msg"><div class="lb">Bahasa Melayu</div><pre>${esc(ms)}</pre></div><div class="msg"><div class="lb">中文</div><pre class="zh">${esc(zh)}</pre></div></div></div>
  <div class="ct">${contact}${extra ? '<br><span class="ex">' + extra + '</span>' : ''}</div>
</section>`;
    }).join('\n');
    const held = (meta.held || []);
    const heldHTML = held.length ? `<section class="note"><h3>Held back. Do not send without checking (${held.length})</h3><ul>${held.map(c => `<li><b>${esc(c.name)}</b>: birthday ${esc(fmtDM(c.dob))}. ${esc(c.blocked)}</li>`).join('')}</ul></section>` : '';
    const nc = meta.needsCheck || [];
    const ncHTML = nc.length ? `<section class="note"><h3>Needs checking: not in the list until fixed (${nc.length})</h3><ul>${nc.slice(0, 40).map(n => `<li><b>${esc(n.name)}</b> (row ${n.rowNo}): ${esc(n.problem)}</li>`).join('')}${nc.length > 40 ? `<li>…and ${nc.length - 40} more. Open the app for the full list.</li>` : ''}</ul></section>` : '';
    const missing = (meta.missingFields || []).length ? `<p class="warn">Your customer list is missing these columns: <b>${meta.missingFields.map(f => FIELDS[f].label).join(', ')}</b>. Add them to the Excel file, or fill in the contacts file, and WhatsApp and email links will appear.</p>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Birthday list ${esc(toISO(from))}</title>
<style>
@page{size:A4;margin:14mm 13mm}
*{box-sizing:border-box}body{font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#1d2733;margin:0;font-size:10.5pt}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0E2A47;padding-bottom:8px;margin-bottom:10px}
h1{font-family:Georgia,serif;font-size:22pt;margin:0;color:#0E2A47}.sub{color:#5a6878;font-size:10pt;margin-top:3px}
.sum{display:flex;gap:8px;margin:8px 0 12px}.sum div{flex:1;background:#f2f5f9;border-radius:8px;padding:7px 10px}.sum b{display:block;font-size:16pt;color:#0E2A47}.sum span{font-size:8.5pt;color:#5a6878}
.cust{border:1px solid #dde3ea;border-radius:10px;padding:10px 12px;margin-bottom:10px;break-inside:avoid}.pb{break-before:page}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}.nm{font-size:13.5pt;font-weight:700;color:#0E2A47}.dt{color:#3d4a59;font-size:9.5pt}
.b{font-size:8.5pt;font-weight:600;border-radius:20px;padding:3px 10px;white-space:nowrap}.late{background:#fde2e1;color:#a4161a}.today{background:#fff1cc;color:#8a5a00}.soon{background:#e3f0e8;color:#1f6b3a}
.row{display:flex;gap:12px}.card{flex:0 0 60mm}.card svg,.card img{width:60mm;height:60mm;border-radius:6px;display:block}
.msgs{flex:1;display:flex;flex-direction:column;gap:6px}pre.zh{font-family:'Microsoft YaHei','PingFang SC','Noto Sans SC','Segoe UI',sans-serif}.msg{background:#f7f9fb;border-left:3px solid #D4AF5A;border-radius:4px;padding:5px 8px}
.lb{font-size:7.5pt;text-transform:uppercase;letter-spacing:.08em;color:#8a96a3;font-weight:700}
pre{white-space:pre-wrap;font-family:inherit;font-size:9pt;margin:2px 0 0;line-height:1.35}
.ct{margin-top:7px;font-size:9pt}.ct a{color:#1D4A78}.miss{color:#a4161a}.ex{color:#5a6878;font-size:8.5pt}
.note{border:1px solid #f0d9a8;background:#fffaf0;border-radius:10px;padding:8px 12px;margin-top:10px;break-inside:avoid}.note h3{margin:0 0 4px;font-size:10.5pt;color:#8a5a00}.note ul{margin:0;padding-left:18px;font-size:9pt}
.warn{background:#fff1cc;border-radius:8px;padding:6px 10px;font-size:9pt}.empty{padding:30px;text-align:center;color:#5a6878;border:1px dashed #c9d2dc;border-radius:10px}
.foot{margin-top:12px;color:#8a96a3;font-size:8pt;border-top:1px solid #dde3ea;padding-top:5px}
</style></head><body>
<div class="top"><div><h1>Birthday list</h1><div class="sub">${esc(fmtDate(from, true))} to ${esc(fmtDate(to, true))}${settings && settings.company ? ' · ' + esc(settings.company) : ''}</div></div><div class="sub">Prepared ${esc(meta.generated || fmtDate(todayLocal()))}</div></div>
<div class="sum"><div><b>${list.length}</b><span>birthdays in this period</span></div><div><b>${list.filter(u => u.urgency !== 'soon').length}</b><span>to send now (3 days or less)</span></div><div><b>${list.filter(u => !u.c.wa).length}</b><span>with no phone number</span></div><div><b>${held.length + nc.length}</b><span>held back or need checking</span></div></div>
${missing}
${blocks || '<div class="empty">No customer birthdays in this period.</div>'}
${heldHTML}${ncHTML}
<div class="foot">Confidential: customer data. Copy each message and image into WhatsApp or email, and check the name before you send. Nothing is sent automatically. Generated by BirthdayBeat.</div>
</body></html>`;
  }

  return { FIELDS, mapColumns, findHeader, parseDate, detectDateOrder, buildCustomers, planContactMerge, applyContactMerge,
    nextBirthday, upcoming, message, subject, waLink, mailLink, cardSVG, reportHTML, titleCase, cleanPhone, cleanEmail, nameKey,
    fmtDate, fmtDM, addDays, toISO, fromISO, todayLocal, isLeap, THEMES, senderOf };
});
