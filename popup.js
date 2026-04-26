// ============================================================
// 99Freelas Monitor - Popup Script
// ============================================================

// ─── Utilitários ─────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showToast(msg, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function timeAgo(ts) {
  if (!ts) return '–';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'agora';
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

// ─── Tabs ─────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'recentes') renderRecentProjects();
    if (tab.dataset.tab === 'config') loadConfigFields();
  });
});

// ─── Renderizar status ────────────────────────────────────────

async function renderStatus() {
  const data = await chrome.storage.local.get([
    'lastCheck', 'lastStatus', 'lastError', 'isMonitoring',
    'knownProjects', 'recentNew', 'totalChecks', 'lastProjectCount', 'interval'
  ]);

  const dot = $('statusDot');
  const text = $('statusText');
  const timeEl = $('lastCheckTime');
  const errBox = $('errorBox');
  const errMsg = $('errorMsg');

  // Última verificação
  timeEl.textContent = data.lastCheck ? timeAgo(data.lastCheck) : '';

  // Toggle
  $('toggleMonitoring').checked = data.isMonitoring !== false;

  // Status dot/text
  if (!data.isMonitoring) {
    dot.className = 'status-dot paused';
    text.textContent = 'Monitoramento pausado';
    errBox.classList.add('hidden');
  } else if (data.lastStatus === 'error') {
    dot.className = 'status-dot error';
    text.textContent = 'Erro na última verificação';
    errBox.classList.remove('hidden');
    errMsg.textContent = data.lastError || 'Erro desconhecido';
  } else if (data.lastStatus === 'ok') {
    dot.className = 'status-dot ok';
    text.textContent = `Monitorando — ${data.lastProjectCount || 0} projetos na lista`;
    errBox.classList.add('hidden');
  } else {
    dot.className = 'status-dot idle';
    text.textContent = 'Aguardando primeira verificação...';
    errBox.classList.add('hidden');
  }

  // Stats
  const knownCount = Object.keys(data.knownProjects || {}).length;
  const newCount = (data.recentNew || []).length;
  $('statTotal').textContent = knownCount;
  $('statNew').textContent = newCount;
  $('statChecks').textContent = data.totalChecks || 0;

  // Interval select
  const interval = data.interval || 3;
  $('intervalSelect').value = String(interval);
}

// ─── Renderizar projetos recentes ─────────────────────────────

async function renderRecentProjects() {
  const { recentNew = [] } = await chrome.storage.local.get('recentNew');
  const list = $('projectsList');

  if (recentNew.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhum projeto novo detectado ainda.<br>A extensão vai alertar assim que encontrar novidades!</div>';
    return;
  }

  list.innerHTML = recentNew.map(p => `
    <a class="project-card" href="${escapeHtml(safeUrl(p.url))}" target="_blank">
      <div class="project-title">${escapeHtml(p.title)}</div>
      <div class="project-meta">
        <span class="project-tag new">NOVO</span>
        ${p.category ? `<span class="project-tag">${escapeHtml(p.category)}</span>` : ''}
        ${p.budget ? `<span class="project-tag">💰 ${escapeHtml(p.budget)}</span>` : ''}
        <span class="project-time">${timeAgo(p.seenAt)}</span>
      </div>
    </a>
  `).join('');

  // Interceptar cliques para abrir no Chrome (extensão popup)
  list.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: safeUrl(card.href) });
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('99freelas.com.br')
      ? url
      : 'https://www.99freelas.com.br/projects';
  } catch {
    return 'https://www.99freelas.com.br/projects';
  }
}

// ─── Carregar configurações ───────────────────────────────────

async function loadConfigFields() {
  const { filters = {}, emailConfig = {} } = await chrome.storage.local.get(['filters', 'emailConfig']);

  $('filterKeywords').value = filters.keywords || '';
  $('filterCategories').value = filters.categories || '';

  $('emailEnabled').checked = emailConfig.enabled || false;
  $('emailServiceId').value = emailConfig.serviceId || '';
  $('emailTemplateId').value = emailConfig.templateId || '';
  $('emailPublicKey').value = emailConfig.publicKey || '';
  $('emailTo').value = emailConfig.toEmail || '';

  toggleEmailFields(emailConfig.enabled || false);
}

