let currentTabId = null;
let allLogs = [];
let filteredLogs = [];
let selectedLog = null;

// DOM Elements
const logListEl = document.getElementById('log-list');
const statsBarEl = document.getElementById('stats-bar');
const searchBoxEl = document.getElementById('search-box');
const methodFilterEl = document.getElementById('method-filter');
const statusFilterEl = document.getElementById('status-filter');
const clearBtnEl = document.getElementById('clear-btn');
const exportBtnEl = document.getElementById('export-btn');
const detailsPanelEl = document.getElementById('details-panel');
const detailsContentEl = document.getElementById('details-content');
const closeDetailsBtnEl = document.getElementById('close-details-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Initial load
  loadLogs();

  // Event Listeners
  searchBoxEl.addEventListener('input', applyFilters);
  methodFilterEl.addEventListener('change', applyFilters);
  statusFilterEl.addEventListener('change', applyFilters);
  clearBtnEl.addEventListener('click', clearLogs);
  exportBtnEl.addEventListener('click', exportLogs);
  closeDetailsBtnEl.addEventListener('click', showListView);

  // Listen for logs coming in real-time (optional, requires more background logic)
  // For simplicity, we just load on open.
});

async function loadLogs() {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'getLogs', tabId: currentTabId }, (logs) => {
    allLogs = logs || [];
    applyFilters();
  });
}

async function clearLogs() {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'clearLogs', tabId: currentTabId }, (response) => {
    if (response.success) {
      allLogs = [];
      applyFilters();
    }
  });
}

