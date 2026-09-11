/* ============================================================
   INTRADOS DESIGNS — Application Portal
   script.js — Login / Fresh Applicant / Application Form
   ============================================================ */

'use strict';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxteJu1b_okEFYv4jbSF4Ne55bOfBsyIiIx3tnAVHq833I1f7c7aGcn7VVck--VI_a8tg/exec";
const SHEET_ID    = '1Ep0ESBJb-QxzBfN2oxIAH0RFJOPvCsNb4NpvmyWOfDA';
const SHEET_TAB   = 'Initial Screening';

// Assessment-list is a SEPARATE repo from this one — if the actual
// URL differs from the GitHub Pages default below (e.g. once a
// custom domain path is set up for it), update this to match.
const HOME_PAGE_URL = 'https://intrados-technology.github.io/Assessment-list/';

const DOM = {
  landingSection: document.getElementById('landing-section'),
  loginSection:   document.getElementById('login-section'),
  appSection:     document.getElementById('application-section'),
  confSection:    document.getElementById('confirmation-section'),

  btnShowLogin: document.getElementById('btn-show-login'),
  btnShowApply: document.getElementById('btn-show-apply'),
  btnLoginBack: document.getElementById('btn-login-back'),

  loginRefId:   document.getElementById('login-refid'),
  loginEmail:   document.getElementById('login-email'),
  errLoginRefId:document.getElementById('err-login-refid'),
  errLoginEmail:document.getElementById('err-login-email'),
  btnLogin:     document.getElementById('btn-login'),

  btnSubmitApp: document.getElementById('btn-submit-application'),
  appRefId:     document.getElementById('app-ref-id')
};

// ── Section Switching ────────────────────────────────────────────
function showSection(section) {
  DOM.landingSection.style.display = 'none';
  DOM.loginSection.style.display   = 'none';
  DOM.appSection.style.display     = 'none';
  DOM.confSection.style.display    = 'none';
  section.style.display = 'block';
  window.scrollTo(0, 0);
}

DOM.btnShowLogin.addEventListener('click', () => showSection(DOM.loginSection));
DOM.btnShowApply.addEventListener('click', () => showSection(DOM.appSection));
DOM.btnLoginBack.addEventListener('click', () => showSection(DOM.landingSection));

// ── Login Flow ───────────────────────────────────────────────────
function setLoginError(field, msg) {
  const errEl = field === 'refid' ? DOM.errLoginRefId : DOM.errLoginEmail;
  const inputEl = field === 'refid' ? DOM.loginRefId : DOM.loginEmail;
  errEl.textContent = msg || '';
  errEl.classList.toggle('show', !!msg);
  inputEl.classList.toggle('error', !!msg);
}