function toggleEmailFields(enabled) {
  $('emailFields').classList.toggle('hidden', !enabled);
}

$('emailEnabled').addEventListener('change', (e) => {
  toggleEmailFields(e.target.checked);
});

// ─── Salvar filtros ───────────────────────────────────────────

$('btnSaveFilters').addEventListener('click', async () => {
  const filters = {
    keywords: $('filterKeywords').value.trim(),
    categories: $('filterCategories').value.trim(),
  };
  await chrome.storage.local.set({ filters });
  showToast('✅ Filtros salvos!', 'success');
});

// ─── Salvar e-mail ────────────────────────────────────────────

$('btnSaveEmail').addEventListener('click', async () => {
  const emailConfig = {
    enabled: $('emailEnabled').checked,
    serviceId: $('emailServiceId').value.trim(),
    templateId: $('emailTemplateId').value.trim(),
    publicKey: $('emailPublicKey').value.trim(),
    toEmail: $('emailTo').value.trim(),
  };

  if (emailConfig.enabled) {
    if (!emailConfig.serviceId || !emailConfig.templateId || !emailConfig.publicKey || !emailConfig.toEmail) {
      showToast('⚠️ Preencha todos os campos de e-mail.', 'error');
      return;
    }
  }

  await chrome.storage.local.set({ emailConfig });
  showToast('✅ Configurações de e-mail salvas!', 'success');
});

// ─── Toggle monitoramento ─────────────────────────────────────

$('toggleMonitoring').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ isMonitoring: enabled });
  chrome.runtime.sendMessage({ type: 'toggle-monitoring', enabled });
  await renderStatus();
  showToast(enabled ? '▶️ Monitoramento ativado' : '⏸️ Monitoramento pausado', '');
});

// ─── Intervalo ────────────────────────────────────────────────

$('intervalSelect').addEventListener('change', async (e) => {
  const interval = Number(e.target.value);
  await chrome.storage.local.set({ interval });
  chrome.runtime.sendMessage({ type: 'update-interval', interval }, (res) => {
    if (res?.ok) showToast(`⏱️ Intervalo: ${interval} min`, 'success');
  });
});

// ─── Verificar agora ──────────────────────────────────────────

$('btnCheckNow').addEventListener('click', async () => {
  const btn = $('btnCheckNow');
  const icon = $('btnCheckIcon');
  btn.disabled = true;
  icon.textContent = '⏳';

  chrome.runtime.sendMessage({ type: 'check-now' }, async (res) => {
    btn.disabled = false;
    icon.textContent = '🔍';

    if (res?.ok) {
      showToast('✅ Verificação concluída!', 'success');
    } else {
      showToast(`❌ ${res?.error || 'Erro na verificação'}`, 'error');
    }

    await renderStatus();
  });
});

// ─── Abrir página de todos os projetos ───────────────────────

$('btnAllProjects').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open-projects-page' });
  window.close();
});

// ─── Abrir site ───────────────────────────────────────────────

$('btnOpenFreelas').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.99freelas.com.br/projects' });
});

// ─── Limpar histórico ─────────────────────────────────────────

$('btnClearHistory').addEventListener('click', async () => {
  if (!confirm('Limpar histórico de projetos detectados?\n\nOs projetos atuais voltarão a ser detectados como "novos".')) return;
  chrome.runtime.sendMessage({ type: 'clear-history' }, async () => {
    await renderRecentProjects();
    await renderStatus();
    showToast('🗑️ Histórico limpo', '');
  });
});

// ─── Limpar badge ─────────────────────────────────────────────

$('btnClearBadge').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clear-badge' });
  chrome.action.setBadgeText({ text: '' }).catch(() => {});
  showToast('Badge limpo', '');
});

// ─── Atualização automática do status ────────────────────────

let refreshInterval;

function startAutoRefresh() {
  renderStatus();
  refreshInterval = setInterval(renderStatus, 5000);
}

function stopAutoRefresh() {
  clearInterval(refreshInterval);
}

// ─── Init ─────────────────────────────────────────────────────

window.addEventListener('load', () => {
  startAutoRefresh();
  // Limpar badge ao abrir o popup
  chrome.runtime.sendMessage({ type: 'clear-badge' });
});

window.addEventListener('unload', stopAutoRefresh);
