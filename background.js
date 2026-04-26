// ============================================================
// 99Freelas Monitor - Service Worker (background.js)
// ============================================================

const ALARM_NAME    = 'freelas-check';
const ALARM_CLEANUP = 'freelas-cleanup';
const ALARM_RETRY   = 'freelas-retry';
const BASE_URL      = 'https://www.99freelas.com.br';
const PROJECTS_URL  = `${BASE_URL}/projects`;
const PAGES_TO_SCAN      = 3;           // quantas páginas verificar por ciclo
const CLEANUP_DAYS       = 2;           // intervalo de limpeza automática (dias)
const KNOWN_TTL_MS       = 7 * 86400e3; // projetos conhecidos expiram após 7 dias
const RECENT_TTL_MS      = 30 * 86400e3;// histórico expirar após 30 dias
const MAX_VISIBLE_NOTIFS = 4;           // máximo de notificações visíveis ao mesmo tempo

// ─── Inicialização ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[99Freelas Monitor] Instalado.');
  await chrome.storage.local.set({
    isMonitoring:  true,
    interval:      3,
    knownProjects: {},
    recentNew:     [],
    notifMap:      {},
    notifQueue:    [],
    badgeCount:    0,
    filters:       { keywords: '', categories: '' },
    emailConfig:   { enabled: false, serviceId: '', templateId: '', publicKey: '', toEmail: '' },
    lastCheck:     null,
    lastStatus:    'idle',
    totalChecks:   0,
  });
  await setupAlarm(3);
  setupCleanupAlarm();
  await checkNewProjects();
});

chrome.runtime.onStartup.addListener(async () => {
  const { isMonitoring, interval = 3 } = await chrome.storage.local.get(['isMonitoring', 'interval']);
  if (isMonitoring) await setupAlarm(interval);
  setupCleanupAlarm();
});

// ─── Alarmes ─────────────────────────────────────────────────

async function setupAlarm(minutes) {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: Number(minutes) });
}

function setupCleanupAlarm() {
  chrome.alarms.get(ALARM_CLEANUP, existing => {
    if (!existing) {
      chrome.alarms.create(ALARM_CLEANUP, { periodInMinutes: CLEANUP_DAYS * 24 * 60 });
    }
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME || alarm.name === ALARM_RETRY) {
    await chrome.alarms.clear(ALARM_RETRY);
    const { isMonitoring } = await chrome.storage.local.get('isMonitoring');
    if (isMonitoring) await checkNewProjects();
    return;
  }
  if (alarm.name === ALARM_CLEANUP) {
    await cleanupStorage();
  }
});

// ─── Lógica Principal ─────────────────────────────────────────

