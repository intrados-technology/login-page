/* ============================================================
   INTRADOS DESIGNS — Application Portal
   script.js — Login / Fresh Applicant / Application Form
   ============================================================ */

'use strict';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxteJu1b_okEFYv4jbSF4Ne55bOfBsyIiIx3tnAVHq833I1f7c7aGcn7VVck--VI_a8tg/exec";
const SHEET_ID    = '1Ep0ESBJb-QxzBfN2oxIAH0RFJOPvCsNb4NpvmyWOfDA';
const SHEET_TAB   = 'Initial Screening';

// Assessment-list is a SEPARATE repo — verification happens HERE on
// login-page, and only on success do we redirect there. Assessment-list
// itself has no login of its own; it trusts this redirect.
const HOME_PAGE_URL = 'https://intrados-technology.github.io/Assessment-list/';

const DOM = {
  landingSection: document.getElementById('landing-section'),
  loginSection:   document.getElementById('login-section'),
  appSection:     document.getElementById('application-section'),
  confSection:    document.getElementById('confirmation-section'),
  reviewerLoginSection: document.getElementById('reviewer-login-section'),
  reviewerChangePasswordSection: document.getElementById('reviewer-change-password-section'),
  reviewerDashboardSection: document.getElementById('reviewer-dashboard-section'),

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
  DOM.reviewerLoginSection.style.display = 'none';
  DOM.reviewerChangePasswordSection.style.display = 'none';
  DOM.reviewerDashboardSection.style.display = 'none';
  section.style.display = 'block';
  window.scrollTo(0, 0);
}

DOM.btnShowLogin.addEventListener('click', () => showSection(DOM.loginSection));
DOM.btnShowApply.addEventListener('click', () => showSection(DOM.appSection));
DOM.btnLoginBack.addEventListener('click', () => showSection(DOM.landingSection));

document.getElementById('btn-reviewer-login').addEventListener('click', () => showSection(DOM.reviewerLoginSection));
document.getElementById('btn-reviewer-back').addEventListener('click', () => showSection(DOM.landingSection));

// ── Reviewer Login ───────────────────────────────────────────────
// Checked server-side via Apps Script (doGet action=reviewerLogin),
// NOT via the public gviz sheet-read pattern used elsewhere in this
// system — that keeps the "Reviewers" sheet's contents (including
// passwords) from ever being exposed through a publicly queryable
// endpoint.
function reviewerGvizFetch(actionParams, onSuccess, onFail) {
  const callbackName = 'idsReviewerCallback_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  let settled = false;

  const cleanup = function() {
    delete window[callbackName];
    const tag = document.getElementById(callbackName);
    if (tag) tag.remove();
    clearTimeout(timeoutRef);
  };

  const timeoutRef = setTimeout(function() {
    if (settled) return;
    settled = true;
    cleanup();
    onFail('Could not reach the login service. Check your connection and try again.');
  }, 12000);

  window[callbackName] = function(response) {
    if (settled) return;
    settled = true;
    cleanup();
    onSuccess(response);
  };

  const query = Object.keys(actionParams).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(actionParams[k]);
  }).join('&');

  const url = SCRIPT_URL + '?' + query + '&callback=' + callbackName;

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = url;
  script.onerror = function() {
    if (settled) return;
    settled = true;
    cleanup();
    onFail('Could not reach the login service. Please try again.');
  };
  document.body.appendChild(script);
}

function setReviewerError(msg) {
  const el = document.getElementById('reviewer-login-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// Holds the currently-logging-in reviewer's identity across the
// login → (optional) change-password → dashboard flow.
const reviewerSession = { email: '', password: '', name: '' };

document.getElementById('btn-reviewer-submit').addEventListener('click', function() {
  const email = document.getElementById('reviewer-email').value.trim();
  const password = document.getElementById('reviewer-password').value;
  setReviewerError('');

  if (!email || !password) {
    setReviewerError('Please enter both email and password.');
    return;
  }

  const btn = document.getElementById('btn-reviewer-submit');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Logging in...';

  reviewerGvizFetch(
    { action: 'reviewerLogin', email: email, password: password },
    function(response) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Log In';
      if (response && response.success) {
        reviewerSession.email    = email;
        reviewerSession.password = password;
        reviewerSession.name     = response.name || 'Reviewer';

        if (response.mustChangePassword) {
          showSection(DOM.reviewerChangePasswordSection);
        } else {
          document.getElementById('reviewer-welcome-heading').textContent =
            'Welcome, ' + reviewerSession.name;
          showSection(DOM.reviewerDashboardSection);
          loadReviewerDashboard();
        }
      } else {
        setReviewerError('Incorrect email or password.');
      }
    },
    function(errMsg) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Log In';
      setReviewerError(errMsg);
    }
  );
});