function exportLogs() {
  const dataStr = JSON.stringify(allLogs, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `api_logs_tab_${currentTabId}_${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Filtering & Rendering ---

function applyFilters() {
  const searchText = searchBoxEl.value.toLowerCase();
  const method = methodFilterEl.value;
  const status = statusFilterEl.value;

  filteredLogs = allLogs.filter(log => {
    const searchMatch = log.url.toLowerCase().includes(searchText);
    const methodMatch = !method || log.method === method;
    const statusMatch = !status || getStatusCategory(log) === status;
    return searchMatch && methodMatch && statusMatch;
  });

  renderLogs();
  renderStats();
}

function getStatusCategory(log) {
  if (log.mocked) return 'mocked';
  if (log.error || log.status === 0) return 'client-error'; // Treat network errors as client
  if (log.status >= 500) return 'server-error';
  if (log.status >= 400) return 'client-error';
  if (log.status >= 300) return 'redirect';
  if (log.status >= 200) return 'success';
  return 'other';
}

function renderLogs() {
  logListEl.innerHTML = ''; // Clear list

  if (filteredLogs.length === 0) {
    logListEl.innerHTML = '<div class="log-list-empty">No matching API calls.</div>';
    return;
  }

  filteredLogs.forEach(log => {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.dataset.logId = log.id;

    let statusClass = 's-error';
    if (log.mocked) statusClass = 's-mock';
    else if (log.status >= 500) statusClass = 's-500';
    else if (log.status >= 400) statusClass = 's-400';
    else if (log.status >= 300) statusClass = 's-300';
    else if (log.status >= 200) statusClass = 's-200';

    const urlShort = log.url.split('?')[0].split('/').pop() || log.url;

    el.innerHTML = `
      <span class="log-status ${statusClass}">${log.mocked ? 'MOCK' : log.status}</span>
      <span class="log-method">${log.method}</span>
      <span class="log-url" title="${log.url}">${urlShort}</span>
      <span class="log-meta">
        <div>${log.duration.toFixed(0)} ms</div>
        <div>${formatBytes(log.response.size)}</div>
      </span>
    `;

    el.addEventListener('click', () => showDetailsView(log));
    logListEl.appendChild(el);
  });
}

function renderStats() {
  const total = allLogs.length;
  if (total === 0) {
    statsBarEl.innerHTML = '<span>Total: 0</span><span>Avg Latency: 0ms</span><span>Success: 0%</span><span>Errors: 0%</span><span>Down: 0 KB</span>';
    return;
  }

  const avgLatency = allLogs.reduce((acc, log) => acc + log.duration, 0) / total;
  const successes = allLogs.filter(log => !log.error && log.status >= 200 && log.status < 300).length;
  const errors = allLogs.filter(log => log.error || log.status >= 400).length;
  const totalDown = allLogs.reduce((acc, log) => acc + (log.response.size || 0), 0);

  statsBarEl.innerHTML = `
    <span>Total: ${total}</span>
    <span>Avg Latency: ${avgLatency.toFixed(0)}ms</span>
    <span>Success: ${((successes / total) * 100).toFixed(0)}%</span>
    <span>Errors: ${((errors / total) * 100).toFixed(0)}%</span>
    <span>Down: ${formatBytes(totalDown)}</span>
  `;
}

// --- Details View ---

function showDetailsView(log) {
  selectedLog = log;
  document.body.classList.add('details-active');
  detailsPanelEl.classList.add('active');
  logListEl.style.display = 'none';

  const reqBody = prettyPrintJson(log.request.body);
  const resBody = prettyPrintJson(log.response.body);

  detailsContentEl.innerHTML = `
    <div class="details-section">
      <h4>General</h4>
      <p><strong>URL:</strong> ${log.url}</p>
      <p><strong>Method:</strong> ${log.method}</p>
      <p><strong>Status:</strong> ${log.status} ${log.statusText}</p>
      <p><strong>Duration:</strong> ${log.duration.toFixed(2)} ms</p>
      <p><strong>Type:</strong> ${log.type} ${log.mocked ? '(Mocked)' : ''}</p>
    </div>
    
    <div class="details-section">
      <h4>Actions</h4>
      <div class="details-actions">
        <button id="copy-curl-btn">Copy as cURL</button>
        <button id="copy-req-btn">Copy Request JSON</button>
        <button id="copy-res-btn">Copy Response JSON</button>
      </div>
    </div>
    
    <div class="details-section">
      <h4>Response Body (${formatBytes(log.response.size)})</h4>
      <pre>${resBody}</pre>
    </div>
    
    <div class="details-section">
      <h4>Request Body</h4>
      <pre>${reqBody}</pre>
    </div>
    
    <div class="details-section">
      <h4>Response Headers</h4>
      <pre>${prettyPrintJson(log.response.headers)}</pre>
    </div>
    
    <div class="details-section">
      <h4>Request Headers</h4>
      <pre>${prettyPrintJson(log.request.headers)}</pre>
    </div>
  `;

  // Add listeners for copy buttons
  document.getElementById('copy-curl-btn').addEventListener('click', copyCurl);
  document.getElementById('copy-req-btn').addEventListener('click', () => copyToClipboard(reqBody));
  document.getElementById('copy-res-btn').addEventListener('click', () => copyToClipboard(resBody));
}

function showListView() {
  selectedLog = null;
  document.body.classList.remove('details-active');
  detailsPanelEl.classList.remove('active');
  logListEl.style.display = 'block';
}

// --- Helpers ---

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function prettyPrintJson(data) {
  if (data === null || data === undefined) return '[empty]';
  if (typeof data === 'string') {
    try {
      // Try to parse if it's a JSON string
      data = JSON.parse(data);
    } catch (e) {
      // It's just a plain string
      return data;
    }
  }
  // It's an object
  return JSON.stringify(data, null, 2);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Optional: show a "Copied!" message
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function copyCurl() {
  if (!selectedLog) return;
  const { request, method, url } = selectedLog;

  let curl = `curl '${url}' \\\n`;
  curl += `  -X ${method} \\\n`;

  // Add headers
  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      curl += `  -H '${key}: ${value}' \\\n`;
    }
  }

  // Add body
  if (request.body && method !== 'GET') {
    const body = (typeof request.body === 'object') ? JSON.stringify(request.body) : request.body;
    curl += `  --data-binary '${body.replace(/'/g, "'\\''")}'`;
  }

  copyToClipboard(curl);
}