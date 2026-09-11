(function () {
  'use strict';

  const API_BASE = document.documentElement.dataset.apiBase || '/api/v1/key';
  const STATS_ENDPOINT = document.documentElement.dataset.apiStats || '/api/v1/stats';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
        escapeHtml(loadingText || 'Please wait…');
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  function setContainerLoading(container, isLoading, label) {
    if (!container) return;
    if (isLoading) {
      container.innerHTML =
        '<div class="sx-loading">' +
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(label || 'Loading…') + '</span>' +
        '</div>';
    }
  }

  function showToast(message, variant) {
    const holder = document.getElementById('sx-toast-container');
    if (!holder) { console.log('[toast]', variant, message); return; }

    const el = document.createElement('div');
    el.className = 'toast align-items-center border-0 text-bg-' + (variant || 'primary');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('aria-atomic', 'true');
    el.innerHTML =
      '<div class="d-flex">' +
      '<div class="toast-body">' + escapeHtml(message) + '</div>' +
      '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' +
      '</div>';
    holder.appendChild(el);

    if (window.bootstrap && window.bootstrap.Toast) {
      const toast = new window.bootstrap.Toast(el, { delay: 5000 });
      el.addEventListener('hidden.bs.toast', () => el.remove());
      toast.show();
    } else {
      el.classList.add('show');
      setTimeout(() => el.remove(), 5000);
    }
  }

  function identifierToParams(raw) {
    const value = raw.trim().replace(/^0x/i, '');
    if (value.includes('@')) return { email: value };
    if (/^[0-9a-f]{40}$/i.test(value)) return { fingerprint: value };
    if (/^[0-9a-f]{16}$/i.test(value)) return { keyId: value };
    return { email: value };
  }

  async function apiRequest(method, params, body) {
    const url = new URL(API_BASE, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
    }
    const res = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (_) { /* non-JSON response */ } }

    if (!res.ok) {
      const message = (data && (data.message || data.error)) || res.statusText || 'Request failed';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchStats() {
    const url = new URL(STATS_ENDPOINT, window.location.origin);
    const res = await fetch(url.toString(), { method: 'GET' });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }
    if (!res.ok) {
      const message = (data && (data.message || data.error)) || res.statusText || 'Failed to fetch stats';
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    if (data && data.stats) return { ...data.stats, now: data.now || new Date().toISOString() };
    return { ...data, now: new Date().toISOString() };
  }

  let __sx_lastStats = null;

  function renderStatus(container, stats) {
    if (!container) return;
    const prev = __sx_lastStats || {};
    __sx_lastStats = stats;

    container.innerHTML = `
      <div class="card bg-body-secondary border">
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <h5 class="mb-0 me-3">Service status</h5>
            <small class="text-secondary">Updated ${escapeHtml(new Date(stats.now || Date.now()).toLocaleTimeString())}</small>
          </div>

          <div class="row g-3 align-items-stretch">
            <div class="col-6 col-sm-4 col-md-2 d-flex">
              <div class="flex-fill d-flex align-items-center gap-3 rounded sx-status-tile" data-key="totalKeys">
                <i class="bi bi-key-fill text-primary" aria-hidden="true"></i>
                <div>
                  <div class="small text-secondary">Total keys</div>
                  <div class="fw-bold sx-mono sx-status-val">${escapeHtml(stats.totalKeys)}</div>
                </div>
              </div>
            </div>

            <div class="col-6 col-sm-4 col-md-2 d-flex">
              <div class="flex-fill d-flex align-items-center gap-3 rounded sx-status-tile" data-key="keysWithVerified">
                <i class="bi bi-shield-check text-success" aria-hidden="true"></i>
                <div>
                  <div class="small text-secondary">Keys w/ verified</div>
                  <div class="fw-bold sx-mono sx-status-val">${escapeHtml(stats.keysWithVerified)}</div>
                </div>
              </div>
            </div>

            <div class="col-6 col-sm-4 col-md-2 d-flex">
              <div class="flex-fill d-flex align-items-center gap-3 rounded sx-status-tile" data-key="totalUserIds">
                <i class="bi bi-people-fill text-info" aria-hidden="true"></i>
                <div>
                  <div class="small text-secondary">User IDs</div>
                  <div class="fw-bold sx-mono sx-status-val">${escapeHtml(stats.totalUserIds)}</div>
                </div>
              </div>
            </div>

            <div class="col-6 col-sm-4 col-md-2 d-flex">
              <div class="flex-fill d-flex align-items-center gap-3 rounded sx-status-tile" data-key="totalVerifiedUserIds">
                <i class="bi bi-person-check text-success" aria-hidden="true"></i>
                <div>
                  <div class="small text-secondary">Verified UIDs</div>
                  <div class="fw-bold sx-mono sx-status-val">${escapeHtml(stats.totalVerifiedUserIds)}</div>
                </div>
              </div>
            </div>

            <div class="col-6 col-sm-4 col-md-2 d-flex">
              <div class="flex-fill d-flex align-items-center gap-3 rounded sx-status-tile" data-key="totalUnverifiedUserIds">
                <i class="bi bi-person-x text-warning" aria-hidden="true"></i>
                <div>
                  <div class="small text-secondary">Unverified UIDs</div>
                  <div class="fw-bold sx-mono sx-status-val">${escapeHtml(stats.totalUnverifiedUserIds)}</div>
                </div>
              </div>
            </div>

            <div class="col-6 col-sm-4 col-md-2 d-flex align-items-center">
              <button id="sx-refresh-stats" class="btn btn-outline-secondary btn-sm ms-auto">
                <i class="bi bi-arrow-clockwise"></i> Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    try {
      const tiles = container.querySelectorAll('.sx-status-tile');
      tiles.forEach(tile => {
        const key = tile.dataset.key;
        const newVal = stats && stats[key];
        const oldVal = prev && prev[key];
        if (oldVal !== undefined && String(oldVal) !== String(newVal)) {
          tile.classList.add('sx-pulse');
          setTimeout(() => tile.classList.remove('sx-pulse'), 1000);
        }
      });
    } catch (e) {}

    const refreshBtn = container.querySelector('#sx-refresh-stats');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async (e) => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Refreshing…';
        try {
          const result = await fetchStats();
          renderStatus(container, result);
        } catch (err) {
          console.error('Manual refresh failed', err);
        } finally {
          setTimeout(() => { refreshBtn.disabled = false; refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh'; }, 600);
        }
      });
    }
  }

  function setStatusLoading(container, isLoading) {
    if (!container) return;
    if (isLoading) {
      container.innerHTML = `
        <div class="card bg-body-secondary border">
          <div class="card-body">
            <div class="d-flex gap-2 align-items-center">
              <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <div class="text-secondary">Loading server statistics…</div>
            </div>
          </div>
        </div>`;
    }
  }

  function initStatus() {
    const container = document.getElementById('sx-status');
    if (!container) return;
    async function loadAndRender() {
      try {
        setStatusLoading(container, true);
        const result = await fetchStats();
        renderStatus(container, result);
      } catch (err) {
        container.innerHTML = `
          <div class="card bg-body-secondary border">
            <div class="card-body">
              <div class="text-danger">Failed to load server statistics</div>
            </div>
          </div>`;
        console.error('stats error', err);
      }
    }
    loadAndRender();
    setInterval(loadAndRender, 60000);
  }

  function renderKeyResult(container, key) {
    const initials = (key.userIds?.[0]?.name || key.userIds?.[0]?.email || '?')
      .trim().charAt(0).toUpperCase();

    const userIdRows = (key.userIds || []).map(uid => `
      <tr>
        <td>${escapeHtml(uid.name || '—')}</td>
        <td>${escapeHtml(uid.email || '—')}</td>
        <td>
          ${uid.verified
            ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Verified</span>'
            : '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Unverified</span>'}
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="card bg-body-secondary border">
        <div class="card-body">
          <div class="sx-key-hero mb-4">
            <div class="sx-key-avatar">${escapeHtml(initials)}</div>
            <div>
              <h5 class="mb-1">${escapeHtml(key.userIds?.[0]?.name || 'Unnamed key')}</h5>
              <div class="text-secondary-emphasis sx-mono">${escapeHtml(key.fingerprint || '')}</div>
            </div>
          </div>
          <div class="row row-cols-2 row-cols-md-4 g-3 mb-4">
            <div><div class="text-secondary small">Key ID</div><div class="sx-mono">${escapeHtml(key.keyId)}</div></div>
            <div><div class="text-secondary small">Algorithm</div><div>${escapeHtml(key.algorithm)}</div></div>
            <div><div class="text-secondary small">Key size</div><div>${escapeHtml(key.keySize)} bits</div></div>
            <div><div class="text-secondary small">Created</div><div>${escapeHtml(new Date(key.created).toLocaleDateString())}</div></div>
          </div>
          <table class="table table-sm align-middle mb-4">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead>
            <tbody>${userIdRows}</tbody>
          </table>
          <textarea class="form-control sx-mono" rows="8" readonly>${escapeHtml(key.publicKeyArmored)}</textarea>
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-outline-primary btn-sm" data-sx-copy>Copy key</button>
            <button type="button" class="btn btn-outline-danger btn-sm" data-sx-remove="${escapeHtml(key.userIds?.[0]?.email || '')}">Request removal</button>
          </div>
        </div>
      </div>`;

    container.querySelector('[data-sx-copy]')?.addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(key.publicKeyArmored);
      showToast('Public key copied to clipboard.', 'success');
    });
    container.querySelector('[data-sx-remove]')?.addEventListener('click', (e) => {
      const removeForm = document.getElementById('sx-remove-form');
      const identifierInput = removeForm?.querySelector('[name="identifier"]');
      if (identifierInput) identifierInput.value = e.currentTarget.dataset.sxRemove;
      removeForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function renderNotFound(container, query) {
    container.innerHTML = `
      <div class="sx-empty">
        <i class="bi bi-key"></i>
        <p class="mb-0">No verified key found for <strong>${escapeHtml(query)}</strong>.</p>
      </div>`;
  }

  function initLookupForm() {
    const form = document.getElementById('sx-lookup-form');
    const result = document.getElementById('sx-lookup-result');
    if (!form || !result) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = form.elements.identifier.value.trim();
      if (!identifier) return;

      const button = form.querySelector('button[type="submit"]');
      setButtonLoading(button, true, 'Looking up…');
      setContainerLoading(result, true, 'Querying key server…');

      try {
        const key = await apiRequest('GET', identifierToParams(identifier));
        renderKeyResult(result, key);
      } catch (err) {
        if (err.status === 404) {
          renderNotFound(result, identifier);
        } else {
          result.innerHTML = '';
          showToast(err.message || 'Lookup failed.', 'danger');
        }
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

  function initUploadForm() {
    const form = document.getElementById('sx-upload-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const publicKeyArmored = form.elements.publicKeyArmored.value.trim();
      if (!publicKeyArmored) return;

      const button = form.querySelector('button[type="submit"]');
      setButtonLoading(button, true, 'Uploading…');

      try {
        await apiRequest('POST', null, { publicKeyArmored });
        showToast('Key uploaded. Check your inbox to verify each email address.', 'success');
        form.reset();
      } catch (err) {
        showToast(err.message || 'Upload failed.', 'danger');
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

  function initRemoveForm() {
    const form = document.getElementById('sx-remove-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = form.elements.identifier.value.trim();
      if (!identifier) return;

      const button = form.querySelector('button[type="submit"]');
      setButtonLoading(button, true, 'Requesting…');

      try {
        await apiRequest('DELETE', identifierToParams(identifier));
        showToast('Removal request sent. Confirm it via the emailed link.', 'success');
        form.reset();
      } catch (err) {
        showToast(err.message || 'Removal request failed.', 'danger');
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLookupForm();
    initUploadForm();
    initRemoveForm();
    initStatus(); // initialize the status card
  });
})();