async function checkNewProjects() {
  console.log('[Monitor] Verificando...');
  try {
    const settings = await chrome.storage.local.get([
      'knownProjects', 'recentNew', 'filters', 'emailConfig',
      'totalChecks', 'badgeCount', 'notifMap', 'notifQueue'
    ]);

    const knownProjects = settings.knownProjects || {};
    const filters       = settings.filters       || {};
    const emailConfig   = settings.emailConfig   || {};

    const allProjects = await fetchAllPages();
    const filtered    = applyFilters(allProjects, filters);
    const newProjects = filtered.filter(p => !knownProjects[p.id]);

    if (newProjects.length > 0) {
      console.log(`[Monitor] ${newProjects.length} projeto(s) novo(s)!`);

      const now        = Date.now();
      const notifMap   = settings.notifMap  || {};
      const notifQueue = settings.notifQueue || [];

      // Registrar todos como conhecidos
      newProjects.forEach(p => { knownProjects[p.id] = { ...p, seenAt: now }; });

      // Lista completa de detectados (sem limite de quantidade)
      const recentNew = [
        ...newProjects.map(p => ({ ...p, seenAt: now })),
        ...(settings.recentNew || []),
      ];

      await chrome.storage.local.set({ knownProjects, recentNew });

      // Uma notificação individual por projeto, fila deslizante de MAX_VISIBLE_NOTIFS
      for (let i = 0; i < newProjects.length; i++) {
        const project = newProjects[i];
        const notifId = `fl_${now}_${i}_${String(project.id).slice(0, 30)}`;

        // Se já há MAX_VISIBLE_NOTIFS visíveis, remove a mais antiga
        if (notifQueue.length >= MAX_VISIBLE_NOTIFS) {
          const oldest = notifQueue.shift();
          chrome.notifications.clear(oldest);
        }

        notifMap[notifId] = project.url;
        notifQueue.push(notifId);

        await sendDesktopNotification(notifId, project);

        // Som somente na primeira para não incomodar
        if (i === 0) await playNotificationSound();

        // E-mail individual por projeto
        if (emailConfig?.enabled && emailConfig?.serviceId && emailConfig?.templateId && emailConfig?.publicKey) {
          await sendEmailNotification(project, emailConfig);
        }

        // Pausa entre notificações para evitar engolimento pelo SO
        if (i < newProjects.length - 1) await sleep(800);
      }

      // Limpa entradas antigas do notifMap (mantém últimas 300)
      const nmKeys = Object.keys(notifMap);
      if (nmKeys.length > 300) {
        nmKeys.slice(0, nmKeys.length - 300).forEach(k => delete notifMap[k]);
      }

      const newBadge = (settings.badgeCount || 0) + newProjects.length;
      await chrome.storage.local.set({ notifMap, notifQueue, badgeCount: newBadge });
      chrome.action.setBadgeText({ text: String(newBadge) });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }

    await chrome.storage.local.set({
      lastCheck:        Date.now(),
      lastStatus:       'ok',
      lastProjectCount: allProjects.length,
      totalChecks:      (settings.totalChecks || 0) + 1,
    });

  } catch (err) {
    console.error('[Monitor] Erro:', err);
    await chrome.storage.local.set({
      lastCheck:  Date.now(),
      lastStatus: 'error',
      lastError:  err.message,
    });
    // Reagendar tentativa em 1 minuto se não for erro de sessão
    if (!err.message.includes('login') && !err.message.includes('autorizado')) {
      chrome.alarms.create(ALARM_RETRY, { delayInMinutes: 1 });
      console.log('[Monitor] Retry agendado para 1 min.');
    }
  }
}

// ─── Desktop Notification ─────────────────────────────────────

async function sendDesktopNotification(notifId, project) {
  const message = smartTruncate(project.title, 65);
  const context = project.category
    ? smartTruncate(project.category, 45)
    : 'Clique para abrir';

  try {
    await chrome.notifications.create(notifId, {
      type:               'basic',
      iconUrl:            'icons/icon128.png',
      title:              '🆕 Novo projeto no 99Freelas!',
      message,
      contextMessage:     context,
      buttons:            [{ title: 'Ver projeto' }],
      requireInteraction: true,
    });
  } catch (e) {
    console.error('[Monitor] Notificação:', e.message);
  }
}

// Corta na última palavra inteira antes do limite e adiciona "…"
function smartTruncate(str, max) {
  if (!str || str.length <= max) return str || '';
  const cut       = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const trimPoint = lastSpace > max * 0.55 ? lastSpace : max;
  return cut.slice(0, trimPoint).trimEnd() + '…';
}

// ─── Clique na notificação → abre o projeto ───────────────────

function removeFromQueue(notifId) {
  chrome.storage.local.get('notifQueue', ({ notifQueue = [] }) => {
    const idx = notifQueue.indexOf(notifId);
    if (idx !== -1) {
      notifQueue.splice(idx, 1);
      chrome.storage.local.set({ notifQueue });
    }
  });
}

function handleNotifClick(notifId) {
  chrome.storage.local.get('notifMap', ({ notifMap = {} }) => {
    const url = notifMap[notifId] || PROJECTS_URL;
    chrome.tabs.create({ url });
  });
  chrome.notifications.clear(notifId);
  removeFromQueue(notifId);
}

