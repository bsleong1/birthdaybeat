/* BirthdayBeat app: runs entirely in this browser. Customer data is saved only on this device (localStorage). */
(function () {
  'use strict';
  const KEY = 'birthdaybeat.v1';
  const CDN = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    ocr: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  };
  // Online (claude.ai) version: files are saved through the viewer's own "save" prompt.
  const HOSTED = !!(window.claude && window.claude.use);
  let dlP = null;
  const getDL = () => dlP || (dlP = HOSTED ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null));
  async function saveFile(filename, blob) {
    const dl = await getDL();
    if (dl) {
      try { await dl.save({ filename, data: blob }); toast('Saved ' + filename); }
      catch (e) { const code = e && e.code; if (code === 'declined') return; toast(code === 'rate_limited' ? 'A save is already waiting for your answer.' : 'Saving files is not available in this view.'); }
      return;
    }
    if (HOSTED) { toast('Saving files is not available in this view.'); return; }
    const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5000); toast('Saved ' + filename);
  }
  // In-page confirmation (browser confirm() dialogs are blocked in the online version).
  function ask(msg, okLabel) {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'modal';
      d.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><p>${esc(msg).replace(/\n/g, '<br>')}</p><div class="row"><button class="btn pri" data-ok>${esc(okLabel || 'Yes')}</button><button class="btn" data-no>Cancel</button></div></div>`;
      document.body.appendChild(d);
      d.addEventListener('click', e => { if (e.target.closest('[data-ok]')) { d.remove(); res(true); } else if (e.target.closest('[data-no]') || e.target === d) { d.remove(); res(false); } });
      d.querySelector('[data-ok]').focus();
    });
  }
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- State ---------- */
  const DEFAULT = { customers: [], needsCheck: [], missingFields: [], fileName: '', importedAt: '', sent: {}, variants: {}, released: {},
    settings: { senderName: '', company: '', useManager: true, cardLang: 'all', remindDays: 3, days: 10 } };
  let S = load();
  const ui = { tab: 'week', from: BB.toISO(BB.todayLocal()), lang: {}, pending: null, contactPlan: null, scan: null, edit: null, search: '', fixing: null };
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.customers) { s.settings = Object.assign({}, DEFAULT.settings, s.settings); return Object.assign({}, DEFAULT, s); } } catch (e) { }
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save on this device: ' + e.message); } }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2600); }

  const isBlocked = c => c.blocked && !S.released[c.key];
  const variantOf = c => S.variants[c.key];
  const msgOf = (c, lang) => BB.message(c, lang, S.settings, variantOf(c));
  const cardURL = c => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(BB.cardSVG(c, S.settings));
  function cardPNG(c) {
    return new Promise((ok, bad) => {
      const im = new Image(); im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 1080; cv.getContext('2d').drawImage(im, 0, 0, 1080, 1080); cv.toBlob(b => b ? ok(b) : bad(new Error('image')), 'image/png'); };
      im.onerror = () => bad(new Error('Could not draw the card')); im.src = cardURL(c);
    });
  }
  const fileName = c => 'Birthday-' + c.name.replace(/[^A-Za-z0-9]+/g, '-') + '.png';

  /* ---------- Rendering ---------- */
  function render() {
    const nCheck = S.needsCheck.length + S.customers.filter(isBlocked).length;
    const tabs = [['week', 'Upcoming'], ['check', 'Needs checking' + (nCheck ? `<span class="n">${nCheck}</span>` : '')], ['all', 'All customers'], ['data', 'Customer list'], ['settings', 'Settings']];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('');
    let h = '';
    if (ui.pending) h = viewPending();
    else if (ui.scan) h = viewScan();
    else if (ui.contactPlan) h = viewContactPlan();
    else if (!S.customers.length && ui.tab !== 'settings') h = viewData();
    else h = ({ week: viewWeek, check: viewCheck, all: viewAll, data: viewData, settings: viewSettings })[ui.tab]();
    $('#app').innerHTML = h;
    if (!ui.pending && !ui.scan && !ui.contactPlan && ui.tab === 'week' && S.customers.length) {
      document.querySelectorAll('textarea[data-msg]').forEach(t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 4) + 'px'; });
    }
  }

  function badge(u, c) {
    if (S.sent[c.key] && S.sent[c.key].year === u.date.y) return `<span class="badge b-sent">✓ Sent ${esc(S.sent[c.key].on)}</span>`;
    if (u.urgency === 'late') return `<span class="badge b-late">Send now · ${u.until === 0 ? 'birthday is today' : u.until + ' day' + (u.until > 1 ? 's' : '') + ' to go'}</span>`;
    if (u.urgency === 'today') return '<span class="badge b-today">Reminder day · 3 days to go</span>';
    return `<span class="badge b-soon">Prepare from ${esc(BB.fmtDate(u.remindOn, true))}</span>`;
  }

  function viewWeek() {
    const from = BB.fromISO(ui.from) || BB.todayLocal(); const days = +S.settings.days || 10;
    const list = BB.upcoming(S.customers.filter(c => !isBlocked(c)), from, days, +S.settings.remindDays);
    const heldNow = BB.upcoming(S.customers.filter(isBlocked), from, days, +S.settings.remindDays);
    const toSend = list.filter(u => u.urgency !== 'soon' && !(S.sent[u.c.key] && S.sent[u.c.key].year === u.date.y)).length;
    let h = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>Upcoming birthdays</h2>
      <div class="row"><label class="small mute">From <input type="date" data-set="from" value="${esc(ui.from)}" style="padding:6px;border:1px solid var(--line);border-radius:8px"></label>
      <select data-setting="days" style="padding:7px;border:1px solid var(--line);border-radius:8px">${[7, 10, 14, 30, 60].map(d => `<option value="${d}" ${+S.settings.days === d ? 'selected' : ''}>${d} days</option>`).join('')}</select>
      <button class="btn pri" data-act="pdf">⬇ Download PDF list</button></div></div>
    <div class="stats"><div><b>${list.length}</b><span>birthdays, ${esc(BB.fmtDate(from))} to ${esc(BB.fmtDate(BB.addDays(from, days - 1)))}</span></div><div><b>${toSend}</b><span>to send now (≤ ${S.settings.remindDays} days, not yet sent)</span></div><div><b>${list.filter(u => !u.c.wa).length}</b><span>with no phone number</span></div><div><b>${S.needsCheck.length + S.customers.filter(isBlocked).length}</b><span>held back / need checking</span></div></div>`;
    if (S.sample) h += `<div class="warn"><b>These are example customers, not real ones.</b> They show how BirthdayBeat works. Load your own customer list on the <a href="#" data-tab="data">Customer list</a> tab and it replaces them.</div>`;
    if (!S.settings.senderName && list.some(u => !(S.settings.useManager && u.c.manager))) h += `<div class="warn">Messages are signed "[Your name]". Add your name in <a href="#" data-tab="settings">Settings</a>.</div>`;
    if (S.missingFields.includes('phone') || S.missingFields.includes('email')) h += `<div class="warn"><b>Your list has no phone or email column.</b> You can still copy each message and card. To get one-tap WhatsApp and email buttons, add the numbers: tap <b>Edit contact</b> on a customer, or fill in the contacts template on the <a href="#" data-tab="data">Customer list</a> tab.</div>`;
    if (heldNow.length) h += `<div class="bad"><b>${heldNow.length} birthday(s) in this period are held back and must not be sent without checking:</b> ${heldNow.map(u => esc(u.c.name) + ' (' + esc(BB.fmtDM(u.date)) + ')').join(', ')}. See <a href="#" data-tab="check">Needs checking</a>.</div>`;
    if (!list.length) h += '<div class="panel empty">No customer birthdays in this period. 🎉</div>';
    list.forEach(u => {
      const c = u.c; const lang = ui.lang[c.key] || 'en'; const text = msgOf(c, lang);
      const info = [c.company && esc(c.company), c.agent && 'Issuing agent: ' + esc(c.agent), c.inforce === false && 'No in-force policy', u.leapNote && 'Born 29 Feb: celebrating 28 Feb', ...(c.notes || []).map(esc)].filter(Boolean).join(' · ');
      h += `<div class="panel"><div class="cust">
        <div><img class="cardimg" src="${cardURL(c)}" alt="Birthday card for ${esc(c.name)}"></div>
        <div>
          <div class="row" style="justify-content:space-between"><div><div class="nm">${esc(c.name)}</div>
          <div class="mute small">Birthday <b>${esc(BB.fmtDate(u.date, true))}</b>${u.turning ? ' · turning ' + u.turning : ''}</div></div>${badge(u, c)}</div>
          <div class="contact">${c.wa ? '📱 +' + esc(c.wa) : '<span class="miss">📱 No phone</span>'} &nbsp; ${c.email ? '✉️ ' + esc(c.email) : '<span class="miss">✉️ No email</span>'}${c.phoneIssue ? '<br><span class="miss small">' + esc(c.phoneIssue) + '</span>' : ''}${c.emailIssue ? '<br><span class="miss small">' + esc(c.emailIssue) + '</span>' : ''}${info ? '<br><span class="mute small">' + info + '</span>' : ''}</div>
          <div class="row" style="margin-bottom:6px"><div class="seg"><button data-lang="en" data-key="${esc(c.key)}" class="${lang === 'en' ? 'on' : ''}">English</button><button data-lang="ms" data-key="${esc(c.key)}" class="${lang === 'ms' ? 'on' : ''}">Bahasa Melayu</button><button data-lang="zh" data-key="${esc(c.key)}" class="${lang === 'zh' ? 'on' : ''}">中文</button></div>
          <button class="btn" data-act="variant" data-key="${esc(c.key)}" title="Try different wording">↻ Other wording</button></div>
          <textarea data-msg="${esc(c.key)}" aria-label="Message">${esc(text)}</textarea>
          <div class="row" style="margin-top:8px">
            <button class="btn pri" data-act="copy" data-key="${esc(c.key)}">📋 Copy message</button>
            <button class="btn" data-act="copyimg" data-key="${esc(c.key)}">🖼 Copy image</button>
            <button class="btn" data-act="dlimg" data-key="${esc(c.key)}">⬇ Save image</button>
            <a class="btn wa ${c.wa ? '' : 'dis'}" data-act="wa" data-key="${esc(c.key)}" href="${c.wa ? esc(BB.waLink(c, text)) : '#'}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="btn ${c.email ? '' : 'dis'}" data-act="mail" data-key="${esc(c.key)}" href="${c.email ? esc(BB.mailLink(c, lang, text)) : '#'}" target="_blank" rel="noopener">Email</a>
            <button class="btn" data-act="edit" data-key="${esc(c.key)}">✏️ Edit contact</button>
            <label class="btn"><input type="checkbox" data-sent="${esc(c.key)}" data-year="${u.date.y}" ${S.sent[c.key] && S.sent[c.key].year === u.date.y ? 'checked' : ''}> Mark as sent</label>
          </div>
          ${ui.edit === c.key ? viewEdit(c) : ''}
        </div></div></div>`;
    });
    return h;
  }

  function viewEdit(c) {
    return `<div class="panel" style="margin-top:10px;background:var(--sunk)"><h3>Edit contact: ${esc(c.name)}</h3><div class="grid2">
      <label class="f">Greet as (preferred name)<input data-ef="preferred" value="${esc(c.preferred)}" placeholder="${esc(c.name)}"></label>
      <label class="f">Mobile number<input data-ef="phone" value="${esc(c.phone)}" placeholder="e.g. 012-345 6789" inputmode="tel"></label>
      <label class="f">Email<input data-ef="email" value="${esc(c.email)}" placeholder="name@example.com" inputmode="email"></label>
      <label class="f">Company<input data-ef="company" value="${esc(c.company)}"></label></div>
      <div class="row"><button class="btn pri" data-act="saveedit" data-key="${esc(c.key)}">Save</button><button class="btn" data-act="canceledit">Cancel</button>
      <span class="small mute">Birthday is not changed here. Fix it in your Excel file and import again.</span></div></div>`;
  }

  function viewCheck() {
    const held = S.customers.filter(c => c.blocked);
    let h = `<h2>Needs checking</h2><p class="mute">These customers are <b>not</b> in the upcoming list, so nobody gets a wrong or insensitive message. Fix them here or in your Excel file.</p>`;
    h += `<div class="panel"><h3>Held back: sensitive (${held.length})</h3>`;
    h += held.length ? `<table class="resp"><thead><tr><th>Customer</th><th>Birthday</th><th>Reason</th><th></th></tr></thead><tbody>${held.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(BB.fmtDM(c.dob))}</td><td>${esc(c.blocked)}</td><td>${S.released[c.key] ? `<span class="badge b-soon">Released by you</span> <button class="btn" data-act="reblock" data-key="${esc(c.key)}">Hold again</button>` : `<button class="btn" data-act="release" data-key="${esc(c.key)}">I've checked: include</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">None.</p>';
    h += `</div><div class="panel"><h3>Birthday missing or unclear (${S.needsCheck.length})</h3>`;
    h += S.needsCheck.length ? `<table class="resp"><thead><tr><th>Customer</th><th>Row</th><th>Problem</th><th>Fix</th></tr></thead><tbody>${S.needsCheck.map((n, i) => `<tr><td><b>${esc(n.name)}</b></td><td>${esc(n.rowNo)}</td><td>${esc(n.problem)}</td><td>${n.name === '(no name)' ? '<span class="small mute">Fix in Excel</span>' : ui.fixing === i ? `<input data-fix value="" placeholder="dd/mm/yyyy" style="width:120px;padding:6px;border:1px solid var(--line);border-radius:6px"> <button class="btn pri" data-act="fixsave" data-i="${i}">Save</button>` : `<button class="btn" data-act="fix" data-i="${i}">Enter birthday</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">None. Every birthday in the list was read cleanly.</p>';
    return h + '</div>';
  }

  function viewAll() {
    const q = ui.search.trim().toUpperCase();
    const list = S.customers.filter(c => !q || c.key.includes(q) || (c.company || '').toUpperCase().includes(q)).sort((a, b) => a.dob.m - b.dob.m || a.dob.d - b.dob.d);
    return `<h2>All customers (${S.customers.length})</h2><div class="panel"><input data-set="search" value="${esc(ui.search)}" placeholder="Search name or company…" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px">
      <table class="resp"><thead><tr><th>Name</th><th>Birthday</th><th>Phone</th><th>Email</th><th>Company</th></tr></thead><tbody>
      ${list.slice(0, 400).map(c => `<tr class="${isBlocked(c) ? 'held' : ''}"><td><b>${esc(c.name)}</b>${isBlocked(c) ? ' <span class="badge b-held">held</span>' : ''}${c.inforce === false ? ' <span class="small mute">(no in-force policy)</span>' : ''}</td><td>${esc(BB.fmtDM(c.dob))}</td><td>${c.wa ? '+' + esc(c.wa) : '<span class="mute">–</span>'}</td><td>${esc(c.email) || '<span class="mute">–</span>'}</td><td>${esc(c.company) || '<span class="mute">–</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function viewData() {
    const has = S.customers.length;
    return `<h2>${has ? 'Customer list' : 'Welcome to BirthdayBeat'}</h2>
    ${S.sample ? '<div class="warn">You are looking at <b>example customers</b>. Load your own list below to replace them.</div>' : has ? `<div class="ok">Loaded <b>${esc(S.fileName)}</b> on ${esc(S.importedAt)}: <b>${S.customers.length}</b> customers, ${S.needsCheck.length} need checking.</div>` : '<p>Load your customer list once. BirthdayBeat then shows whose birthday is coming up and drafts the message and card for you.</p>'}
    <div class="panel"><h3>${has ? 'Load an updated list (replaces the current one)' : '1. Load your customer list'}</h3>
      <div class="drop"><p><b>Excel (.xlsx) or CSV</b> is best. PDF and photos (PNG/JPG) also work, but you'll check every line they produce.</p>
      <label class="btn pri">Choose file<input type="file" data-file="main" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" hidden></label>
      <p class="small mute">Columns used: Customer Name, Birthday (or DOB), Phone, Email, Company, Account Manager. The names don't need to match exactly. Nothing is uploaded: the file stays on this device.</p></div></div>
    ${has ? `<div class="panel"><h3>2. Add phone numbers and emails</h3>
      <p class="small">Your list ${S.missingFields.length ? 'has no <b>' + S.missingFields.map(f => BB.FIELDS[f].label).join(', ') + '</b> column' : 'already has contact columns'}. Download the template (your customer names are already filled in), add numbers and emails in Excel, then load it here. Only contact details change; birthdays are never touched.</p>
      <div class="row"><button class="btn" data-act="template">⬇ Download contacts template</button><label class="btn pri">Load contacts file<input type="file" data-file="contacts" accept=".xlsx,.xls,.csv" hidden></label></div></div>
      <div class="panel"><h3>Remove all data from this device</h3><button class="btn danger" data-act="clear">Delete all customer data</button></div>` : ''}`;
  }

  function viewSettings() {
    const s = S.settings;
    return `<h2>Settings</h2><div class="panel"><div class="grid2">
      <label class="f">Your name (signs the messages and card)<input data-setting="senderName" value="${esc(s.senderName)}" placeholder="e.g. Aminah Rahman"></label>
      <label class="f">Company name (optional, shown under your name)<input data-setting="company" value="${esc(s.company)}" placeholder="e.g. your company"></label>
      <label class="f">Card language<select data-setting="cardLang"><option value="all" ${s.cardLang === 'all' ? 'selected' : ''}>English + Malay + Chinese</option><option value="both" ${s.cardLang === 'both' ? 'selected' : ''}>English + Malay</option><option value="en" ${s.cardLang === 'en' ? 'selected' : ''}>English only</option><option value="ms" ${s.cardLang === 'ms' ? 'selected' : ''}>Malay only</option><option value="zh" ${s.cardLang === 'zh' ? 'selected' : ''}>Chinese only</option></select></label>
      <label class="f">Remind this many days before<input type="number" min="0" max="14" data-setting="remindDays" value="${esc(s.remindDays)}"></label></div>
      <label class="small"><input type="checkbox" data-setting="useManager" ${s.useManager ? 'checked' : ''}> If the list has an Account Manager column, sign each message with that person's name</label></div>
      <div class="panel small mute">Customer data is stored only in this browser on this device. Clearing browser data removes it. Keep your Excel file as the master copy.</div>`;
  }

  function viewPending() {
    const p = ui.pending; const r = p.result;
    const opts = ['<option value="">— not in file —</option>'].concat(p.header.map((hd, i) => `<option value="${i}">${esc(hd || '(column ' + (i + 1) + ')')}</option>`)).join('');
    let h = `<h2>Check before importing</h2><div class="panel"><p><b>${esc(p.fileName)}</b>: header found on row ${p.headerIndex + 1}. Check that each item points to the right column.</p>
      <table><thead><tr><th>BirthdayBeat needs</th><th>Column in your file</th></tr></thead><tbody>
      ${['name', 'birthday', 'phone', 'email', 'company', 'manager', 'preferred', 'agent', 'status', 'lifeAssured'].map(f => `<tr><td>${esc(BB.FIELDS[f].label)}${f === 'name' || f === 'birthday' ? ' <b>*</b>' : ''}</td><td><select data-map="${f}">${opts.replace(`value="${p.map[f]}"`, `value="${p.map[f]}" selected`)}</select></td></tr>`).join('')}
      </tbody></table></div>`;
    if (r.error) return h + `<div class="bad">${esc(r.error)}</div><div class="row"><button class="btn" data-act="cancelpending">Cancel</button></div>`;
    if (r.dateDetect.order) h += `<div class="ok">Dates read as <b>${r.dateDetect.order === 'DMY' ? 'day/month/year' : 'month/day/year'}</b> (found ${r.dateDetect.evidence} date(s) that can only be read that way).</div>`;
    else if (r.dateDetect.ambiguous) h += `<div class="warn"><b>${r.dateDetect.ambiguous} birthday(s) could be read two ways</b> (for example 03/04 could be 3 April or 4 March). How are dates written in this file?
      <div class="row" style="margin-top:6px"><button class="btn ${p.dateOrder === 'DMY' ? 'pri' : ''}" data-order="DMY">Day/Month (e.g. 25/03/1985)</button><button class="btn ${p.dateOrder === 'MDY' ? 'pri' : ''}" data-order="MDY">Month/Day (e.g. 03/25/1985)</button></div>
      ${p.dateOrder ? '' : '<p class="small">Until you choose, these customers go to "Needs checking".</p>'}</div>`;
    const st = r.stats;
    h += `<div class="stats"><div><b>${st.customers}</b><span>customers (from ${st.rows} rows; duplicates merged)</span></div><div><b>${st.needsCheck}</b><span>need checking (missing or unclear birthday)</span></div><div><b>${st.held}</b><span>held back (sensitive)</span></div><div><b>${st.noPhone}</b><span>with no phone number</span></div></div>`;
    if (r.missingFields.length) h += `<div class="warn">No <b>${r.missingFields.map(f => BB.FIELDS[f].label).join(', ')}</b> column found. You can still copy each message and card. Add contact details later from the Customer list tab.</div>`;
    if (st.held) h += `<div class="bad"><b>${st.held} customer(s) held back</b> because a policy shows "Terminated (Death)". They won't appear in the reminders unless you release them on the Needs checking tab.</div>`;
    h += `<div class="panel"><h3>First 6 customers as read</h3><table class="resp"><thead><tr><th>Name</th><th>Birthday</th><th>Phone</th><th>Email</th></tr></thead><tbody>${r.customers.slice(0, 6).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(BB.fmtDate(c.dob))}</td><td>${c.wa ? '+' + esc(c.wa) : '–'}</td><td>${esc(c.email) || '–'}</td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button class="btn pri" data-act="confirmimport">${S.customers.length ? 'Replace current list (' + S.customers.length + ') with these ' + st.customers : 'Import ' + st.customers + ' customers'}</button><button class="btn" data-act="cancelpending">Cancel</button></div>`;
    return h;
  }

  function viewScan() {
    const s = ui.scan;
    return `<h2>Read from ${esc(s.fileName)}</h2><div class="warn"><b>Text read from a PDF or image can contain mistakes.</b> Check every line against the document before you continue. Use one customer per line in this format:<br><code>Name | Birthday (dd/mm/yyyy) | Phone | Email | Company | Account manager</code></div>
      <div class="panel">${s.busy ? `<p>${esc(s.status)}</p>` : `<textarea class="scan" data-scan>${esc(s.text)}</textarea><p class="small mute">${esc(s.status)}</p>`}
      <div class="row"><button class="btn pri" data-act="scannext" ${s.busy ? 'disabled' : ''}>I've checked these lines: continue</button><button class="btn" data-act="cancelscan">Cancel</button></div></div>`;
  }

  function viewContactPlan() {
    const p = ui.contactPlan;
    if (p.error) return `<h2>Contacts file</h2><div class="bad">${esc(p.error)}</div><button class="btn" data-act="cancelcontacts">Back</button>`;
    return `<h2>Check contact updates</h2><div class="panel"><p><b>${p.changes.length}</b> customers will get new or changed contact details. ${p.unmatched.length ? `<b>${p.unmatched.length}</b> names in the file didn't match any customer and will be ignored: ${p.unmatched.slice(0, 10).map(esc).join(', ')}${p.unmatched.length > 10 ? '…' : ''}` : ''}</p>
      <table class="resp"><thead><tr><th>Customer</th><th>Changes</th></tr></thead><tbody>${p.changes.slice(0, 50).map(ch => `<tr><td>${esc(ch.name)}</td><td>${Object.entries(ch.upd).filter(([k]) => ['phone', 'email', 'company', 'preferred', 'manager'].includes(k)).map(([k, v]) => esc(k) + ': <b>' + esc(v || '(invalid, see note)') + '</b>').join(' · ')}${ch.upd.phoneIssue ? ' <span class="small" style="color:var(--red)">' + esc(ch.upd.phoneIssue) + '</span>' : ''}${ch.upd.emailIssue ? ' <span class="small" style="color:var(--red)">' + esc(ch.upd.emailIssue) + '</span>' : ''}</td></tr>`).join('')}</tbody></table>${p.changes.length > 50 ? `<p class="small mute">…and ${p.changes.length - 50} more</p>` : ''}</div>
      <div class="row"><button class="btn pri" data-act="applycontacts" ${p.changes.length ? '' : 'disabled'}>Apply ${p.changes.length} updates</button><button class="btn" data-act="cancelcontacts">Cancel</button></div>`;
  }

  /* ---------- File reading ---------- */
  async function sheetRows(file) {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: false });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  }
  function startPending(rows, fileName, source) {
    const h = BB.findHeader(rows);
    if (!h) { toast('No "Name" and "Birthday" columns found. Rename the headings and try again.'); return; }
    ui.pending = { rows, fileName, source, headerIndex: h.index, header: rows[h.index].map(String), map: h.map, dateOrder: null };
    recompute(); render();
  }
  function recompute() {
    const p = ui.pending;
    p.result = BB.buildCustomers(p.rows, { headerIndex: p.headerIndex, map: p.map, dateOrder: p.dateOrder, source: p.source });
  }
  function loadScript(src) { return new Promise((ok, bad) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load the reader. Check your internet connection.')); document.head.appendChild(s); }); }
  async function readScan(file) {
    ui.scan = { fileName: file.name, busy: true, status: 'Reading…', text: '' }; render();
    const st = t => { ui.scan.status = t; render(); };
    try {
      let text = '';
      if (/pdf$/i.test(file.name)) {
        st('Loading PDF reader…'); await loadScript(CDN.pdf);
        const lib = window.pdfjsLib;
        if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
        const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        for (let n = 1; n <= pdf.numPages; n++) {
          const tc = await (await pdf.getPage(n)).getTextContent(); const lines = {};
          tc.items.forEach(it => { const y = Math.round(it.transform[5] / 3); (lines[y] = lines[y] || []).push(it); });
          Object.keys(lines).map(Number).sort((a, b) => b - a).forEach(y => { text += lines[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() + '\n'; });
        }
        if (text.replace(/\s/g, '').length < 30) {
          const imgs = [];
          for (let n = 1; n <= Math.min(pdf.numPages, 5); n++) { const pg = await pdf.getPage(n), vp = pg.getViewport({ scale: 2.5 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; imgs.push(cv); }
          text = await ocr(imgs, st);
        }
      } else {
        if (HOSTED) throw new Error('Photos can only be read in the desktop version of BirthdayBeat. Online, please use an Excel or CSV file.');
        text = await ocr([file], st);
      }
      ui.scan.text = linesToTable(text); ui.scan.status = 'Done. Lines without a recognisable date were left out; add them by hand if needed.';
    } catch (e) { ui.scan.status = 'Could not read: ' + e.message; }
    ui.scan.busy = false; render();
  }
  async function ocr(images, st) {
    st('Loading text reader (first time can take a minute)…'); await loadScript(CDN.ocr);
    let out = '';
    for (let i = 0; i < images.length; i++) { st(`Reading page ${i + 1} of ${images.length}…`); const r = await window.Tesseract.recognize(images[i], 'eng'); out += r.data.text + '\n'; }
    return out;
  }
  function linesToTable(text) {
    const DATE = /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}[ -](?:jan|feb|mar|mac|apr|may|mei|jun|jul|aug|ogos|sep|oct|okt|nov|dec|dis)[a-z]*\.?[ -]\d{2,4})/i;
    return text.split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const d = l.match(DATE); if (!d) return null;
      const email = (l.match(/[^\s@|]+@[^\s@|]+\.[a-z]{2,}/i) || [''])[0];
      const phone = (l.replace(d[0], '').match(/(\+?6?0?1\d[\d\s-]{7,10}\d)/) || [''])[0].trim();
      const name = l.slice(0, d.index).replace(/^\s*\d+[.)]?\s+/, '').replace(/[|,;]+/g, ' ').trim();
      const rest = l.slice(d.index + d[0].length).replace(email, '').replace(phone, '').replace(/[|,;]+/g, ' ').replace(/\s+/g, ' ').trim();
      return [name, d[0], phone, email, rest, ''].join(' | ');
    }).filter(Boolean).join('\n');
  }

  /* ---------- Report ---------- */
  /* PDF list: each A4 page is drawn on a canvas (so English, Malay and Chinese all render), then packed with jsPDF. */
  const svgImg = c => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('Could not draw the card')); im.src = cardURL(c); });
  async function makePDF() {
    const from = BB.fromISO(ui.from) || BB.todayLocal(); const days = +S.settings.days || 10;
    const list = BB.upcoming(S.customers.filter(c => !isBlocked(c)), from, days, +S.settings.remindDays);
    const held = BB.upcoming(S.customers.filter(isBlocked), from, days).map(u => u.c);
    const nc = S.needsCheck;
    toast('Building the PDF…');
    await loadScript(CDN.jspdf);
    const W = 1240, H = 1754, M = 70, LIMIT = H - M - 40;
    const C = { navy: '#0E2A47', ink: '#1d2733', mute: '#5a6878', line: '#dde3ea', gold: '#D4AF5A', soft: '#f5f7fa', red: '#a4161a', redbg: '#fde2e1', amb: '#8a5a00', ambbg: '#fff1cc', grn: '#1f6b3a', grnbg: '#e3f0e8', note: '#fffaf0' };
    const SANS = "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', 'Noto Sans CJK SC', Roboto, Arial, sans-serif";
    const pages = []; let ctx, y;
    const font = (px, w) => { ctx.font = `${w || 400} ${px}px ${SANS}`; };
    const rr = (x, yy, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, yy, w, h, r); else ctx.rect(x, yy, w, h); };
    function newPage() {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); pages.push(cv); y = M;
      font(15); ctx.fillStyle = C.mute; ctx.fillText('Confidential: customer data. Check the name before you send. Nothing is sent automatically. BirthdayBeat', M, H - 40);
      ctx.textAlign = 'right'; ctx.fillText('Page ' + pages.length, W - M, H - 40); ctx.textAlign = 'left';
    }
    const CJKCH = '⺀-鿿豈-﫿＀-￯　-〿';
    const TOK = new RegExp(`[${CJKCH}]|[^\\s${CJKCH}]+|\\s+`, 'g');
    function wrap(text, maxW) {
      const out = [];
      String(text).split('\n').forEach(par => {
        if (!par) { out.push(''); return; }
        let line = '';
        (par.match(TOK) || []).forEach(tk => { const test = line + tk; if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trimEnd()); line = tk.trimStart(); } else line = test; });
        out.push(line.trimEnd());
      });
      return out;
    }
    newPage();
    ctx.fillStyle = C.navy; ctx.font = '700 46px Georgia, serif'; ctx.fillText('Birthday list', M, y + 40);
    font(20); ctx.fillStyle = C.mute;
    ctx.fillText(`${BB.fmtDate(from, true)} to ${BB.fmtDate(BB.addDays(from, days - 1), true)}${S.settings.company ? ' · ' + S.settings.company : ''}`, M, y + 76);
    ctx.textAlign = 'right'; ctx.fillText('Prepared ' + BB.fmtDate(BB.todayLocal()), W - M, y + 76); ctx.textAlign = 'left';
    ctx.fillStyle = C.navy; ctx.fillRect(M, y + 94, W - 2 * M, 4); y += 122;
    const stats = [[list.length, 'birthdays in this period'], [list.filter(u => u.urgency !== 'soon').length, 'to send now (3 days or less)'], [list.filter(u => !u.c.wa).length, 'with no phone number'], [held.length + nc.length, 'held back or need checking']];
    const sw = (W - 2 * M - 30) / 4;
    stats.forEach((s, i) => { const x = M + i * (sw + 10); ctx.fillStyle = '#f2f5f9'; rr(x, y, sw, 92, 12); ctx.fill(); ctx.fillStyle = C.navy; ctx.font = `700 34px ${SANS}`; ctx.fillText(String(s[0]), x + 18, y + 44); font(16); ctx.fillStyle = C.mute; ctx.fillText(s[1], x + 18, y + 74); });
    y += 120;
    const cardS = 330, colX = M + 20 + cardS + 24, colW = W - M - 20 - colX;
    for (const u of list) {
      const c = u.c; const img = await svgImg(c);
      font(19);
      const msgs = [['ENGLISH', 'en'], ['BAHASA MELAYU', 'ms'], ['中文', 'zh']].map(([lb, lg]) => ({ lb, lines: wrap(BB.message(c, lg, S.settings, variantOf(c)), colW - 32) }));
      const mhs = msgs.map(m => 40 + m.lines.length * 26 + 6);
      const msgH = mhs.reduce((a, b) => a + b, 0) + 20;
      const h = 92 + Math.max(cardS, msgH) + 56;
      if (y + h > LIMIT && y > M + 10) newPage();
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; rr(M, y, W - 2 * M, h, 14); ctx.stroke();
      ctx.fillStyle = C.navy; ctx.font = `700 28px ${SANS}`; ctx.fillText(c.name, M + 20, y + 42);
      font(18); ctx.fillStyle = C.ink; ctx.fillText(`Birthday: ${BB.fmtDate(u.date, true)}${u.turning ? ' · turning ' + u.turning : ''}`, M + 20, y + 70);
      const [bt, bf, bb] = u.urgency === 'late' ? [`Send now · ${u.until === 0 ? 'birthday is today' : 'only ' + u.until + ' day' + (u.until > 1 ? 's' : '') + ' to go'}`, C.red, C.redbg]
        : u.urgency === 'today' ? ['Reminder day: 3 days to go', C.amb, C.ambbg] : ['Prepare from ' + BB.fmtDate(u.remindOn, true), C.grn, C.grnbg];
      ctx.font = `600 17px ${SANS}`; const bw = ctx.measureText(bt).width + 30;
      ctx.fillStyle = bb; rr(W - M - 20 - bw, y + 18, bw, 34, 17); ctx.fill(); ctx.fillStyle = bf; ctx.fillText(bt, W - M - 20 - bw + 15, y + 41);
      const top = y + 92;
      ctx.save(); rr(M + 20, top, cardS, cardS, 10); ctx.clip(); ctx.drawImage(img, M + 20, top, cardS, cardS); ctx.restore();
      let my = top;
      msgs.forEach((m, i) => {
        ctx.fillStyle = C.soft; ctx.fillRect(colX, my, colW, mhs[i]); ctx.fillStyle = C.gold; ctx.fillRect(colX, my, 5, mhs[i]);
        ctx.font = `700 14px ${SANS}`; ctx.fillStyle = '#7a8796'; ctx.fillText(m.lb, colX + 18, my + 26);
        font(19); ctx.fillStyle = C.ink; m.lines.forEach((l, k) => ctx.fillText(l, colX + 18, my + 54 + k * 26));
        my += mhs[i] + 10;
      });
      font(17); ctx.fillStyle = (c.wa && c.email) ? C.ink : C.red;
      ctx.fillText([c.wa ? 'WhatsApp: +' + c.wa : 'No phone on file', c.email ? 'Email: ' + c.email : 'No email on file'].join('    ·    '), M + 20, top + Math.max(cardS, msgH) + 30);
      y += h + 18;
    }
    if (!list.length) { font(22); ctx.fillStyle = C.mute; ctx.fillText('No customer birthdays in this period.', M, y + 30); y += 70; }
    function notes(title, items) {
      if (!items.length) return;
      if (y + 120 > LIMIT) newPage();
      ctx.fillStyle = C.amb; ctx.font = `700 20px ${SANS}`; ctx.fillText(title, M, y + 26); y += 44;
      font(17); ctx.fillStyle = C.ink;
      items.forEach(t => wrap('• ' + t, W - 2 * M - 20).forEach(l => { if (y + 26 > LIMIT) { newPage(); font(17); ctx.fillStyle = C.ink; } ctx.fillText(l, M + 10, y + 18); y += 25; }));
      y += 20;
    }
    notes(`Held back. Do not send without checking (${held.length})`, held.map(c => `${c.name}: birthday ${BB.fmtDM(c.dob)}. ${c.blocked}`));
    notes(`Needs checking: not in the list until fixed (${nc.length})`, nc.slice(0, 40).map(n => `${n.name} (row ${n.rowNo}): ${n.problem}`).concat(nc.length > 40 ? [`…and ${nc.length - 40} more. See the Needs checking tab.`] : []));
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((p, i) => { if (i) pdf.addPage(); pdf.addImage(p.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
    await saveFile('Birthday-list-' + BB.toISO(from) + '.pdf', pdf.output('blob'));
  }

  /* ---------- Events ---------- */
  const findC = k => S.customers.find(c => c.key === k);
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab],[data-act],[data-lang],[data-order]'); if (!t) return;
    if (t.dataset.tab) { e.preventDefault(); ui.tab = t.dataset.tab; ui.edit = null; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.lang) { ui.lang[t.dataset.key] = t.dataset.lang; render(); return; }
    if (t.dataset.order) { ui.pending.dateOrder = t.dataset.order; recompute(); render(); return; }
    const a = t.dataset.act, c = t.dataset.key ? findC(t.dataset.key) : null;
    const textOf = () => { const ta = document.querySelector(`textarea[data-msg="${CSS.escape(c.key)}"]`); return ta ? ta.value : msgOf(c, ui.lang[c.key] || 'en'); };
    try {
      if (a === 'copy') { await copyText(textOf()); toast('Message copied. Paste it into WhatsApp or email.'); }
      else if (a === 'copyimg') {
        if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) throw new Error('This browser cannot copy images. Use "Save image" instead.');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardPNG(c) })]); toast('Card image copied. Paste it into WhatsApp Web or your email.');
      }
      else if (a === 'dlimg') { await saveFile(fileName(c), await cardPNG(c)); }
      else if (a === 'wa') { if (!c.wa) { e.preventDefault(); return; } t.href = BB.waLink(c, textOf()); toast('Opening WhatsApp with the message. Attach the card image before you send.'); }
      else if (a === 'mail') { if (!c.email) { e.preventDefault(); return; } t.href = BB.mailLink(c, ui.lang[c.key] || 'en', textOf()); toast('Opening your email app. If nothing opens, copy the message and address instead.'); }
      else if (a === 'variant') { S.variants[c.key] = ((S.variants[c.key] != null ? S.variants[c.key] : -1) + 1) % 3; save(); render(); }
      else if (a === 'edit') { ui.edit = c.key; render(); }
      else if (a === 'canceledit') { ui.edit = null; render(); }
      else if (a === 'saveedit') {
        const v = f => (document.querySelector(`[data-ef="${f}"]`) || {}).value || '';
        const ph = BB.cleanPhone(v('phone')); const em = BB.cleanEmail(v('email'));
        if (v('phone') && !ph.wa) { toast(ph.issue); return; } if (v('email') && !em.email) { toast(em.issue); return; }
        Object.assign(c, { preferred: v('preferred').trim(), phone: ph.raw, wa: ph.wa, phoneIssue: ph.issue, email: em.email, emailIssue: em.issue, company: v('company').trim() });
        ui.edit = null; save(); render(); toast('Contact saved on this device');
      }
      else if (a === 'pdf') await makePDF();
      else if (a === 'release') { if (await ask(`Include ${c.name} in birthday reminders?\n\nReason held: ${c.blocked}\n\nOnly continue if you have confirmed it is appropriate to send.`, 'Include')) { S.released[c.key] = true; save(); render(); } }
      else if (a === 'reblock') { delete S.released[c.key]; save(); render(); }
      else if (a === 'fix') { ui.fixing = +t.dataset.i; render(); }
      else if (a === 'fixsave') {
        const n = S.needsCheck[+t.dataset.i]; const raw = (document.querySelector('[data-fix]') || {}).value || '';
        const p = BB.parseDate(raw, 'DMY');
        if (p.status !== 'ok' || !p.y) { toast('Type the date as dd/mm/yyyy, e.g. 25/03/1985'); return; }
        if (!(await ask(`Set ${n.name}'s birthday to ${BB.fmtDate(p)}?`, 'Save birthday'))) return;
        S.customers.push({ key: n.key || BB.nameKey(n.name), name: n.name, preferred: '', dob: { y: p.y, m: p.m, d: p.d }, company: '', phone: '', wa: '', email: '', manager: '', agent: '', records: 1, rowNos: n.rowNos || [n.rowNo], inforce: null, source: 'manual', notes: ['Birthday entered by hand. Update your Excel file too.'] });
        S.needsCheck.splice(+t.dataset.i, 1); ui.fixing = null; save(); render(); toast('Saved. Remember to fix it in your Excel file too.');
      }
      else if (a === 'confirmimport') {
        const r = ui.pending.result;
        Object.assign(S, { customers: r.customers, needsCheck: r.needsCheck, missingFields: r.missingFields, fileName: ui.pending.fileName, importedAt: BB.fmtDate(BB.todayLocal()), sample: false, sent: {}, variants: {} });
        S.released = {}; ui.pending = null; ui.tab = 'week'; save(); render(); toast(r.customers.length + ' customers loaded');
      }
      else if (a === 'cancelpending') { ui.pending = null; render(); }
      else if (a === 'cancelscan') { ui.scan = null; render(); }
      else if (a === 'scannext') {
        const txt = (document.querySelector('[data-scan]') || {}).value || '';
        const rows = [['Customer Name', 'Birthday', 'Phone', 'Email', 'Company', 'Account Manager']].concat(txt.split('\n').filter(l => l.trim()).map(l => l.split('|').map(x => x.trim())));
        const fn = ui.scan.fileName; ui.scan = null; startPending(rows, fn + ' (checked by you)', 'scan');
      }
      else if (a === 'template') {
        const rows = [['Customer Name', 'Birthday', 'Preferred Name', 'Phone', 'Email', 'Company', 'Account Manager']].concat(S.customers.slice().sort((x, y) => x.name.localeCompare(y.name)).map(c => [c.name, BB.fmtDate(c.dob), c.preferred, c.phone, c.email, c.company, c.manager]));
        const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 24 }, { wch: 20 }];
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contacts'); await saveFile('BirthdayBeat Contacts.xlsx', new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        toast('Template downloaded. Fill in Phone and Email, then load it here.');
      }
      else if (a === 'applycontacts') { BB.applyContactMerge(S.customers, ui.contactPlan); const n = ui.contactPlan.changes.length; S.missingFields = S.missingFields.filter(f => !['phone', 'email'].includes(f) || !S.customers.some(c => f === 'phone' ? c.wa : c.email)); ui.contactPlan = null; save(); render(); toast(n + ' customers updated'); }
      else if (a === 'cancelcontacts') { ui.contactPlan = null; render(); }
      else if (a === 'clear') { if (await ask('Delete ALL customer data from this device? This cannot be undone. Your Excel file is not affected.', 'Delete all')) { S = JSON.parse(JSON.stringify(DEFAULT)); save(); render(); toast('All data removed from this device'); } }
    } catch (err) { if (err && err.name !== 'AbortError') toast(err.message || String(err)); }
  });

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  }

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.file) {
      const file = t.files && t.files[0]; if (!file) return;
      try {
        if (t.dataset.file === 'contacts') { ui.contactPlan = BB.planContactMerge(S.customers, await sheetRows(file)); render(); }
        else if (/\.(pdf|png|jpe?g)$/i.test(file.name)) readScan(file);
        else startPending(await sheetRows(file), file.name, 'excel');
      } catch (err) { toast('Could not read the file: ' + err.message); }
      t.value = ''; return;
    }
    if (t.dataset.map) { ui.pending.map[t.dataset.map] = t.value === '' ? undefined : +t.value; if (t.value === '') delete ui.pending.map[t.dataset.map]; recompute(); render(); return; }
    if (t.dataset.sent) { if (t.checked) S.sent[t.dataset.sent] = { year: +t.dataset.year, on: BB.fmtDate(BB.todayLocal()) }; else delete S.sent[t.dataset.sent]; save(); render(); return; }
    if (t.dataset.setting) { const k = t.dataset.setting; S.settings[k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' || k === 'days') ? +t.value : t.value; save(); if (k !== 'senderName' && k !== 'company') render(); return; }
    if (t.dataset.set === 'from') { ui.from = t.value || BB.toISO(BB.todayLocal()); render(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.set === 'search') { ui.search = t.value; const pos = t.selectionStart; render(); const s = document.querySelector('[data-set="search"]'); s.focus(); s.setSelectionRange(pos, pos); }
    if (t.dataset.setting === 'senderName' || t.dataset.setting === 'company') { S.settings[t.dataset.setting] = t.value; save(); }
  });

  /* First visit: fictional example customers (no phone numbers, example.com emails) so the page shows how it works. */
  function loadSample() {
    const t = BB.todayLocal(); const d = n => { const x = BB.addDays(t, n); return x.d + '/' + x.m + '/'; };
    const rows = [['Customer Name', 'Birthday', 'Company', 'Phone', 'Email'],
      ['Aisyah binti Rahman', d(0) + '1988', 'Example Trading Sdn Bhd', '', 'aisyah@example.com'],
      ['Daniel Tan Wei Ming', d(2) + '1979', 'Example Engineering', '', ''],
      ['Priya a/p Suresh', d(3) + '1992', 'Example Clinic', '', 'priya@example.com'],
      ['Lim Mei Xin', d(5) + '1985', '', '', ''],
      ['Muhammad Hafiz bin Osman', d(8) + '1970', 'Example Logistics', '', 'hafiz@example.com'],
      ['Grace Wong Siew Ling', d(40) + '1990', '', '', ''],
      ['Example With No Birthday', '', '', '', '']];
    const r = BB.buildCustomers(rows, { dateOrder: 'DMY' });
    Object.assign(S, { customers: r.customers, needsCheck: r.needsCheck, missingFields: [], fileName: 'Example customers', importedAt: BB.fmtDate(t), sample: true });
  }
  if (!S.customers.length) loadSample();
  render();
})();
