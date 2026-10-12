(() => {
  const STORE_KEY = 'goodsend.workspace.v1';
  const API_PREFS_KEY = 'goodsend.api.preferences.v1';
  const MAX_PEOPLE = 25;
  const FOLLOW_UP_DAYS = 2;
  const roles = ['Software engineer', 'Frontend engineer', 'Backend engineer', 'Data / ML', 'Product', 'Design', 'Research', 'Marketing', 'Operations', 'Founder / executive', 'Other'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const newPerson = () => ({ id: crypto.randomUUID(), name: '', email: '', role: '', company: '', context: '', subject: '', body: '', status: 'draft', sentAt: null, followUpAt: null, repliedAt: null });
  let state = loadState();
  let api = { ...loadApiPreferences(), key: '' };
  const mobileSidebar = window.matchMedia('(max-width: 790px)');
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { senderName: saved.senderName || '', senderFocus: saved.senderFocus || '', senderContext: saved.senderContext || '', customPrompt: saved.customPrompt || '', people: Array.isArray(saved.people) && saved.people.length ? saved.people.slice(0, MAX_PEOPLE) : [newPerson()] };
    } catch { return { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', people: [newPerson()] }; }
  }
  function loadApiPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(API_PREFS_KEY) || '{}');
      return { base: typeof saved.base === 'string' ? saved.base : '', model: typeof saved.model === 'string' ? saved.model : '' };
    } catch { return { base: '', model: '' }; }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { showToast('Browser storage is full. Export your drafts to keep a copy.'); }
    updateSummary();
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const initials = name => (name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '✳');
  function renderPeople() {
    const list = $('#peopleList');
    list.innerHTML = state.people.map((person, index) => `<article class="person-card" data-person="${esc(person.id)}">
      <div class="person-topline"><span class="person-label">PERSON ${String(index + 1).padStart(2, '0')}</span>${state.people.length > 1 ? `<button class="remove-person" data-action="remove" title="Remove person" aria-label="Remove person ${index + 1}">×</button>` : ''}</div>
      <div class="person-fields">
        <label>Name<input data-field="name" value="${esc(person.name)}" placeholder="Their name" autocomplete="off" /></label>
        <label class="email-field">Email<input data-field="email" type="email" value="${esc(person.email)}" placeholder="name@company.com" autocomplete="off" /></label>
        <label>Role they need<select data-field="role"><option value="">Choose a role</option>${roles.map(role => `<option ${person.role === role ? 'selected' : ''}>${esc(role)}</option>`).join('')}</select></label>
        <label>Company<input data-field="company" value="${esc(person.company)}" placeholder="Company or team" /></label>
        <label class="wide-field">Why this person? <span style="color:#aab2aa">(optional)</span><textarea data-field="context" placeholder="A shared interest, their work, or where you found them">${esc(person.context)}</textarea></label>
      </div>
      ${person.subject || person.body ? `<div class="draft-box"><div class="draft-fields"><label>Subject<input data-field="subject" value="${esc(person.subject)}" placeholder="Subject" /></label><label>Message<textarea data-field="body" placeholder="Your note">${esc(person.body)}</textarea></label></div><div class="draft-actions"><button class="small-action" data-action="copy-subject">Copy subject</button><button class="small-action" data-action="copy-body">Copy body</button><button class="small-action" data-action="copy-all">Copy both</button><button class="small-action primary" data-action="compose">Open email app ↗</button></div></div>` : ''}
      ${person.error ? `<div class="draft-error">${esc(person.error)}</div>` : ''}
    </article>`).join('');
    updateSummary();
  }
  function updateSummary() {
    const count = state.people.length;
    const drafts = state.people.filter(person => person.subject && person.body).length;
    const due = state.people.filter(person => person.status === 'sent' && person.followUpAt && new Date(person.followUpAt) <= new Date()).length;
    $('#peopleStat').innerHTML = `${String(count).padStart(2, '0')} <span>/ 25</span>`;
    $('#draftStat').textContent = String(drafts).padStart(2, '0');
    $('#dueStat').textContent = String(due).padStart(2, '0');
    $('#navCount').textContent = String(count).padStart(2, '0');
    $('#navOutreachCount').textContent = String(state.people.filter(person => person.subject || person.status !== 'draft').length).padStart(2, '0');
    $('#peopleCounter').textContent = `${String(count).padStart(2, '0')} / 25`;
    $('#addRemaining').textContent = count === MAX_PEOPLE ? 'Limit reached' : `${MAX_PEOPLE - count} spots left`;
    $('#addPerson').disabled = count >= MAX_PEOPLE;
    renderOutreach();
  }
  function setApiStatus() {
    const ready = Boolean(api.base && api.model && api.key);
    $('#apiPulse').classList.toggle('ready', ready);
    $('#apiDot').classList.toggle('ready', ready);
    $('#apiStatus').textContent = ready ? `${api.model} · ready for drafts` : api.base && api.model ? `${api.model} · add API key` : 'Add your API details to begin';
    $('#configureApi').innerHTML = ready ? 'Update API settings <span>↗</span>' : 'Set up API <span>↗</span>';
  }
  function renderOutreach() {
    const items = state.people.filter(person => person.subject || person.body || person.status !== 'draft');
    $('#outreachTotal').textContent = `(${items.length})`;
    $('#emptyOutreach').hidden = items.length > 0;
    $('#outreachList').innerHTML = items.map(person => {
      const isDue = person.status === 'sent' && person.followUpAt && new Date(person.followUpAt) <= new Date();
      const status = person.status === 'replied' ? '<span class="status-pill replied">Reply received</span>' : person.status === 'sent' ? `<span class="status-pill ${isDue ? 'due' : ''}">${person.replyCheck === 'no_reply' ? 'No reply yet · check ' : isDue ? 'Follow-up due' : 'Follow up '}${new Date(person.followUpAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : '<span class="status-pill">Draft ready</span>';
      const actions = person.status === 'sent' ? `<button class="small-action" data-action="replied" data-person="${esc(person.id)}">Yes, got a reply</button><button class="small-action" data-action="no-reply" data-person="${esc(person.id)}">No reply yet</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open email ↗</button>` : `<button class="small-action" data-action="mark-sent" data-person="${esc(person.id)}">Mark sent · follow up in 2 days</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open email ↗</button>`;
      return `<article class="outreach-card"><div class="outreach-person"><span class="person-avatar">${esc(initials(person.name))}</span><span><strong>${esc(person.name || person.email || 'New contact')}</strong><small>${esc([person.role, person.company].filter(Boolean).join(' · ') || person.email || 'Role not set')}</small></span></div><div class="outreach-subject"><strong>${esc(person.subject || 'Untitled note')}</strong><small>${status} ${person.status === 'sent' ? `<span style="margin-left:5px">Sent ${new Date(person.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : ''}</small></div><div class="outreach-tools">${actions}</div></article>`;
    }).join('');
  }
  function showToast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function personById(id) { return state.people.find(person => person.id === id); }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function openSettings() {
    $('#apiBase').value = api.base; $('#apiModel').value = api.model; $('#apiKey').value = api.key;
    $('#testStatus').textContent = ''; $('#testStatus').classList.remove('error'); $('#settingsDialog').showModal();
  }
  function endpoint() { return `${api.base.replace(/\/+$/, '')}/chat/completions`; }
  async function requestCompletion(messages, temperature = 0.6) {
    const response = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` }, body: JSON.stringify({ model: api.model, messages, temperature }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `API returned ${response.status}`);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('The API returned an empty response. Check that this model supports chat completions.');
    return content;
  }
  async function testConnection() {
    const status = $('#testStatus'); status.textContent = 'Checking…'; status.classList.remove('error');
    const inputs = { base: $('#apiBase').value.trim(), model: $('#apiModel').value.trim(), key: $('#apiKey').value.trim() };
    if (!inputs.base || !inputs.model || !inputs.key) { status.textContent = 'Fill in the URL, model, and key first.'; status.classList.add('error'); return; }
    const previous = api; api = inputs;
    try { await requestCompletion([{ role: 'user', content: 'Reply with only: Connected.' }], 0); status.textContent = 'Connected ✓'; }
    catch (error) { status.textContent = error.message; status.classList.add('error'); }
    finally { api = previous; }
  }
  function saveApi() {
    api = { base: $('#apiBase').value.trim(), model: $('#apiModel').value.trim(), key: $('#apiKey').value.trim() };
    if (!api.base || !api.model) { showToast('Add the API URL and model first.'); return; }
    let preferencesSaved = true;
    try { localStorage.setItem(API_PREFS_KEY, JSON.stringify({ base: api.base, model: api.model })); }
    catch { preferencesSaved = false; }
    setApiStatus(); $('#settingsDialog').close();
    showToast(preferencesSaved ? (api.key ? 'API ready in this tab. URL and model are saved on this device.' : 'URL and model saved. Add your API key in this tab to write notes.') : (api.key ? 'API ready in this tab, but this browser could not save the URL and model.' : 'Add your API key in this tab. This browser could not save the URL and model.'));
  }
  function updateSidebar() {
    const collapsed = localStorage.getItem('goodsend.sidebar.collapsed') === 'true';
    const isMobile = mobileSidebar.matches;
    document.body.classList.toggle('sidebar-collapsed', !isMobile && collapsed);
    const isOpen = isMobile ? document.body.classList.contains('sidebar-mobile-open') : !collapsed;
    const toggle = $('#sidebarToggle');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isMobile ? (isOpen ? 'Close navigation' : 'Open navigation') : (collapsed ? 'Expand navigation' : 'Collapse navigation'));
    toggle.title = isMobile ? (isOpen ? 'Close navigation' : 'Open navigation') : (collapsed ? 'Expand navigation' : 'Collapse navigation');
    $('#sidebarBackdrop').setAttribute('aria-hidden', String(!isMobile || !isOpen));
  }
  function toggleSidebar() {
    if (mobileSidebar.matches) document.body.classList.toggle('sidebar-mobile-open');
    else {
      const collapsed = !document.body.classList.contains('sidebar-collapsed');
      localStorage.setItem('goodsend.sidebar.collapsed', String(collapsed));
    }
    updateSidebar();
  }
  function buildContext(person) {
    return {
      senderName: state.senderName.trim(), senderFocus: state.senderFocus.trim(), senderExperience: state.senderContext.trim(),
      recipientName: person.name.trim(), targetRole: person.role, company: person.company.trim(), recipientContext: person.context.trim(), customDirection: state.customPrompt.trim()
    };
  }
  async function generatePerson(person) {
    const context = buildContext(person);
    const factPrompt = `You are a careful outreach writing assistant. Use only the information below. Return a short grounded fact sheet of useful facts and a separate list of anything that must not be claimed. Do not infer achievements, relationships, company facts, or experience. Missing information must stay missing. Keep the facts concise.\n\n${JSON.stringify(context)}`;
    const facts = await requestCompletion([{ role: 'system', content: 'Extract grounded facts for a personal cold email. Never invent facts.' }, { role: 'user', content: factPrompt }], 0.2);
    const draftPrompt = `Write one concise, warm, human cold outreach email based only on this context and fact sheet. Avoid generic flattery, fake familiarity, exaggerated claims, and salesy language. Use a natural greeting and one small, clear ask. Aim for 75–125 words unless the optional direction says otherwise. Return ONLY valid JSON with exactly two string fields: subject and body. No markdown fences.\n\nContext: ${JSON.stringify(context)}\nGrounded fact sheet: ${facts}`;
    const raw = await requestCompletion([{ role: 'system', content: 'You write thoughtful, specific outreach emails that sound like a real person. Follow the required JSON format.' }, { role: 'user', content: draftPrompt }], 0.75);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let result;
    try { result = JSON.parse(cleaned); } catch { throw new Error('Could not read the draft from the API. Try generating again.'); }
    if (typeof result.subject !== 'string' || typeof result.body !== 'string' || !result.subject.trim() || !result.body.trim()) throw new Error('The API response needs a subject and body. Try again.');
    person.subject = result.subject.trim(); person.body = result.body.trim(); person.status = 'draft'; person.sentAt = null; person.followUpAt = null; person.error = '';
  }
  async function generateAll() {
    if (!api.key) { openSettings(); showToast('Connect your own API key to write notes.'); return; }
    const candidates = state.people.filter(person => person.email || person.name || person.role || person.company || person.context);
    if (!candidates.length) { showToast('Add a person before writing notes.'); return; }
    const invalid = candidates.find(person => !validEmail(person.email));
    if (invalid) { showToast(`Add a valid email for ${invalid.name || 'each person'} first.`); document.querySelector(`[data-person="${CSS.escape(invalid.id)}"] [data-field="email"]`)?.focus(); return; }
    const duplicate = candidates.find((person, index) => candidates.findIndex(other => other.email.toLowerCase() === person.email.toLowerCase()) !== index);
    if (duplicate) { showToast('Each person needs a unique email address.'); return; }
    const button = $('#generateAll'); button.disabled = true;
    for (let index = 0; index < candidates.length; index++) {
      const person = candidates[index]; person.error = ''; button.querySelector('b').textContent = `Writing ${index + 1} of ${candidates.length}…`; renderPeople();
      try { await generatePerson(person); }
      catch (error) { person.error = error.message || 'Something went wrong while generating this note.'; }
      persist(); renderPeople();
    }
    button.disabled = false; button.querySelector('b').textContent = 'Write my notes';
    const ready = candidates.filter(person => person.subject && person.body).length;
    showToast(ready ? `${ready} ${ready === 1 ? 'note is' : 'notes are'} ready for your review.` : 'No notes were generated. Check your API settings.');
  }
  async function copyText(value, label) {
    try { await navigator.clipboard.writeText(value); showToast(`${label} copied.`); }
    catch { showToast('Clipboard access is unavailable. Select and copy the text instead.'); }
  }
  function compose(person) {
    const to = encodeURIComponent(person.email || ''); const subject = encodeURIComponent(person.subject || ''); const body = encodeURIComponent(person.body || '');
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }
  function markSent(person) {
    if (!person.email || !validEmail(person.email)) { showToast('Add a valid email before marking this note sent.'); return; }
    if (!person.subject || !person.body) { showToast('Write a subject and message first.'); return; }
    person.status = 'sent'; person.sentAt = new Date().toISOString(); person.followUpAt = new Date(Date.now() + FOLLOW_UP_DAYS * 86400000).toISOString(); person.repliedAt = null; persist(); renderPeople(); showToast('Marked sent. Your follow-up will be due in two days.');
  }
  function exportCsv() {
    const rows = [['name','email','role','company','status','subject','body','sent_at','follow_up_at'], ...state.people.filter(person => person.email || person.subject).map(person => [person.name, person.email, person.role, person.company, person.status, person.subject, person.body, person.sentAt || '', person.followUpAt || ''])];
    if (rows.length === 1) { showToast('There are no contacts to export yet.'); return; }
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'goodsend-outreach.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  function handleAction(action, id) {
    const person = personById(id);
    if (!person) return;
    if (action === 'remove') { if (state.people.length === 1) return; state.people = state.people.filter(item => item.id !== id); persist(); renderPeople(); }
    if (action === 'copy-subject') copyText(person.subject, 'Subject');
    if (action === 'copy-body') copyText(person.body, 'Message');
    if (action === 'copy-all') copyText(`Subject: ${person.subject}\n\n${person.body}`, 'Subject and message');
    if (action === 'compose') compose(person);
    if (action === 'mark-sent') markSent(person);
    if (action === 'replied') { person.status = 'replied'; person.repliedAt = new Date().toISOString(); persist(); renderPeople(); showToast('Reply recorded. Nice.'); }
    if (action === 'no-reply') { person.replyCheck = 'no_reply'; person.followUpAt = new Date(Date.now() + FOLLOW_UP_DAYS * 86400000).toISOString(); persist(); renderPeople(); showToast('No reply yet. We’ll remind you to check again in two days.'); }
  }

  renderPeople();
  window.setInterval(updateSummary, 60000);
  $('#senderName').value = state.senderName; $('#senderFocus').value = state.senderFocus; $('#senderContext').value = state.senderContext; $('#customPrompt').value = state.customPrompt; $('#promptChars').textContent = `${state.customPrompt.length} / 500`;
  setApiStatus();
  updateSidebar();
  $('#peopleList').addEventListener('input', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (!card || !field) return; const person = personById(card.dataset.person); if (!person) return; person[field] = event.target.value; persist(); if (field === 'name' || field === 'email') renderOutreach(); });
  $('#peopleList').addEventListener('change', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (card && field) { const person = personById(card.dataset.person); if (person) { person[field] = event.target.value; persist(); } } });
  $('#peopleList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.closest('[data-person]')?.dataset.person); });
  $('#outreachList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.dataset.person); });
  $('#addPerson').addEventListener('click', () => { if (state.people.length >= MAX_PEOPLE) return; state.people.push(newPerson()); persist(); renderPeople(); $('#peopleList article:last-child [data-field="name"]').focus(); });
  for (const [id, key] of [['senderName','senderName'], ['senderFocus','senderFocus'], ['senderContext','senderContext']]) $(`#${id}`).addEventListener('input', event => { state[key] = event.target.value; persist(); });
  $('#customPrompt').addEventListener('input', event => { state.customPrompt = event.target.value.slice(0, 500); if (event.target.value.length > 500) event.target.value = state.customPrompt; $('#promptChars').textContent = `${state.customPrompt.length} / 500`; persist(); });
  $('#openSettings').addEventListener('click', openSettings); $('#topSettings').addEventListener('click', openSettings); $('#configureApi').addEventListener('click', openSettings);
  $('#sidebarToggle').addEventListener('click', toggleSidebar);
  $('#sidebarBackdrop').addEventListener('click', () => { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); });
  $('#mainNavigation').addEventListener('click', () => { if (mobileSidebar.matches) { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); } });
  mobileSidebar.addEventListener('change', () => { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('sidebar-mobile-open')) { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); } });
  $('#testApi').addEventListener('click', testConnection); $('#saveApi').addEventListener('click', saveApi); $('#generateAll').addEventListener('click', generateAll); $('#exportCsv').addEventListener('click', exportCsv);
  $('#clearOutreach').addEventListener('click', () => { if (!confirm('Clear every person, draft, and follow-up from this browser? This cannot be undone.')) return; localStorage.removeItem(STORE_KEY); state = { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', people: [newPerson()] }; $('#senderName').value = ''; $('#senderFocus').value = ''; $('#senderContext').value = ''; $('#customPrompt').value = ''; $('#promptChars').textContent = '0 / 500'; renderPeople(); showToast('Workspace cleared.'); });
})();