chrome.notifications.onClicked.addListener(handleNotifClick);
chrome.notifications.onButtonClicked.addListener(handleNotifClick);
chrome.notifications.onClosed.addListener(removeFromQueue);

// ─── Fetch ───────────────────────────────────────────────────

async function fetchPage(page) {
  const url = page === 1 ? PROJECTS_URL : `${PROJECTS_URL}?page=${page}`;
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Cache-Control':   'no-cache',
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Não autorizado. Faça login no 99Freelas no Chrome.');
    }
    throw new Error(`Erro HTTP: ${response.status}`);
  }

  const text = await response.text();

  if (text.includes('Entrar') && text.includes('Cadastre-se') && !text.includes('Sair')) {
    throw new Error('Sessão expirada. Faça login no 99Freelas.');
  }

  return text;
}

async function fetchAllPages() {
  const pageNums = Array.from({ length: PAGES_TO_SCAN }, (_, i) => i + 1);
  const results  = await Promise.allSettled(pageNums.map(p => fetchPage(p)));

  // Se a página 1 falhou, propaga o erro (crítico)
  if (results[0].status === 'rejected') throw results[0].reason;

  const seen     = new Set();
  const projects = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[Monitor] Página falhou (ignorando):', result.reason.message);
      continue;
    }
    for (const p of parseProjects(result.value)) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        projects.push(p);
      }
    }
  }

  console.log(`[Monitor] Total após ${PAGES_TO_SCAN} páginas: ${projects.length} projetos.`);
  return projects;
}

// ─── Parser (regex — compatível com Service Worker) ───────────

function parseProjects(html) {
  const projects = [];
  const seen     = new Set();
  const anchorRe = /<a[^>]+href="(\/projects?\/([^"?#\s]+))[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const href  = match[1];
    const id    = match[2];
    const inner = match[3];

    if (!id || seen.has(id)) continue;

    const title = decodeHtmlEntities(
      inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );

    if (title.length < 5) continue;

    seen.add(id);
    projects.push({
      id,
      title,
      url:      `${BASE_URL}${href}`,
      category: extractMeta(html, match.index, 'category', 'area', 'tag'),
      budget:   extractMeta(html, match.index, 'budget',   'price', 'valor'),
      client:   extractMeta(html, match.index, 'client',   'author', 'user'),
    });
  }

  console.log(`[Monitor] ${projects.length} projetos no parse.`);
  return projects;
}

