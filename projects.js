// ============================================================
// 99Freelas Monitor — Página de Projetos (projects.js)
// ============================================================

const PER_PAGE = 30;
let allProjects = [];
let filtered    = [];
let currentPage = 1;

// ─── Utilitários ─────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2800);
}

function timeAgo(ts) {
  if (!ts) return '–';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10)    return 'agora';
  if (s < 60)    return `${s}s atrás`;
  if (s < 3600)  return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `${d} dias atrás`;
}

function isToday(ts) {
  const d = new Date(ts);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function escHtml(str) {
  return String(str || '')
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

// ─── Renderização ─────────────────────────────────────────────

function renderGrid() {
  const grid  = $('projectsGrid');
  const start = (currentPage - 1) * PER_PAGE;
  const page  = filtered.slice(start, start + PER_PAGE);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">Nenhum projeto encontrado.<br>Tente outro termo de busca ou aguarde novas detecções.</div>
      </div>`;
    renderPagination();
    return;
  }

  grid.innerHTML = page.map(p => `
    <div class="project-card">
      <div class="card-top">
        <span class="new-badge">novo</span>
        <div class="card-title">
          <a href="${escHtml(safeUrl(p.url))}" target="_blank">${escHtml(p.title)}</a>
        </div>
      </div>
      <div class="card-meta">
        ${p.category ? `<span class="tag tag-cat">🏷 ${escHtml(p.category)}</span>` : ''}
        ${p.budget   ? `<span class="tag tag-budget">💰 ${escHtml(p.budget)}</span>`   : ''}
        ${p.client   ? `<span class="tag tag-client">👤 ${escHtml(p.client)}</span>`   : ''}
      </div>
      <div class="card-footer">
        <span class="card-time">⏱ ${timeAgo(p.seenAt)}</span>
        <a class="card-link" href="${escHtml(safeUrl(p.url))}" target="_blank">Ver projeto →</a>
      </div>
    </div>
  `).join('');

  renderPagination();
}

function renderPagination() {
  const pag       = $('pagination');
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  if (totalPages <= 1) { pag.innerHTML = ''; return; }

  let html = `<button class="page-btn" id="prevBtn" ${currentPage === 1 ? 'disabled' : ''}>← Anterior</button>`;

  // Páginas com janela de 5
  const start = Math.max(1, currentPage - 2);
  const end   = Math.min(totalPages, start + 4);

  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  html += `<button class="page-btn" id="nextBtn" ${currentPage === totalPages ? 'disabled' : ''}>Próxima →</button>`;
  html += `<span style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-left:8px">${filtered.length} projetos</span>`;

  pag.innerHTML = html;

  pag.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = Number(btn.dataset.page);
      renderGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const prev = $('prevBtn');
  const next = $('nextBtn');
  if (prev) prev.addEventListener('click', () => { currentPage--; renderGrid(); window.scrollTo({ top: 0 }); });
  if (next) next.addEventListener('click', () => { currentPage++; renderGrid(); window.scrollTo({ top: 0 }); });
}

// ─── Filtro + ordenação ───────────────────────────────────────

function applyFilterAndSort() {
  const q    = $('searchInput').value.toLowerCase().trim();
  const sort = $('sortSelect').value;

  filtered = q
    ? allProjects.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q))
    : [...allProjects];

  if (sort === 'oldest') filtered.sort((a, b) => a.seenAt - b.seenAt);
  else if (sort === 'alpha') filtered.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  else filtered.sort((a, b) => b.seenAt - a.seenAt); // newest (default)

  currentPage = 1;
  renderGrid();
}

// ─── Carregar dados ───────────────────────────────────────────

async function loadData() {
  const data = await chrome.storage.local.get([
    'recentNew', 'lastCheck', 'lastStatus', 'lastError',
    'isMonitoring', 'totalChecks', 'lastProjectCount'
  ]);

  allProjects = data.recentNew || [];

  // Stats
  $('statTotal').textContent  = allProjects.length;
  $('statToday').textContent  = allProjects.filter(p => isToday(p.seenAt)).length;
  $('statChecks').textContent = data.totalChecks || 0;
  $('statOnPage').textContent = data.lastProjectCount || 0;

  // Status
  const dot  = $('statusDot');
  const text = $('statusText');
  const last = data.lastCheck ? `— ${timeAgo(data.lastCheck)}` : '';

  if (!data.isMonitoring) {
    dot.className  = 'dot paused';
    text.textContent = `Pausado ${last}`;
  } else if (data.lastStatus === 'error') {
    dot.className  = 'dot error';
    text.textContent = `Erro ${last}`;
  } else if (data.lastStatus === 'ok') {
    dot.className  = 'dot ok';
    text.textContent = `Monitorando ${last}`;
  } else {
    dot.className  = 'dot paused';
    text.textContent = 'Aguardando...';
  }

  applyFilterAndSort();
}

// ─── Eventos ─────────────────────────────────────────────────

$('searchInput').addEventListener('input',  applyFilterAndSort);
$('sortSelect').addEventListener('change',  applyFilterAndSort);

$('btnCheckNow').addEventListener('click', async () => {
  $('btnCheckNow').disabled = true;
  $('btnCheckNow').textContent = '⏳ Verificando...';
  chrome.runtime.sendMessage({ type: 'check-now' }, async (res) => {
    $('btnCheckNow').disabled = false;
    $('btnCheckNow').textContent = '🔍 Verificar agora';
    if (res?.ok) { showToast('✅ Verificação concluída!', 'success'); await loadData(); }
    else showToast(`❌ ${res?.error || 'Erro'}`, 'error');
  });
});

$('btnClear').addEventListener('click', async () => {
  if (!confirm('Limpar todo o histórico de projetos detectados?\n\nOs projetos atuais serão esquecidos e detectados novamente como novos.')) return;
  chrome.runtime.sendMessage({ type: 'clear-history' }, async () => {
    allProjects = [];
    applyFilterAndSort();
    await loadData();
    showToast('🗑️ Histórico limpo.', '');
  });
});

$('btnOpenFreelas').addEventListener('click', () => {
  window.open('https://www.99freelas.com.br/projects', '_blank');
});

// Atualiza a cada 10 segundos enquanto a página estiver aberta
setInterval(loadData, 10_000);

// ─── Init ─────────────────────────────────────────────────────

loadData();
