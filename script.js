(() => {
  const STORE_KEY = 'goodsend.workspace.v1';
  const API_PREFS_KEY = 'goodsend.api.preferences.v1';
  const API_KEY_KEY = 'goodsend.api.key.v1';
  const MAX_PEOPLE = 25;
  const FOLLOW_UP_DAYS = 2;
  const roles = ['Software engineer', 'Frontend engineer', 'Backend engineer', 'Data / ML', 'Product', 'Design', 'Research', 'Marketing', 'Operations', 'Founder / executive', 'Other'];
  const builtInStyles = [
    { id: 'natural', name: 'Natural', description: 'Warm, clear, and conversational.', instructions: 'Write in a natural first-person style. Keep sentences clear and conversational, and use only supplied details.' },
    { id: 'abigayle', name: 'Abigayle framing', description: 'Tell a project story through what, why, how, and result.', instructions: 'When using the role profile project, shape its project sentence in this order: what I built or did → why I did it → how I did it → result. Make the sequence sound natural and specific. Use only the supplied fields. If the result is blank, do not invent one; omit it or describe only a supplied qualitative outcome. Do not force this structure onto unrelated sentences.' }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const newPerson = () => ({ id: crypto.randomUUID(), name: '', email: '', role: '', company: '', context: '', subject: '', body: '', status: 'draft', sentAt: null, followUpAt: null, repliedAt: null });
  let state = loadState();
  let api = { ...loadApiPreferences(), key: '' };
  if (api.rememberApiKey) {
    try { api.key = localStorage.getItem(API_KEY_KEY) || ''; } catch { api.key = ''; }
  }
  const mobileSidebar = window.matchMedia('(max-width: 790px)');
  const generatingPeople = new Set();
  let generatingAll = false;
  let editingStyleId = null;
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      const writingStyles = normalizeWritingStyles(saved.writingStyles);
      const requestedStyleId = saved.selectedStyleId || (saved.abigayleMode ? 'abigayle' : 'natural');
      const selectedStyleId = [...builtInStyles, ...writingStyles].some(style => style.id === requestedStyleId) ? requestedStyleId : 'natural';
      const people = Array.isArray(saved.people) ? saved.people.slice(0, MAX_PEOPLE) : [];
      const priorOutreach = Array.isArray(saved.outreach) ? saved.outreach : [];
      const archivedPeople = people.filter(person => person.subject || person.body || person.status !== 'draft');
      const composePeople = people.filter(person => !person.subject && !person.body && person.status === 'draft');
      return { senderName: saved.senderName || '', senderFocus: saved.senderFocus || '', senderContext: saved.senderContext || '', customPrompt: saved.customPrompt || '', roleProfiles: normalizeRoleProfiles(saved.roleProfiles), roleProfileEditorRole: roles.includes(saved.roleProfileEditorRole) ? saved.roleProfileEditorRole : roles[0], writingStyles, selectedStyleId, people: composePeople.length ? composePeople : [newPerson()], outreach: [...archivedPeople, ...priorOutreach] };
    } catch { return { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', roleProfiles: {}, roleProfileEditorRole: roles[0], writingStyles: [], selectedStyleId: 'natural', people: [newPerson()], outreach: [] }; }
  }
  function normalizeWritingStyles(styles) {
    if (!Array.isArray(styles)) return [];
    return styles.filter(style => style && typeof style.id === 'string' && style.id.startsWith('custom-') && typeof style.name === 'string' && typeof style.instructions === 'string')
      .slice(0, 20).map(style => ({ id: style.id, name: style.name.trim().slice(0, 40) || 'Custom method', instructions: style.instructions.trim().slice(0, 700), description: 'A personal writing method.' }));
  }
  function getWritingStyle(id = state.selectedStyleId) {
    return [...builtInStyles, ...state.writingStyles].find(style => style.id === id) || builtInStyles[0];
  }
  function normalizeRoleProfiles(profiles) {
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return {};
    return Object.fromEntries(roles.map(role => {
      const profile = profiles[role] && typeof profiles[role] === 'object' ? profiles[role] : {};
      return [role, { built: typeof profile.built === 'string' ? profile.built : '', why: typeof profile.why === 'string' ? profile.why : '', how: typeof profile.how === 'string' ? profile.how : '', result: typeof profile.result === 'string' ? profile.result : '' }];
    }));
  }
  function loadApiPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(API_PREFS_KEY) || '{}');
      return { base: typeof saved.base === 'string' ? saved.base : '', model: typeof saved.model === 'string' ? saved.model : '', rememberApiKey: saved.rememberApiKey === true };
    } catch { return { base: '', model: '', rememberApiKey: false }; }
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
      <div class="person-topline"><span class="person-label">PERSON ${String(index + 1).padStart(2, '0')}</span><div class="person-actions"><button class="small-action write-single" data-action="generate" ${generatingAll || generatingPeople.has(person.id) ? 'disabled' : ''}>${generatingPeople.has(person.id) ? 'Writing…' : 'Write this note'}</button>${state.people.length > 1 ? `<button class="remove-person" data-action="remove" title="Remove person" aria-label="Remove person ${index + 1}">×</button>` : ''}</div></div>
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
  function renderRoleProfile() {
    const picker = $('#roleProfileRole');
    picker.innerHTML = roles.map(role => `<option value="${esc(role)}">${esc(role)}</option>`).join('');
    picker.value = state.roleProfileEditorRole;
    const profile = state.roleProfiles[state.roleProfileEditorRole] || { built: '', why: '', how: '', result: '' };
    for (const field of ['built', 'why', 'how', 'result']) $(`#story${field[0].toUpperCase()}${field.slice(1)}`).value = profile[field];
    const hasDetails = Object.values(profile).some(value => value.trim());
    $('#roleProfileStatus').textContent = hasDetails ? 'PROFILE SAVED' : 'READY TO ADD';
  }
  function renderWritingStyles() {
    const active = getWritingStyle();
    $('#activeStyleName').textContent = active.name;
    $('#activeStyleDescription').textContent = active.description;
    $('#writingStylesList').innerHTML = [...builtInStyles, ...state.writingStyles].map(style => {
      const selected = state.selectedStyleId === style.id;
      const custom = style.id.startsWith('custom-');
      return `<article class="style-card ${selected ? 'is-selected' : ''}"><div class="style-card-top"><span class="style-card-icon">${style.id === 'abigayle' ? '✳' : style.id === 'natural' ? '◌' : '✎'}</span>${selected ? '<span class="style-selected-badge">ACTIVE</span>' : ''}</div><h2>${esc(style.name)}</h2><p>${esc(style.description)}</p><div class="style-instruction-preview">${esc(style.instructions)}</div><div class="style-card-actions"><button class="outline-button" data-style-action="select" data-style-id="${esc(style.id)}" ${selected ? 'disabled' : ''}>${selected ? 'Currently active' : 'Use this method'}</button>${custom ? `<button class="text-button" data-style-action="edit" data-style-id="${esc(style.id)}">Edit</button><button class="text-button delete-style" data-style-action="delete" data-style-id="${esc(style.id)}">Delete</button>` : ''}</div></article>`;
    }).join('');
  }
  function openWritingStyle(styleId = null) {
    editingStyleId = styleId;
    const style = styleId ? state.writingStyles.find(item => item.id === styleId) : null;
    $('#styleDialogTitle').textContent = style ? 'Edit writing method' : 'Add a writing method';
    $('#styleName').value = style?.name || '';
    $('#styleInstructions').value = style?.instructions || '';
    $('#styleDialog').showModal();
    $('#styleName').focus();
  }
  function saveWritingStyle() {
    const name = $('#styleName').value.trim().slice(0, 40);
    const instructions = $('#styleInstructions').value.trim().slice(0, 700);
    if (!name || !instructions) { $('#styleForm').reportValidity(); return; }
    if (editingStyleId) {
      const style = state.writingStyles.find(item => item.id === editingStyleId);
      if (!style) return;
      Object.assign(style, { name, instructions, description: 'A personal writing method.' });
    } else {
      if (state.writingStyles.length >= 20) { showToast('You can save up to 20 custom methods.'); return; }
      const style = { id: `custom-${crypto.randomUUID()}`, name, instructions, description: 'A personal writing method.' };
      state.writingStyles.push(style);
      state.selectedStyleId = style.id;
    }
    persist(); renderWritingStyles(); $('#styleDialog').close(); showToast('Writing method saved.');
  }
  function updateSummary() {
    const count = state.people.length;
    const drafts = state.outreach.filter(person => person.subject && person.body && person.status === 'draft').length;
    const due = state.outreach.filter(person => person.status === 'sent' && person.followUpAt && new Date(person.followUpAt) <= new Date()).length;
    $('#peopleStat').innerHTML = `${String(count).padStart(2, '0')} <span>/ 25</span>`;
    $('#draftStat').textContent = String(drafts).padStart(2, '0');
    $('#dueStat').textContent = String(due).padStart(2, '0');
    $('#navCount').textContent = String(count).padStart(2, '0');
    $('#navOutreachCount').textContent = String(state.outreach.length).padStart(2, '0');
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
    const items = state.outreach;
    $('#outreachTotal').textContent = `(${items.length})`;
    $('#emptyOutreach').hidden = items.length > 0;
    $('#outreachList').innerHTML = items.map(person => {
      const isDue = person.status === 'sent' && person.followUpAt && new Date(person.followUpAt) <= new Date();
      const status = person.status === 'replied' ? '<span class="status-pill replied">Reply received</span>' : person.status === 'sent' ? `<span class="status-pill ${isDue ? 'due' : ''}">${person.replyCheck === 'no_reply' ? 'No reply yet · check ' : isDue ? 'Follow-up due' : 'Follow up '}${new Date(person.followUpAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : '<span class="status-pill">Draft ready</span>';
      const actions = person.status === 'sent' ? `<button class="small-action" data-action="replied" data-person="${esc(person.id)}">Yes, got a reply</button><button class="small-action" data-action="no-reply" data-person="${esc(person.id)}">No reply yet</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open email ↗</button>` : `<button class="small-action" data-action="mark-sent" data-person="${esc(person.id)}">Mark sent · follow up in 2 days</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open email ↗</button>`;
      return `<article class="outreach-card"><div class="outreach-person"><span class="person-avatar">${esc(initials(person.name))}</span><span><strong>${esc(person.name || person.email || 'New contact')}</strong><small>${esc([person.role, person.company].filter(Boolean).join(' · ') || person.email || 'Role not set')}</small></span></div><div class="outreach-subject"><strong>${esc(person.subject || 'Untitled note')}</strong><small>${status} ${person.status === 'sent' ? `<span style="margin-left:5px">Sent ${new Date(person.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : ''}</small></div><div class="outreach-tools">${actions}</div><details class="outreach-message"><summary>View saved message</summary><div class="outreach-message-body"><p>${esc(person.body || 'No message body saved.')}</p><div class="draft-actions"><button class="small-action" data-action="copy-subject" data-person="${esc(person.id)}">Copy subject</button><button class="small-action" data-action="copy-body" data-person="${esc(person.id)}">Copy body</button><button class="small-action" data-action="copy-all" data-person="${esc(person.id)}">Copy both</button></div></div></details></article>`;
    }).join('');
  }
  function showToast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function personById(id) { return state.people.find(person => person.id === id) || state.outreach.find(person => person.id === id); }
  function archiveGeneratedPerson(person) {
    person.error = '';
    state.outreach.unshift(person);
    state.people = state.people.filter(item => item.id !== person.id);
  }
  function ensureComposeRow() {
    const hasEmptyRow = state.people.some(person => !person.name && !person.email && !person.role && !person.company && !person.context && !person.subject && !person.body);
    if (!hasEmptyRow && state.people.length < MAX_PEOPLE) state.people.push(newPerson());
    if (!state.people.length) state.people.push(newPerson());
  }
  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function openSettings() {
    $('#apiBase').value = api.base; $('#apiModel').value = api.model; $('#apiKey').value = api.key;
    $('#rememberApiKey').checked = api.rememberApiKey;
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
    api = { base: $('#apiBase').value.trim(), model: $('#apiModel').value.trim(), key: $('#apiKey').value.trim(), rememberApiKey: $('#rememberApiKey').checked };
    if (!api.base || !api.model) { showToast('Add the API URL and model first.'); return; }
    let preferencesSaved = true; let keyStorageSaved = true;
    try { localStorage.setItem(API_PREFS_KEY, JSON.stringify({ base: api.base, model: api.model, rememberApiKey: api.rememberApiKey })); }
    catch { preferencesSaved = false; }
    try {
      if (api.rememberApiKey && api.key) localStorage.setItem(API_KEY_KEY, api.key);
      else localStorage.removeItem(API_KEY_KEY);
    } catch { keyStorageSaved = false; }
    if (!preferencesSaved && api.rememberApiKey) { try { localStorage.removeItem(API_KEY_KEY); } catch { /* Keep the failure path private; the key remains tab-only. */ } }
    setApiStatus(); $('#settingsDialog').close();
    const message = !preferencesSaved && api.rememberApiKey && api.key ? 'API ready in this tab, but the remember setting could not be saved. The key will clear on reload.' : !keyStorageSaved && api.rememberApiKey && api.key ? 'API ready in this tab, but the key could not be remembered and will clear on reload.' : api.key && api.rememberApiKey ? 'API ready. URL, model, and key are remembered in this browser.' : api.key ? `API ready in this tab. ${preferencesSaved ? 'URL and model saved.' : 'URL and model could not be saved.'} Key clears on reload.` : !preferencesSaved ? 'This browser could not save the URL and model. Enter an API key before writing notes.' : api.rememberApiKey ? 'URL and model saved. Add an API key to remember before writing notes.' : 'URL and model saved. Add your API key in this tab to write notes.';
    showToast(message);
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
  function updatePage() {
    const profilePage = location.hash === '#profile';
    const stylesPage = location.hash === '#styles';
    const outreachPage = location.hash === '#outreach';
    $('#composePage').hidden = profilePage || stylesPage;
    $('#profilePage').hidden = !profilePage;
    $('#stylesPage').hidden = !stylesPage;
    $('#breadcrumbPage').textContent = profilePage ? 'My profile' : stylesPage ? 'Writing styles' : outreachPage ? 'Outreach' : 'Compose';
    for (const link of $('#mainNavigation').querySelectorAll('.nav-link')) {
      const selected = profilePage ? link.hash === '#profile' : stylesPage ? link.hash === '#styles' : outreachPage ? link.hash === '#outreach' : link.hash === '#compose';
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    if (outreachPage) requestAnimationFrame(() => $('#outreach').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    else window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function buildContext(person) {
    const roleProfile = person.role ? (state.roleProfiles[person.role] || { built: '', why: '', how: '', result: '' }) : { built: '', why: '', how: '', result: '' };
    return {
      senderName: state.senderName.trim(), senderFocus: state.senderFocus.trim(), senderExperience: state.senderContext.trim(),
      roleProfile, framingStyle: state.selectedStyleId || 'natural',
      recipientName: person.name.trim(), targetRole: person.role, company: person.company.trim(), recipientContext: person.context.trim(), customDirection: state.customPrompt.trim()
    };
  }
  async function generatePerson(person) {
    const context = buildContext(person);
    const factPrompt = `You are a careful outreach writing assistant. Use only the information below. Return a short grounded fact sheet of useful facts and a separate list of anything that must not be claimed. Do not infer achievements, relationships, company facts, or experience. Missing information must stay missing. Keep the facts concise.\n\n${JSON.stringify(context)}`;
    const facts = await requestCompletion([{ role: 'system', content: 'Extract grounded facts for a personal cold email. Never invent facts.' }, { role: 'user', content: factPrompt }], 0.2);
    const styleInstruction = getWritingStyle(context.framingStyle).instructions;
    const draftPrompt = `Write one concise, warm, human cold outreach email based only on this context and fact sheet. Avoid generic flattery, fake familiarity, exaggerated claims, and salesy language. Use a natural greeting and one small, clear ask. Aim for 75–125 words unless the optional direction says otherwise. ${styleInstruction} Return ONLY valid JSON with exactly two string fields: subject and body. No markdown fences.\n\nContext: ${JSON.stringify(context)}\nGrounded fact sheet: ${facts}`;
    const raw = await requestCompletion([{ role: 'system', content: 'You write thoughtful, specific outreach emails that sound like a real person. Follow the required JSON format.' }, { role: 'user', content: draftPrompt }], 0.75);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let result;
    try { result = JSON.parse(cleaned); } catch { throw new Error('Could not read the draft from the API. Try generating again.'); }
    if (typeof result.subject !== 'string' || typeof result.body !== 'string' || !result.subject.trim() || !result.body.trim()) throw new Error('The API response needs a subject and body. Try again.');
    person.subject = result.subject.trim(); person.body = result.body.trim(); person.status = 'draft'; person.sentAt = null; person.followUpAt = null; person.error = '';
  }
  async function generateAll() {
    if (!api.key) { openSettings(); showToast('Connect your own API key to write notes.'); return; }
    if (generatingAll || generatingPeople.size) { showToast('Wait for the current note to finish writing.'); return; }
    const candidates = state.people.filter(person => person.email || person.name || person.role || person.company || person.context);
    if (!candidates.length) { showToast('Add a person before writing notes.'); return; }
    const invalid = candidates.find(person => !validEmail(person.email));
    if (invalid) { showToast(`Add a valid email for ${invalid.name || 'each person'} first.`); document.querySelector(`[data-person="${CSS.escape(invalid.id)}"] [data-field="email"]`)?.focus(); return; }
    const duplicate = candidates.find((person, index) => candidates.findIndex(other => other.email.toLowerCase() === person.email.toLowerCase()) !== index);
    if (duplicate) { showToast('Each person needs a unique email address.'); return; }
    const button = $('#generateAll'); button.disabled = true; generatingAll = true; renderPeople();
    for (let index = 0; index < candidates.length; index++) {
      const person = candidates[index]; person.error = ''; button.querySelector('b').textContent = `Writing ${index + 1} of ${candidates.length}…`; renderPeople();
      try { await generatePerson(person); archiveGeneratedPerson(person); }
      catch (error) { person.error = error.message || 'Something went wrong while generating this note.'; }
      persist(); renderPeople();
    }
    ensureComposeRow();
    generatingAll = false; button.disabled = false; button.querySelector('b').textContent = 'Write my notes'; renderPeople();
    const ready = candidates.filter(person => person.subject && person.body).length;
    showToast(ready ? `${ready} ${ready === 1 ? 'note is' : 'notes are'} saved in Outreach.` : 'No notes were generated. Check your API settings.');
  }
  async function generateOne(person) {
    if (!api.key) { openSettings(); showToast('Connect your own API key to write notes.'); return; }
    if (generatingAll || generatingPeople.size) { showToast('Wait for the current note to finish writing.'); return; }
    if (!validEmail(person.email)) { showToast(`Add a valid email for ${person.name || 'this person'} first.`); document.querySelector(`[data-person="${CSS.escape(person.id)}"] [data-field="email"]`)?.focus(); return; }
    generatingPeople.add(person.id); person.error = ''; renderPeople();
    let succeeded = false;
    try { await generatePerson(person); succeeded = true; }
    catch (error) { person.error = error.message || 'Something went wrong while generating this note.'; }
    finally {
      generatingPeople.delete(person.id);
      if (succeeded) { archiveGeneratedPerson(person); ensureComposeRow(); }
      persist(); renderPeople();
    }
    showToast(succeeded ? `The note for ${person.name || 'this person'} is saved in Outreach.` : 'Could not write this note. Check the message on the contact card.');
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
    const rows = [['name','email','role','company','status','subject','body','sent_at','follow_up_at'], ...[...state.outreach, ...state.people].filter(person => person.email || person.subject).map(person => [person.name, person.email, person.role, person.company, person.status, person.subject, person.body, person.sentAt || '', person.followUpAt || ''])];
    if (rows.length === 1) { showToast('There are no contacts to export yet.'); return; }
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'goodsend-outreach.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  function handleAction(action, id) {
    const person = personById(id);
    if (!person) return;
    if (action === 'remove') { if (state.people.length === 1) return; state.people = state.people.filter(item => item.id !== id); persist(); renderPeople(); }
    if (action === 'generate') generateOne(person);
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
  renderRoleProfile();
  renderWritingStyles();
  updatePage();
  $('#peopleList').addEventListener('input', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (!card || !field) return; const person = personById(card.dataset.person); if (!person) return; person[field] = event.target.value; persist(); if (field === 'name' || field === 'email') renderOutreach(); });
  $('#peopleList').addEventListener('change', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (card && field) { const person = personById(card.dataset.person); if (person) { person[field] = event.target.value; persist(); } } });
  $('#peopleList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.closest('[data-person]')?.dataset.person); });
  $('#outreachList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.dataset.person); });
  $('#addPerson').addEventListener('click', () => { if (state.people.length >= MAX_PEOPLE) return; state.people.push(newPerson()); persist(); renderPeople(); $('#peopleList article:last-child [data-field="name"]').focus(); });
  for (const [id, key] of [['senderName','senderName'], ['senderFocus','senderFocus'], ['senderContext','senderContext']]) $(`#${id}`).addEventListener('input', event => { state[key] = event.target.value; persist(); });
  $('#customPrompt').addEventListener('input', event => { state.customPrompt = event.target.value.slice(0, 500); if (event.target.value.length > 500) event.target.value = state.customPrompt; $('#promptChars').textContent = `${state.customPrompt.length} / 500`; persist(); });
  $('#roleProfileRole').addEventListener('change', event => { state.roleProfileEditorRole = event.target.value; persist(); renderRoleProfile(); });
  for (const field of ['built', 'why', 'how', 'result']) $(`#story${field[0].toUpperCase()}${field.slice(1)}`).addEventListener('input', event => {
    const profile = state.roleProfiles[state.roleProfileEditorRole] || { built: '', why: '', how: '', result: '' };
    profile[field] = event.target.value; state.roleProfiles[state.roleProfileEditorRole] = profile; persist();
    const hasDetails = Object.values(profile).some(value => value.trim()); $('#roleProfileStatus').textContent = hasDetails ? 'PROFILE SAVED' : 'READY TO ADD';
  });
  $('#addWritingStyle').addEventListener('click', () => openWritingStyle());
  $('#writingStylesList').addEventListener('click', event => {
    const button = event.target.closest('[data-style-action]');
    if (!button) return;
    const { styleAction, styleId } = button.dataset;
    if (styleAction === 'select') {
      state.selectedStyleId = styleId; persist(); renderWritingStyles(); showToast(`${getWritingStyle().name} will be used for new drafts.`);
    } else if (styleAction === 'edit') openWritingStyle(styleId);
    else if (styleAction === 'delete') {
      const style = state.writingStyles.find(item => item.id === styleId);
      if (!style || !confirm(`Delete “${style.name}” from your writing methods?`)) return;
      state.writingStyles = state.writingStyles.filter(item => item.id !== styleId);
      if (state.selectedStyleId === styleId) state.selectedStyleId = 'natural';
      persist(); renderWritingStyles(); showToast('Writing method deleted.');
    }
  });
  $('#saveStyle').addEventListener('click', saveWritingStyle);
  $('#cancelStyle').addEventListener('click', () => $('#styleDialog').close());
  $('#openSettings').addEventListener('click', openSettings); $('#topSettings').addEventListener('click', openSettings); $('#configureApi').addEventListener('click', openSettings);
  $('#sidebarToggle').addEventListener('click', toggleSidebar);
  $('#sidebarBackdrop').addEventListener('click', () => { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); });
  $('#mainNavigation').addEventListener('click', () => { if (mobileSidebar.matches) { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); } });
  mobileSidebar.addEventListener('change', () => { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); });
  window.addEventListener('hashchange', updatePage);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('sidebar-mobile-open')) { document.body.classList.remove('sidebar-mobile-open'); updateSidebar(); } });
  $('#testApi').addEventListener('click', testConnection); $('#saveApi').addEventListener('click', saveApi); $('#generateAll').addEventListener('click', generateAll); $('#exportCsv').addEventListener('click', exportCsv);
  $('#clearOutreach').addEventListener('click', () => { if (!confirm('Clear every person, draft, profile, and follow-up from this browser? This cannot be undone.')) return; localStorage.removeItem(STORE_KEY); state = { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', roleProfiles: {}, roleProfileEditorRole: roles[0], writingStyles: [], selectedStyleId: 'natural', people: [newPerson()], outreach: [] }; $('#senderName').value = ''; $('#senderFocus').value = ''; $('#senderContext').value = ''; $('#customPrompt').value = ''; $('#promptChars').textContent = '0 / 500'; renderRoleProfile(); renderWritingStyles(); renderPeople(); showToast('Workspace cleared.'); });
})();
