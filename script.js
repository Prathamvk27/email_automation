import { runGoodsendAgent } from './goodsend-agent.mjs';

(() => {
  const STORE_KEY = 'goodsend.workspace.v1';
  const API_PREFS_KEY = 'goodsend.api.preferences.v1';
  const API_KEY_KEY = 'goodsend.api.key.v1';
  const GMAIL_PREFS_KEY = 'goodsend.gmail.preferences.v1';
  const RESUME_DB_NAME = 'goodsend.local.assets.v1';
  const MAX_PEOPLE = 25;
  const MAX_STORIES_PER_ROLE = 10;
  const FOLLOW_UP_DAYS = 2;
  const roles = ['Software engineer', 'Frontend engineer', 'Backend engineer', 'Data / ML', 'Product', 'Design', 'Research', 'Marketing', 'Operations', 'Founder / executive', 'Other'];
  const builtInStyles = [
    { id: 'natural', name: 'Natural', description: 'Warm, clear, and conversational.', instructions: 'Write in a natural first-person style. Keep sentences clear and conversational, and use only supplied details.' },
    { id: 'abigayle', name: 'Abigayle framing', description: 'Tell a project story through what, why, how, and result.', instructions: 'For the single role profile story you chose, shape its project sentence in this order: what I built or did → why I did it → how I did it → result. Make the sequence sound natural and specific. Use only the supplied fields. If the result is blank, do not invent one; omit it or describe only a supplied qualitative outcome. Do not force this structure onto unrelated sentences.' }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const newPerson = () => ({ id: crypto.randomUUID(), name: '', email: '', role: '', company: '', context: '', subject: '', body: '', status: 'draft', sentAt: null, followUpAt: null, repliedAt: null });
  let state = loadState();
  let api = { ...loadApiPreferences(), key: '' };
  let gmailSettings = loadGmailSettings();
  let gmailSession = { accessToken: '', expiresAt: 0 };
  const gmailDrafting = new Set();
  if (api.rememberApiKey) {
    try { api.key = localStorage.getItem(API_KEY_KEY) || ''; } catch { api.key = ''; }
  }
  const mobileSidebar = window.matchMedia('(max-width: 790px)');
  const generatingPeople = new Set();
  let generatingAll = false;
  let queueTimer = null;
  let queueWake = null;
  let queueLoopActive = false;
  let editingStyleId = null;
  let toastTimer;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      const writingStyles = normalizeWritingStyles(saved.writingStyles);
      const requestedStyleId = saved.selectedStyleId || (saved.abigayleMode ? 'abigayle' : 'natural');
      const selectedStyleId = [...builtInStyles, ...writingStyles].some(style => style.id === requestedStyleId) ? requestedStyleId : 'natural';
      const roleProfiles = normalizeRoleProfiles(saved.roleProfiles);
      const roleProfileEditorRole = roles.includes(saved.roleProfileEditorRole) ? saved.roleProfileEditorRole : roles[0];
      const editorStories = roleProfiles[roleProfileEditorRole];
      const roleProfileEditorStoryId = editorStories.some(story => story.id === saved.roleProfileEditorStoryId) ? saved.roleProfileEditorStoryId : editorStories[0].id;
      const people = Array.isArray(saved.people) ? saved.people.slice(0, MAX_PEOPLE) : [];
      const priorOutreach = Array.isArray(saved.outreach) ? saved.outreach : [];
      const archivedPeople = people.filter(person => person.subject || person.body || person.status !== 'draft');
      const composePeople = people.filter(person => !person.subject && !person.body && person.status === 'draft');
      const queue = saved.queue && Array.isArray(saved.queue.ids) ? { ids: saved.queue.ids.filter(id => typeof id === 'string'), index: Math.max(0, Number(saved.queue.index) || 0), status: saved.queue.status === 'running' ? 'paused' : ['paused', 'complete', 'stopped'].includes(saved.queue.status) ? saved.queue.status : 'paused', interval: [30, 45, 60, 90].includes(Number(saved.queue.interval)) ? Number(saved.queue.interval) : 30, pauseReason: typeof saved.queue.pauseReason === 'string' ? saved.queue.pauseReason : '', nextRunAt: 0 } : null;
      return { senderName: saved.senderName || '', senderFocus: saved.senderFocus || '', senderContext: saved.senderContext || '', customPrompt: saved.customPrompt || '', voiceGuide: typeof saved.voiceGuide === 'string' ? saved.voiceGuide.slice(0, 1000) : '', queueIntervalSeconds: [30, 45, 60, 90].includes(Number(saved.queueIntervalSeconds)) ? Number(saved.queueIntervalSeconds) : 30, queue, roleProfiles, roleProfileEditorRole, roleProfileEditorStoryId, writingStyles, selectedStyleId, people: composePeople.length ? composePeople : [newPerson()], outreach: [...archivedPeople, ...priorOutreach] };
    } catch {
      const roleProfiles = normalizeRoleProfiles({});
      return { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', voiceGuide: '', queueIntervalSeconds: 30, queue: null, roleProfiles, roleProfileEditorRole: roles[0], roleProfileEditorStoryId: roleProfiles[roles[0]][0].id, writingStyles: [], selectedStyleId: 'natural', people: [newPerson()], outreach: [] };
    }
  }
  function normalizeWritingStyles(styles) {
    if (!Array.isArray(styles)) return [];
    return styles.filter(style => style && typeof style.id === 'string' && style.id.startsWith('custom-') && typeof style.name === 'string' && typeof style.instructions === 'string')
      .slice(0, 20).map(style => ({ id: style.id, name: style.name.trim().slice(0, 40) || 'Custom method', instructions: style.instructions.trim().slice(0, 700), description: 'A personal writing method.' }));
  }
  function getWritingStyle(id = state.selectedStyleId) {
    return [...builtInStyles, ...state.writingStyles].find(style => style.id === id) || builtInStyles[0];
  }
  function newRoleStory() {
    return { id: crypto.randomUUID(), title: '', built: '', why: '', how: '', result: '' };
  }
  function normalizeRoleProfiles(profiles) {
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {};
    return Object.fromEntries(roles.map(role => {
      const savedRole = profiles[role];
      const entries = Array.isArray(savedRole) ? savedRole : savedRole && typeof savedRole === 'object' ? [savedRole] : [];
      const stories = entries.slice(0, MAX_STORIES_PER_ROLE).map(story => ({
        id: typeof story.id === 'string' && story.id ? story.id : crypto.randomUUID(),
        title: typeof story.title === 'string' ? story.title.slice(0, 60) : '',
        built: typeof story.built === 'string' ? story.built.slice(0, 800) : '',
        why: typeof story.why === 'string' ? story.why.slice(0, 800) : '',
        how: typeof story.how === 'string' ? story.how.slice(0, 800) : '',
        result: typeof story.result === 'string' ? story.result.slice(0, 800) : ''
      }));
      return [role, stories.length ? stories : [newRoleStory()]];
    }));
  }
  function loadApiPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(API_PREFS_KEY) || '{}');
      return { base: typeof saved.base === 'string' ? saved.base : '', model: typeof saved.model === 'string' ? saved.model : '', rememberApiKey: saved.rememberApiKey === true };
    } catch { return { base: '', model: '', rememberApiKey: false }; }
  }
  function loadGmailSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(GMAIL_PREFS_KEY) || '{}');
      return { clientId: typeof saved.clientId === 'string' ? saved.clientId : '' };
    } catch { return { clientId: '' }; }
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
      ${person.subject || person.body ? `<div class="draft-box"><div class="draft-fields"><label>Subject<input data-field="subject" value="${esc(person.subject)}" placeholder="Subject" /></label><label>Message<textarea data-field="body" placeholder="Your note">${esc(person.body)}</textarea></label></div><div class="draft-actions"><button class="small-action" data-action="copy-subject">Copy subject</button><button class="small-action" data-action="copy-body">Copy body</button><button class="small-action" data-action="copy-all">Copy both</button><button class="small-action primary" data-action="compose">Open in Gmail ↗</button><button class="small-action" data-action="gmail-draft" ${gmailDrafting.has(person.id) ? 'disabled' : ''}>${gmailDrafting.has(person.id) ? 'Creating Gmail draft…' : 'Create Gmail draft + resume'}</button>${person.gmailDraftId ? `<a class="small-action gmail-review-link" href="https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(person.gmailDraftId)}" target="_blank" rel="noopener noreferrer">Review Gmail draft ↗</a>` : ''}</div></div>` : ''}
      ${person.error ? `<div class="draft-error">${esc(person.error)}</div>` : ''}
    </article>`).join('');
    if (state.queue?.status === 'running') list.querySelectorAll('input, select, textarea, button[data-action="remove"]').forEach(control => { control.disabled = true; });
    renderQueue();
    updateSummary();
  }
  function renderQueue() {
    const queue = state.queue;
    const start = $('#generateAll');
    const pause = $('#pauseQueue');
    const stop = $('#stopQueue');
    const interval = $('#queueInterval');
    interval.value = String(state.queueIntervalSeconds || 30);
    const active = queue?.status === 'running';
    const paused = queue?.status === 'paused' && queue.index < queue.ids.length;
    start.querySelector('b').textContent = active ? 'Queue running' : paused ? 'Resume paced run' : queue?.status === 'complete' ? 'Run another batch' : 'Start paced run';
    start.disabled = active || generatingPeople.size > 0;
    pause.hidden = !active;
    stop.hidden = !active && !paused;
    interval.disabled = active;
    if (active) {
      const remaining = Math.max(0, queue.ids.length - queue.index);
      $('#queueStatus').textContent = queue.nextRunAt ? `Draft ${Math.min(queue.index + 1, queue.ids.length)} of ${queue.ids.length} is queued. Next contact in ${Math.max(0, Math.ceil((queue.nextRunAt - Date.now()) / 1000))} seconds. ${remaining} remaining.` : `Writing contact ${Math.min(queue.index + 1, queue.ids.length)} of ${queue.ids.length}…`;
    } else if (paused) {
      $('#queueStatus').textContent = `${queue.pauseReason ? `${queue.pauseReason} ` : ''}Paused · ${queue.index} of ${queue.ids.length} processed. Resume to continue; saved contacts and drafts stay in this browser.`;
    } else if (queue?.status === 'complete') {
      $('#queueStatus').textContent = `Run complete · every contact was attempted. Successful drafts are in Outreach; any errors remain in Compose.`;
    } else if (queue?.status === 'stopped') {
      $('#queueStatus').textContent = `Stopped · remaining contacts are still in Compose and can be run later.`;
    } else {
      $('#queueStatus').textContent = 'Ready when you are. Your contact details stay attached to each saved draft.';
    }
  }
  function renderRoleProfile() {
    const rolePicker = $('#roleProfileRole');
    rolePicker.innerHTML = roles.map(role => `<option value="${esc(role)}">${esc(role)}</option>`).join('');
    rolePicker.value = state.roleProfileEditorRole;
    const stories = state.roleProfiles[state.roleProfileEditorRole];
    if (!stories.some(story => story.id === state.roleProfileEditorStoryId)) state.roleProfileEditorStoryId = stories[0].id;
    $('#roleProfileStory').innerHTML = stories.map((story, index) => `<option value="${esc(story.id)}">${esc(story.title.trim() || `Story ${index + 1}`)}</option>`).join('');
    $('#roleProfileStory').value = state.roleProfileEditorStoryId;
    const story = stories.find(item => item.id === state.roleProfileEditorStoryId) || stories[0];
    for (const field of ['title', 'built', 'why', 'how', 'result']) $(`#story${field[0].toUpperCase()}${field.slice(1)}`).value = story[field];
    const hasDetails = stories.some(item => [item.title, item.built, item.why, item.how, item.result].some(value => value.trim()));
    $('#roleProfileStatus').textContent = hasDetails ? 'SAVED HERE' : 'READY TO ADD';
    $('#storyCount').textContent = `${stories.length} / ${MAX_STORIES_PER_ROLE} stories for this role`;
    $('#addRoleStory').disabled = stories.length >= MAX_STORIES_PER_ROLE;
    $('#deleteRoleStory').textContent = stories.length === 1 ? 'Clear this story' : 'Delete this story';
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
      const actions = person.status === 'sent' ? `<button class="small-action" data-action="replied" data-person="${esc(person.id)}">Yes, got a reply</button><button class="small-action" data-action="no-reply" data-person="${esc(person.id)}">No reply yet</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open in Gmail ↗</button>` : `<button class="small-action" data-action="mark-sent" data-person="${esc(person.id)}">Mark sent · follow up in 2 days</button><button class="small-action" data-action="compose" data-person="${esc(person.id)}">Open in Gmail ↗</button>`;
      const resumeAction = `<button class="small-action" data-action="email-with-resume" data-person="${esc(person.id)}">Download email + resume</button><button class="small-action primary" data-action="gmail-draft" data-person="${esc(person.id)}" ${gmailDrafting.has(person.id) ? 'disabled' : ''}>${gmailDrafting.has(person.id) ? 'Creating Gmail draft…' : 'Create Gmail draft + resume'}</button>${person.gmailDraftId ? `<a class="small-action gmail-review-link" href="https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(person.gmailDraftId)}" target="_blank" rel="noopener noreferrer">Review Gmail draft ↗</a>` : ''}`;
      return `<article class="outreach-card"><div class="outreach-person"><span class="person-avatar">${esc(initials(person.name))}</span><span><strong>${esc(person.name || person.email || 'New contact')}</strong><small>${esc([person.role, person.company].filter(Boolean).join(' · ') || 'Role not set')}</small><small class="outreach-email">${esc(person.email || 'No email saved')}</small></span></div><div class="outreach-subject"><strong>${esc(person.subject || 'Untitled note')}</strong><small>${status} ${person.status === 'sent' ? `<span style="margin-left:5px">Sent ${new Date(person.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>` : ''}</small></div><div class="outreach-tools">${actions}${resumeAction}</div><details class="outreach-message"><summary>View saved message</summary><div class="outreach-message-body"><p>${esc(person.body || 'No message body saved.')}</p><div class="draft-actions"><button class="small-action" data-action="copy-subject" data-person="${esc(person.id)}">Copy subject</button><button class="small-action" data-action="copy-body" data-person="${esc(person.id)}">Copy body</button><button class="small-action" data-action="copy-all" data-person="${esc(person.id)}">Copy both</button></div></div></details></article>`;
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
  function openResumeDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('This browser does not support local resume storage.')); return; }
      const request = indexedDB.open(RESUME_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open browser file storage.'));
    });
  }
  async function saveResumeFile(file) {
    const db = await openResumeDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('assets', 'readwrite');
        transaction.objectStore('assets').put(file, 'resume');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Resume save was cancelled.'));
      });
    } finally { db.close(); }
  }
  async function getResumeFile() {
    const db = await openResumeDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('assets', 'readonly').objectStore('assets').get('resume');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }
  async function deleteResumeFile() {
    const db = await openResumeDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('assets', 'readwrite');
        transaction.objectStore('assets').delete('resume');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Resume removal was cancelled.'));
      });
    } finally { db.close(); }
  }
  async function renderResumeStatus() {
    try {
      const file = await getResumeFile();
      $('#resumeStatus').textContent = file ? `Saved on this device: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB).` : 'No resume saved.';
      $('#removeResume').hidden = !file;
    } catch {
      $('#resumeStatus').textContent = 'Resume storage is unavailable in this browser.';
      $('#removeResume').hidden = true;
    }
  }
  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    return btoa(binary);
  }
  async function downloadEmailWithResume(person) {
    if (!person.email || !person.subject || !person.body) { showToast('This saved email is missing its address or message.'); return; }
    let resume;
    try { resume = await getResumeFile(); }
    catch { showToast('Could not read the saved resume from this browser.'); return; }
    if (!resume) { showToast('Add your resume first in My profile.'); return; }
    const boundary = `goodsend-${crypto.randomUUID()}`;
    const subject = bytesToBase64(new TextEncoder().encode(person.subject));
    const body = bytesToBase64(new TextEncoder().encode(person.body.replace(/\r?\n/g, '\r\n')));
    const attachment = bytesToBase64(new Uint8Array(await resume.arrayBuffer()));
    const safeFilename = resume.name.replace(/[\r\n"]/g, '_');
    const fallbackFilename = safeFilename.replace(/[^\x20-\x7E]/g, '_').replace(/[\\;]/g, '_');
    const encodedFilename = encodeURIComponent(safeFilename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const mimeType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(resume.type) ? resume.type : 'application/octet-stream';
    const wrap = value => value.match(/.{1,76}/g)?.join('\r\n') || '';
    const eml = [
      `To: ${person.email}`,
      `Subject: =?UTF-8?B?${subject}?=`,
      'X-Unsent: 1',
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap(body),
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${fallbackFilename}"; name*=UTF-8''${encodedFilename}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      '',
      wrap(attachment),
      `--${boundary}--`,
      ''
    ].join('\r\n');
    const link = document.createElement('a');
    const safeName = (person.name || 'outreach').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'outreach';
    link.href = URL.createObjectURL(new Blob([eml], { type: 'message/rfc822' }));
    link.download = `${safeName}-email.eml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    showToast('Email file with resume downloaded. Open it in your mail app to review and send.');
  }
  function renderGmailStatus(message = '') {
    const connected = Boolean(gmailSession.accessToken && Date.now() < gmailSession.expiresAt);
    $('#gmailStatus').textContent = message || (connected ? 'Connected for this browser session.' : gmailSettings.clientId ? 'Gmail is not connected. Connect to create an attached draft.' : 'Add your Google OAuth client ID, then connect Gmail.');
    $('#disconnectGmail').hidden = !connected;
    $('#connectGmail').textContent = connected ? 'Reconnect Gmail' : 'Connect Gmail';
  }
  function saveGmailSettings() {
    const clientId = $('#gmailClientId').value.trim();
    if (gmailSettings.clientId && gmailSettings.clientId !== clientId) disconnectGmail();
    gmailSettings.clientId = clientId;
    try {
      localStorage.setItem(GMAIL_PREFS_KEY, JSON.stringify(gmailSettings));
      renderGmailStatus(gmailSettings.clientId ? 'Gmail settings saved on this device.' : 'Add your Google OAuth client ID, then connect Gmail.');
      showToast('Gmail settings saved on this device.');
    } catch {
      renderGmailStatus('Browser storage could not save Gmail settings.');
      showToast('Could not save Gmail settings in this browser.');
    }
  }
  function requestGmailAccessToken() {
    if (!gmailSettings.clientId) return Promise.reject(new Error('Add and save your Google OAuth client ID in My profile first.'));
    if (!window.google?.accounts?.oauth2) return Promise.reject(new Error('Google sign-in did not load. Check your connection or content blocker, then reload the page.'));
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: gmailSettings.clientId,
        scope: 'https://www.googleapis.com/auth/gmail.compose',
        callback: response => {
          if (response.error || !response.access_token) { reject(new Error(response.error_description || response.error || 'Google did not grant Gmail draft access.')); return; }
          gmailSession = { accessToken: response.access_token, expiresAt: Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000 };
          renderGmailStatus();
          resolve(gmailSession.accessToken);
        },
        error_callback: error => reject(new Error(error.message || 'Google sign-in was closed or blocked.'))
      });
      client.requestAccessToken();
    });
  }
  async function gmailAccessToken() {
    if (gmailSession.accessToken && Date.now() < gmailSession.expiresAt) return gmailSession.accessToken;
    return requestGmailAccessToken();
  }
  async function connectGmail() {
    saveGmailSettings();
    if (!gmailSettings.clientId) return;
    renderGmailStatus('Waiting for Google authorization…');
    try { await requestGmailAccessToken(); showToast('Gmail connected for this browser session.'); }
    catch (error) { renderGmailStatus(error.message); showToast(error.message); }
  }
  function disconnectGmail() {
    const oldToken = gmailSession.accessToken;
    gmailSession = { accessToken: '', expiresAt: 0 };
    if (oldToken && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(oldToken, () => {});
    renderGmailStatus('Gmail disconnected.');
    showToast('Gmail access cleared.');
  }
  async function makeGmailRawMessage(person, resume) {
    const boundary = `goodsend-${crypto.randomUUID()}`;
    const safeSubject = (person.subject || '').replace(/[\r\n]+/g, ' ');
    const encodedSubject = bytesToBase64(new TextEncoder().encode(safeSubject));
    const body = bytesToBase64(new TextEncoder().encode((person.body || '').replace(/\r?\n/g, '\r\n')));
    const attachment = bytesToBase64(new Uint8Array(await resume.arrayBuffer()));
    const safeFilename = resume.name.replace(/[\r\n"]/g, '_');
    const fallbackFilename = safeFilename.replace(/[^\x20-\x7E]/g, '_').replace(/[\\;]/g, '_');
    const encodedFilename = encodeURIComponent(safeFilename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const mimeType = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(resume.type) ? resume.type : 'application/octet-stream';
    const wrap = value => value.match(/.{1,76}/g)?.join('\r\n') || '';
    const mime = [
      `To: ${person.email}`,
      `Subject: =?UTF-8?B?${encodedSubject}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap(body),
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="${fallbackFilename}"; name*=UTF-8\'\'${encodedFilename}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fallbackFilename}"; filename*=UTF-8\'\'${encodedFilename}`,
      '',
      wrap(attachment),
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return bytesToBase64(new TextEncoder().encode(mime)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function createGmailDraftWithResume(person) {
    if (!person.email || !validEmail(person.email) || !person.subject || !person.body) { showToast('Add a valid email, subject, and message before creating a Gmail draft.'); return; }
    if (gmailDrafting.has(person.id)) return;
    gmailDrafting.add(person.id); renderPeople(); renderOutreach();
    try {
      const token = await gmailAccessToken();
      const resume = await getResumeFile();
      if (!resume) throw new Error('Add your resume first in My profile.');
      const raw = await makeGmailRawMessage(person, resume);
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw } })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || `Gmail returned ${response.status}. Check API access and OAuth setup.`);
      person.gmailDraftId = result.id;
      person.gmailDraftCreatedAt = new Date().toISOString();
      persist(); renderPeople(); renderOutreach();
      showToast('Gmail draft created with your resume attached. Open it in Gmail to review and send.');
    } catch (error) {
      showToast(error.message || 'Could not create a Gmail draft.');
    } finally {
      gmailDrafting.delete(person.id); renderPeople(); renderOutreach();
    }
  }
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
    const roleProfile = person.role ? (state.roleProfiles[person.role] || []).filter(story => [story.title, story.built, story.why, story.how, story.result].some(value => value.trim())) : [];
    return {
      senderName: state.senderName.trim(), senderFocus: state.senderFocus.trim(), senderExperience: state.senderContext.trim(),
      roleProfile, framingStyle: state.selectedStyleId || 'natural', voiceGuide: (state.voiceGuide || '').trim(),
      recipientName: person.name.trim(), targetRole: person.role, company: person.company.trim(), recipientContext: person.context.trim(), customDirection: state.customPrompt.trim()
    };
  }
  async function generatePerson(person) {
    const context = buildContext(person);
    const result = await runGoodsendAgent({ context, styleInstruction: getWritingStyle(context.framingStyle).instructions, requestCompletion });
    person.subject = result.subject.trim(); person.body = result.body.trim(); person.status = 'draft'; person.sentAt = null; person.followUpAt = null; person.error = '';
  }
  function waitForQueue(ms) {
    return new Promise(resolve => {
      queueWake = resolve;
      queueTimer = setTimeout(() => { queueTimer = null; queueWake = null; resolve(); }, ms);
    });
  }
  function wakeQueue() {
    if (queueTimer) clearTimeout(queueTimer);
    queueTimer = null;
    const wake = queueWake;
    queueWake = null;
    wake?.();
  }
  async function runQueue() {
    if (queueLoopActive || !state.queue || state.queue.status !== 'running') return;
    queueLoopActive = true;
    generatingAll = true;
    try {
      while (state.queue?.status === 'running' && state.queue.index < state.queue.ids.length) {
        const queue = state.queue;
        const person = state.people.find(item => item.id === queue.ids[queue.index]);
        if (!person) { queue.index++; persist(); continue; }
        if (!validEmail(person.email)) {
          person.error = `Skipped: add a valid email address${person.name ? ` for ${person.name}` : ''}, then run this contact separately.`;
          queue.index++;
          persist(); renderPeople();
        } else {
          person.error = '';
          generatingPeople.add(person.id);
          let retryCurrent = false;
          renderPeople();
          try {
            await generatePerson(person);
            archiveGeneratedPerson(person);
          } catch (error) {
            person.error = error.message || 'Something went wrong while generating this note.';
            if (/(?:\b429\b|rate.?limit|too many requests)/i.test(person.error)) {
              retryCurrent = true;
              if (queue.status === 'running') {
                queue.pauseReason = 'The model provider rate-limited this run. Wait for its limit window, then resume to retry this contact.';
                queue.status = 'paused';
                queue.nextRunAt = 0;
              }
            }
          } finally {
            generatingPeople.delete(person.id);
            if (!retryCurrent) queue.index++;
            persist(); renderPeople();
          }
        }
        if (queue.status !== 'running') break;
        if (queue.index < queue.ids.length) {
          queue.nextRunAt = Date.now() + queue.interval * 1000;
          persist(); renderQueue();
          await waitForQueue(queue.interval * 1000);
          queue.nextRunAt = 0;
          persist(); renderQueue();
        }
      }
      if (state.queue?.status === 'running' && state.queue.index >= state.queue.ids.length) {
        state.queue.status = 'complete';
        state.queue.nextRunAt = 0;
        ensureComposeRow();
        persist();
        showToast('Paced run complete. Generated drafts are saved in Outreach.');
      }
      if (state.queue?.status === 'stopped' && state.queue.index >= state.queue.ids.length) ensureComposeRow();
    } finally {
      generatingAll = false;
      queueLoopActive = false;
      renderPeople();
    }
  }
  function generateAll() {
    if (!api.key) { openSettings(); showToast('Connect your own API key to write notes.'); return; }
    if (generatingPeople.size) { showToast('Wait for the current note to finish writing.'); return; }
    if (state.queue?.status === 'running') return;
    const pausedQueue = state.queue?.status === 'paused' && state.queue.index < state.queue.ids.length;
    if (pausedQueue) {
      state.queue.status = 'running';
      state.queue.pauseReason = '';
      state.queue.nextRunAt = 0;
    } else {
      const candidates = state.people.filter(person => person.email || person.name || person.role || person.company || person.context);
      if (!candidates.length) { showToast('Add a person before writing notes.'); return; }
      const seen = new Set();
      for (const person of candidates) {
        const normalizedEmail = person.email.trim().toLowerCase();
        if (validEmail(normalizedEmail) && seen.has(normalizedEmail)) { showToast(`There are duplicate contact emails: ${normalizedEmail}. Keep each contact address unique.`); return; }
        if (validEmail(normalizedEmail)) seen.add(normalizedEmail);
      }
      state.queue = { ids: candidates.map(person => person.id), index: 0, status: 'running', interval: state.queueIntervalSeconds || 30, pauseReason: '', nextRunAt: 0 };
    }
    persist(); renderQueue();
    void runQueue();
  }
  function pauseQueue() {
    if (!state.queue || state.queue.status !== 'running') return;
    state.queue.status = 'paused';
    state.queue.nextRunAt = 0;
    persist();
    wakeQueue();
    renderQueue();
  }
  function stopQueue() {
    if (!state.queue || !['running', 'paused'].includes(state.queue.status)) return;
    state.queue.status = 'stopped';
    state.queue.nextRunAt = 0;
    persist();
    wakeQueue();
    renderQueue();
    if (!queueLoopActive) renderPeople();
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
    const gmail = new URL('https://mail.google.com/mail/');
    gmail.searchParams.set('view', 'cm');
    gmail.searchParams.set('fs', '1');
    gmail.searchParams.set('to', person.email || '');
    gmail.searchParams.set('su', person.subject || '');
    gmail.searchParams.set('body', person.body || '');
    window.open(gmail.toString(), '_blank', 'noopener,noreferrer');
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
    if (action === 'email-with-resume') downloadEmailWithResume(person);
    if (action === 'gmail-draft') createGmailDraftWithResume(person);
    if (action === 'mark-sent') markSent(person);
    if (action === 'replied') { person.status = 'replied'; person.repliedAt = new Date().toISOString(); persist(); renderPeople(); showToast('Reply recorded. Nice.'); }
    if (action === 'no-reply') { person.replyCheck = 'no_reply'; person.followUpAt = new Date(Date.now() + FOLLOW_UP_DAYS * 86400000).toISOString(); persist(); renderPeople(); showToast('No reply yet. We’ll remind you to check again in two days.'); }
  }

  renderPeople();
  window.setInterval(updateSummary, 60000);
  window.setInterval(() => { if (state.queue?.status === 'running' && state.queue.nextRunAt) renderQueue(); }, 1000);
  $('#senderName').value = state.senderName; $('#senderFocus').value = state.senderFocus; $('#senderContext').value = state.senderContext; $('#customPrompt').value = state.customPrompt; $('#promptChars').textContent = `${state.customPrompt.length} / 500`; $('#voiceGuide').value = state.voiceGuide || ''; $('#voiceGuideChars').textContent = `${(state.voiceGuide || '').length} / 1000`;
  setApiStatus();
  updateSidebar();
  renderRoleProfile();
  renderResumeStatus();
  $('#gmailClientId').value = gmailSettings.clientId;
  $('#gmailOrigin').textContent = window.location.origin;
  renderGmailStatus();
  renderWritingStyles();
  updatePage();
  $('#peopleList').addEventListener('input', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (!card || !field) return; const person = personById(card.dataset.person); if (!person) return; person[field] = event.target.value; persist(); if (field === 'name' || field === 'email') renderOutreach(); });
  $('#peopleList').addEventListener('change', event => { const card = event.target.closest('[data-person]'); const field = event.target.dataset.field; if (card && field) { const person = personById(card.dataset.person); if (person) { person[field] = event.target.value; persist(); } } });
  $('#peopleList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.closest('[data-person]')?.dataset.person); });
  $('#outreachList').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button.dataset.action, button.dataset.person); });
  $('#addPerson').addEventListener('click', () => { if (state.people.length >= MAX_PEOPLE) return; state.people.push(newPerson()); persist(); renderPeople(); $('#peopleList article:last-child [data-field="name"]').focus(); });
  for (const [id, key] of [['senderName','senderName'], ['senderFocus','senderFocus'], ['senderContext','senderContext']]) $(`#${id}`).addEventListener('input', event => { state[key] = event.target.value; persist(); });
  $('#customPrompt').addEventListener('input', event => { state.customPrompt = event.target.value.slice(0, 500); if (event.target.value.length > 500) event.target.value = state.customPrompt; $('#promptChars').textContent = `${state.customPrompt.length} / 500`; persist(); });
  $('#voiceGuide').addEventListener('input', event => { state.voiceGuide = event.target.value.slice(0, 1000); if (event.target.value.length > 1000) event.target.value = state.voiceGuide; $('#voiceGuideChars').textContent = `${state.voiceGuide.length} / 1000`; persist(); });
  $('#queueInterval').addEventListener('change', event => { state.queueIntervalSeconds = [30, 45, 60, 90].includes(Number(event.target.value)) ? Number(event.target.value) : 30; if (state.queue?.status === 'paused') state.queue.interval = state.queueIntervalSeconds; persist(); renderQueue(); });
  $('#pauseQueue').addEventListener('click', pauseQueue);
  $('#stopQueue').addEventListener('click', stopQueue);
  $('#roleProfileRole').addEventListener('change', event => {
    state.roleProfileEditorRole = event.target.value;
    state.roleProfileEditorStoryId = state.roleProfiles[state.roleProfileEditorRole][0].id;
    persist(); renderRoleProfile();
  });
  $('#roleProfileStory').addEventListener('change', event => { state.roleProfileEditorStoryId = event.target.value; persist(); renderRoleProfile(); });
  $('#addRoleStory').addEventListener('click', () => {
    const stories = state.roleProfiles[state.roleProfileEditorRole];
    if (stories.length >= MAX_STORIES_PER_ROLE) return;
    const story = newRoleStory(); stories.push(story); state.roleProfileEditorStoryId = story.id;
    persist(); renderRoleProfile(); $('#storyTitle').focus();
  });
  $('#deleteRoleStory').addEventListener('click', () => {
    const stories = state.roleProfiles[state.roleProfileEditorRole];
    if (stories.length === 1) {
      Object.assign(stories[0], { title: '', built: '', why: '', how: '', result: '' });
      showToast('Story cleared.');
    } else {
      state.roleProfiles[state.roleProfileEditorRole] = stories.filter(story => story.id !== state.roleProfileEditorStoryId);
      state.roleProfileEditorStoryId = state.roleProfiles[state.roleProfileEditorRole][0].id;
      showToast('Story deleted.');
    }
    persist(); renderRoleProfile();
  });
  for (const field of ['title', 'built', 'why', 'how', 'result']) $(`#story${field[0].toUpperCase()}${field.slice(1)}`).addEventListener('input', event => {
    const stories = state.roleProfiles[state.roleProfileEditorRole];
    const story = stories.find(item => item.id === state.roleProfileEditorStoryId);
    if (!story) return;
    const maxLength = field === 'title' ? 60 : 800;
    story[field] = event.target.value.slice(0, maxLength);
    if (event.target.value.length > maxLength) event.target.value = story[field];
    const index = stories.indexOf(story);
    $('#roleProfileStory').options[index].textContent = story.title.trim() || `Story ${index + 1}`;
    $('#roleProfileStatus').textContent = stories.some(item => [item.title, item.built, item.why, item.how, item.result].some(value => value.trim())) ? 'SAVED HERE' : 'READY TO ADD';
    persist();
  });
  $('#resumeFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) { showToast('Choose a PDF, DOC, or DOCX resume.'); event.target.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { showToast('Keep your resume under 10 MB.'); event.target.value = ''; return; }
    try {
      await saveResumeFile(file); await renderResumeStatus(); showToast('Resume saved on this device.');
    } catch (error) {
      showToast(error.message || 'Could not save the resume in this browser.');
    }
    event.target.value = '';
  });
  $('#removeResume').addEventListener('click', async () => {
    try { await deleteResumeFile(); await renderResumeStatus(); showToast('Saved resume removed.'); }
    catch { showToast('Could not remove the saved resume.'); }
  });
  $('#saveGmailSettings').addEventListener('click', saveGmailSettings);
  $('#connectGmail').addEventListener('click', connectGmail);
  $('#disconnectGmail').addEventListener('click', disconnectGmail);
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
  $('#clearOutreach').addEventListener('click', () => { if (queueLoopActive || generatingPeople.size) { showToast('Wait for the current draft to finish, then clear the workspace.'); return; } if (!confirm('Clear every person, draft, profile, follow-up, and saved resume from this browser? This cannot be undone.')) return; wakeQueue(); localStorage.removeItem(STORE_KEY); deleteResumeFile().then(renderResumeStatus).catch(() => {}); state = { senderName: '', senderFocus: '', senderContext: '', customPrompt: '', voiceGuide: '', queueIntervalSeconds: 30, queue: null, roleProfiles: normalizeRoleProfiles({}), roleProfileEditorRole: roles[0], roleProfileEditorStoryId: '', writingStyles: [], selectedStyleId: 'natural', people: [newPerson()], outreach: [] }; state.roleProfileEditorStoryId = state.roleProfiles[roles[0]][0].id; $('#senderName').value = ''; $('#senderFocus').value = ''; $('#senderContext').value = ''; $('#customPrompt').value = ''; $('#promptChars').textContent = '0 / 500'; $('#voiceGuide').value = ''; $('#voiceGuideChars').textContent = '0 / 1000'; renderRoleProfile(); renderResumeStatus(); renderWritingStyles(); renderPeople(); showToast('Workspace cleared.'); });
})();