function extractMeta(html, linkIndex, ...classNames) {
  const chunk = html.substring(
    Math.max(0, linkIndex - 200),
    Math.min(html.length, linkIndex + 1000)
  );
  for (const cls of classNames) {
    const re = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([^<]{1,120})<`, 'i');
    const m  = chunk.match(re);
    if (m) return decodeHtmlEntities(m[1].replace(/\s+/g, ' ').trim());
  }
  return '';
}

// ─── Filtros ──────────────────────────────────────────────────

function applyFilters(projects, filters) {
  if (!filters.keywords && !filters.categories) return projects;

  const keywords = filters.keywords
    ? filters.keywords.toLowerCase().split(',').map(k => k.trim()).filter(Boolean)
    : [];
  const categories = filters.categories
    ? filters.categories.toLowerCase().split(',').map(c => c.trim()).filter(Boolean)
    : [];

  return projects.filter(p => {
    const t      = p.title.toLowerCase();
    const c      = p.category.toLowerCase();
    const kwOk   = keywords.length   === 0 || keywords.some(kw    => t.includes(kw)  || c.includes(kw));
    const catOk  = categories.length === 0 || categories.some(cat => c.includes(cat));
    return kwOk && catOk;
  });
}

// ─── Som via Offscreen ────────────────────────────────────────

let offscreenCreating = false;

async function playNotificationSound() {
  try {
    const existing = await chrome.offscreen.hasDocument();
    if (!existing && !offscreenCreating) {
      offscreenCreating = true;
      await chrome.offscreen.createDocument({
        url:           'offscreen.html',
        reasons:       ['AUDIO_PLAYBACK'],
        justification: 'Tocar alerta de novo projeto no 99Freelas',
      });
      offscreenCreating = false;
    }
    chrome.runtime.sendMessage({ type: 'play-sound' }).catch(() => {});
    setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 5000);
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'play-sound' }).catch(() => {});
    console.warn('[Monitor] Som:', e.message);
  }
}

// ─── E-mail via EmailJS ───────────────────────────────────────

async function sendEmailNotification(project, config) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  config.serviceId,
        template_id: config.templateId,
        user_id:     config.publicKey,
        template_params: {
          to_email:         config.toEmail,
          project_title:    project.title,
          project_url:      project.url,
          project_category: project.category || 'Não informada',
          project_budget:   project.budget   || 'A combinar',
          project_client:   project.client   || 'Não informado',
          check_time:       new Date().toLocaleString('pt-BR'),
        },
      }),
    });
    if (res.ok) console.log('[Monitor] E-mail OK:', project.title);
    else        console.error('[Monitor] E-mail erro:', await res.text());
  } catch (e) {
    console.error('[Monitor] E-mail falha:', e.message);
  }
}

// ─── Mensagens do Popup / Projects Page ──────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'check-now') {
    checkNewProjects()
      .then(() => reply({ ok: true }))
      .catch(e  => reply({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'update-interval') {
    setupAlarm(msg.interval)
      .then(() => reply({ ok: true }))
      .catch(e  => reply({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'toggle-monitoring') {
    chrome.storage.local.set({ isMonitoring: msg.enabled });
    if (msg.enabled) {
      chrome.storage.local.get('interval', ({ interval }) => setupAlarm(interval || 3));
    } else {
      chrome.alarms.clear(ALARM_NAME);
    }
    reply({ ok: true });
  }

  if (msg.type === 'clear-badge') {
    chrome.action.setBadgeText({ text: '' });
    chrome.storage.local.set({ badgeCount: 0 });
  }

  if (msg.type === 'clear-history') {
    chrome.storage.local.set({ recentNew: [], knownProjects: {}, badgeCount: 0, notifMap: {} });
    chrome.action.setBadgeText({ text: '' });
    reply({ ok: true });
  }

  if (msg.type === 'open-projects-page') {
    chrome.tabs.create({ url: chrome.runtime.getURL('projects.html') });
  }
});

// ─── Limpeza automática do storage ───────────────────────────

async function cleanupStorage() {
  console.log('[Monitor] Limpeza automática iniciada.');
  const { knownProjects = {}, recentNew = [] } = await chrome.storage.local.get(['knownProjects', 'recentNew']);
  const now    = Date.now();
  let removed  = 0;

  // Remove projetos conhecidos mais antigos que KNOWN_TTL_MS (7 dias)
  for (const id of Object.keys(knownProjects)) {
    if (now - (knownProjects[id].seenAt || 0) > KNOWN_TTL_MS) {
      delete knownProjects[id];
      removed++;
    }
  }

  // Mantém apenas entradas recentes no histórico (30 dias)
  const recentFiltered = recentNew.filter(p => now - (p.seenAt || 0) <= RECENT_TTL_MS);

  await chrome.storage.local.set({ knownProjects, recentNew: recentFiltered });
  console.log(`[Monitor] Limpeza concluída: ${removed} projetos removidos, histórico de ${recentFiltered.length} entradas.`);
}

// ─── Utilitários ──────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ',
  '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä', '&aring;': 'å',
  '&ccedil;': 'ç',
  '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
  '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
  '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö',
  '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
  '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã', '&Auml;': 'Ä',
  '&Ccedil;': 'Ç',
  '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
  '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
  '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ', '&Ouml;': 'Ö',
  '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
  '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…', '&copy;': '©', '&reg;': '®', '&trade;': '™',
};

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g,        (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-zA-Z]+;/g,     e => HTML_ENTITIES[e] ?? e);
}