DOM.btnLogin.addEventListener('click', async function() {
  const refId = DOM.loginRefId.value.trim();
  const email = DOM.loginEmail.value.trim();
  setLoginError('refid', '');
  setLoginError('email', '');

  if (!refId) { setLoginError('refid', 'Please enter your Reference ID.'); return; }
  if (!email) { setLoginError('email', 'Please enter your email.'); return; }

  DOM.btnLogin.disabled = true;
  DOM.btnLogin.querySelector('span').textContent = 'Checking...';

  try {
    const safeRefId = refId.replace(/'/g, "\\'");
    const query = "select B,C,F,Z where B = '" + safeRefId + "'";
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(SHEET_TAB) +
      '&tq=' + encodeURIComponent(query);

    const resp = await fetch(url);
    const text = await resp.text();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const json  = JSON.parse(text.substring(start, end + 1));
    const rows  = json && json.table && json.table.rows;

    if (!rows || rows.length === 0) {
      setLoginError('refid', 'We could not find an application matching that Reference ID and Email. Please check and try again.');
      return;
    }

    const cells = rows[0].c;
    const fullName    = cells[1] && cells[1].v ? String(cells[1].v).trim() : '';
    const storedEmail = cells[2] && cells[2].v ? String(cells[2].v).trim().toLowerCase() : '';
    const remarks     = cells[3] && cells[3].v ? String(cells[3].v).trim().toLowerCase() : '';

    if (!fullName || storedEmail !== email.toLowerCase()) {
      setLoginError('refid', 'We could not find an application matching that Reference ID and Email. Please check and try again.');
      return;
    }

    if (remarks === 'approved') {
      // Store session so subsequent pages (same origin) can auto-fill.
      localStorage.setItem('ids_app_session', JSON.stringify({ refId: refId, email: email, fullName: fullName }));
      window.location.href = HOME_PAGE_URL;
      return;
    }

    if (remarks === 'rejected') {
      setLoginError('refid', 'Thank you for your interest. After reviewing your application, we will not be proceeding at this time.');
      return;
    }

    setLoginError('refid', 'Your application is still under review. We will notify you once a decision has been made.');

  } catch (err) {
    setLoginError('refid', 'Something went wrong while checking your login. Please try again.');
    console.warn('[IDS] Login error:', err);
  } finally {
    DOM.btnLogin.disabled = false;
    DOM.btnLogin.querySelector('span').textContent = 'Log In';
  }
});

// ── Application Form ─────────────────────────────────────────────
const requiredFields = [
  'app-fullname', 'app-phone', 'app-whatsapp', 'app-email', 'app-location',
  'app-position', 'app-domain', 'app-totalexp', 'app-relevantexp', 'app-skills',
  'app-employed', 'app-notice', 'app-joindate', 'app-reasonchange', 'app-expsalary',
  'app-negotiate', 'app-office5day', 'app-otheroffers', 'app-staylong', 'app-nextrole'
];

function validateField(el) {
  const errEl = document.getElementById('err-' + el.id.replace('app-', ''));
  const value = el.value.trim();
  let msg = '';

  if (!value) {
    msg = 'This field is required.';
  } else if (el.id === 'app-phone' || el.id === 'app-whatsapp') {
    if (!/^\d{10}$/.test(value)) msg = 'Please enter a valid 10-digit number.';
  } else if (el.id === 'app-email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) msg = 'Please enter a valid email address.';
  }

  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.toggle('show', !!msg);
  }
  el.classList.toggle('error', !!msg);
  return !msg;
}

function checkFormValidity() {
  let allValid = true;
  requiredFields.forEach(function(id) {
    const el = document.getElementById(id);
    if (!el.value.trim()) allValid = false;
  });
  // Also check format validity of phone/whatsapp/email without re-showing errors
  const phone = document.getElementById('app-phone').value.trim();
  const whatsapp = document.getElementById('app-whatsapp').value.trim();
  const email = document.getElementById('app-email').value.trim();
  if (phone && !/^\d{10}$/.test(phone)) allValid = false;
  if (whatsapp && !/^\d{10}$/.test(whatsapp)) allValid = false;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) allValid = false;

  DOM.btnSubmitApp.disabled = !allValid;
  const icon = document.getElementById('btn-submit-icon');
  const text = document.getElementById('btn-submit-text');
  if (allValid) {
    icon.textContent = '✓';
    text.textContent = 'Submit Application';
  } else {
    icon.textContent = '🔒';
    text.textContent = 'Fill all required fields to continue';
  }
}

requiredFields.forEach(function(id) {
  const el = document.getElementById(id);
  const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
  el.addEventListener(evt, function() {
    validateField(el);
    checkFormValidity();
  });
});