// ── Mandatory Change Password (first login only) ──────────────────
function setReviewerChangeError(msg) {
  const el = document.getElementById('reviewer-change-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

document.getElementById('btn-reviewer-change-password').addEventListener('click', function() {
  const newPassword     = document.getElementById('reviewer-new-password').value;
  const confirmPassword = document.getElementById('reviewer-confirm-password').value;
  setReviewerChangeError('');

  if (!newPassword || !confirmPassword) {
    setReviewerChangeError('Please fill in both fields.');
    return;
  }
  if (newPassword.length < 6) {
    setReviewerChangeError('Password must be at least 6 characters.');
    return;
  }
  if (newPassword !== confirmPassword) {
    setReviewerChangeError('Passwords do not match.');
    return;
  }
  if (newPassword === reviewerSession.password) {
    setReviewerChangeError('Please choose a different password from your current one.');
    return;
  }

  const btn = document.getElementById('btn-reviewer-change-password');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Saving...';

  reviewerGvizFetch(
    {
      action: 'reviewerChangePassword',
      email: reviewerSession.email,
      currentPassword: reviewerSession.password,
      newPassword: newPassword
    },
    function(response) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Set Password & Continue';
      if (response && response.success) {
        reviewerSession.password = newPassword;
        document.getElementById('reviewer-welcome-heading').textContent =
          'Welcome, ' + reviewerSession.name;
        showSection(DOM.reviewerDashboardSection);
        loadReviewerDashboard();
      } else {
        setReviewerChangeError('Something went wrong. Please try again.');
      }
    },
    function(errMsg) {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Set Password & Continue';
      setReviewerChangeError(errMsg);
    }
  );
});

// ── Reviewer Dashboard: candidate list ────────────────────────────
// Generic gviz select-query helper against the main assessment
// spreadsheet (public read, same as everywhere else in this system —
// this is candidate data, not reviewer credentials, so there's no
// sensitivity concern here).
async function gvizSelect(sheetTab, query) {
  const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
    '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheetTab) +
    '&tq=' + encodeURIComponent(query);
  const resp = await fetch(url);
  const text = await resp.text();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  const json  = JSON.parse(text.substring(start, end + 1));
  return (json && json.table && json.table.rows) || [];
}

async function loadReviewerDashboard() {
  const loadingEl = document.getElementById('reviewer-candidates-loading');
  const emptyEl   = document.getElementById('reviewer-candidates-empty');
  const groupEl   = document.getElementById('reviewer-candidates-group');
  const selectEl  = document.getElementById('reviewer-candidate-select');
  const btnProceed = document.getElementById('btn-reviewer-proceed');

  loadingEl.style.display = 'block';
  emptyEl.style.display = 'none';
  groupEl.style.display = 'none';
  btnProceed.style.display = 'none';
  selectEl.innerHTML = '';

  try {
    // B=Reference ID, C=Name, P=Total Score (blank until a reviewer
    // has actually scored that candidate's rubric).
    const rows = await gvizSelect('Tool Test', 'select B,C,P');

    if (!rows || rows.length === 0) {
      loadingEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    rows.forEach(function(row) {
      const cells = row.c;
      const refId = cells[0] && cells[0].v ? String(cells[0].v).trim() : '';
      const name  = cells[1] && cells[1].v ? String(cells[1].v).trim() : '';
      const totalScore = cells[2] && cells[2].v !== null && cells[2].v !== '' ? cells[2].v : null;
      if (!refId || !name) return;

      const reviewed = totalScore !== null;
      const option = document.createElement('option');
      option.value = refId;
      option.textContent = name + (reviewed ? ' (Review Completed)' : '');
      option.disabled = reviewed;
      selectEl.appendChild(option);
    });

    const firstEnabled = Array.from(selectEl.options).find(function(o) { return !o.disabled; });
    if (firstEnabled) selectEl.value = firstEnabled.value;

    loadingEl.style.display = 'none';
    groupEl.style.display = 'block';
    btnProceed.style.display = 'flex';
    btnProceed.disabled = !firstEnabled;

  } catch (err) {
    console.warn('[IDS] Reviewer dashboard load error:', err);
    loadingEl.textContent = 'Something went wrong loading candidates. Please refresh and try again.';
  }
}

document.getElementById('reviewer-candidate-select').addEventListener('change', function() {
  const btnProceed = document.getElementById('btn-reviewer-proceed');
  const selected = this.options[this.selectedIndex];
  btnProceed.disabled = !selected || selected.disabled;
});

// ── Login Flow ───────────────────────────────────────────────────
// Verified fresh every time — no session is stored. On success we
// simply navigate to Assessment-list, which has no gating logic of
// its own; this verification IS the gate.
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
      window.location.href = HOME_PAGE_URL + '?ref=' + encodeURIComponent(refId) + '&email=' + encodeURIComponent(email);
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

  // ── Generate Reference ID (same pattern used across the whole system) ──
  const year = new Date().getFullYear();
  var referenceId = 'IDS/JOB/' + year + '/001';

  try {
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
  } catch (err) {
    console.warn('[IDS] Could not read Initial Screening sheet for RefID:', err.message);
    referenceId = 'IDS/JOB/' + year + '/' + String(Date.now() % 100000).padStart(5, '0');
  }

  const submissionTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // ── Submit to Apps Script (fire and forget, matches rest of system) ──
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        sheetName: 'Initial Screening',
        referenceId: referenceId,
        submissionTime: submissionTime
      }, formData))
    });
  } catch (err) {
    console.warn('[IDS] Application submission error:', err);
  }

  DOM.appRefId.textContent = referenceId;
  showSection(DOM.confSection);
});