DOM.btnSubmitApp.addEventListener('click', async function() {
  console.log('[IDS-APP-DEBUG] Submit clicked');
  DOM.btnSubmitApp.disabled = true;
  document.getElementById('btn-submit-text').textContent = 'Submitting...';

  const totalExp = parseFloat(document.getElementById('app-totalexp').value) || 0;
  const experienceLevel = totalExp < 1 ? 'Fresher' : 'Experienced';

  const formData = {
    fullName:            document.getElementById('app-fullname').value.trim(),
    phone:                document.getElementById('app-phone').value.trim(),
    whatsapp:             document.getElementById('app-whatsapp').value.trim(),
    email:                document.getElementById('app-email').value.trim(),
    currentLocation:      document.getElementById('app-location').value.trim(),
    currentCompany:       document.getElementById('app-company').value.trim(),
    positionApplyingFor:  document.getElementById('app-position').value.trim(),
    domain:               document.getElementById('app-domain').value.trim(),
    totalExperience:      totalExp,
    experienceLevel:      experienceLevel,
    relevantExperience:   document.getElementById('app-relevantexp').value.trim(),
    keySkills:            document.getElementById('app-skills').value.trim(),
    currentlyEmployed:    document.getElementById('app-employed').value.trim(),
    noticePeriod:         document.getElementById('app-notice').value.trim(),
    canJoinOn:            document.getElementById('app-joindate').value.trim(),
    reasonForChange:      document.getElementById('app-reasonchange').value.trim(),
    currentSalary:        document.getElementById('app-currsalary').value.trim(),
    expectedSalary:       document.getElementById('app-expsalary').value.trim(),
    openToNegotiate:      document.getElementById('app-negotiate').value.trim(),
    comfortable5Day:      document.getElementById('app-office5day').value.trim(),
    otherOffers:          document.getElementById('app-otheroffers').value.trim(),
    longTermStayReason:   document.getElementById('app-staylong').value.trim(),
    nextRoleInterest:     document.getElementById('app-nextrole').value.trim()
  };
  console.log('[IDS-APP-DEBUG] formData built:', formData);

  // ── Generate Reference ID (same pattern used across the whole system) ──
  const year = new Date().getFullYear();
  var referenceId = 'IDS/JOB/' + year + '/001';

  try {
    console.log('[IDS-APP-DEBUG] Fetching last RefID from sheet:', SHEET_ID, SHEET_TAB);
    const query = encodeURIComponent('SELECT B LIMIT 1000');
    const feedUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(SHEET_TAB) + '&tq=' + query;

    const resp = await fetch(feedUrl);
    const text = await resp.text();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    const json  = JSON.parse(text.substring(start, end + 1));
    const rows  = json && json.table && json.table.rows;

    if (rows && rows.length > 0) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (!rows[i].c || !rows[i].c[0] || !rows[i].c[0].v) continue;
        const cellVal = String(rows[i].c[0].v).trim();
        const match = cellVal.match(/^IDS\/JOB\/\d{4}\/(\d+)$/);
        if (match) {
          const nextSerial = parseInt(match[1], 10) + 1;
          referenceId = 'IDS/JOB/' + year + '/' + String(nextSerial).padStart(3, '0');
          break;
        }
      }
    }
    console.log('[IDS-APP-DEBUG] RefID generated:', referenceId);
  } catch (err) {
    console.log('[IDS-APP-DEBUG] RefID generation FAILED:', err.message);
    referenceId = 'IDS/JOB/' + year + '/' + String(Date.now() % 100000).padStart(5, '0');
  }

  const submissionTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // ── Submit to Apps Script (fire and forget, matches rest of system) ──
  console.log('[IDS-APP-DEBUG] About to POST to SCRIPT_URL:', SCRIPT_URL);
  try {
    const postBody = JSON.stringify(Object.assign({
      sheetName: 'Initial Screening',
      referenceId: referenceId,
      submissionTime: submissionTime
    }, formData));
    console.log('[IDS-APP-DEBUG] POST body:', postBody);

    const fetchPromise = fetch(SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: postBody
    });
    console.log('[IDS-APP-DEBUG] fetch() called, awaiting...');
    await fetchPromise;
    console.log('[IDS-APP-DEBUG] fetch() completed without throwing (no-cors — response is opaque, this only confirms no network-level error)');
  } catch (err) {
    console.log('[IDS-APP-DEBUG] fetch() THREW:', err.message);
  }

  console.log('[IDS-APP-DEBUG] Showing confirmation screen now');
  DOM.appRefId.textContent = referenceId;
  showSection(DOM.confSection);
});
