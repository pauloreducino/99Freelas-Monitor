# 99Freelas Monitor

![Versão](https://img.shields.io/badge/versão-1.0.7-blue)
![Licença](https://img.shields.io/badge/licença-MIT-green)
![Plataforma](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow?logo=googlechrome)

Extensão para Chrome que monitora novos projetos no [99Freelas](https://www.99freelas.com.br) em tempo real e te avisa assim que aparecem, sem precisar ficar atualizando a página.

---

## Screenshots

<div align="center">
  <img src="assets/screenshot-popup.png" alt="Popup principal" width="380"/>
  <br/><br/>
  <img src="assets/screenshot-projects.png" alt="Página de projetos detectados" width="100%"/>
</div>

---

## Funcionalidades

- **Monitoramento automático** — verifica novas oportunidades em intervalos configuráveis (1 a 30 min), buscando até 3 páginas de projetos por ciclo
- **Notificação desktop** — alerta visual do Chrome com título, categoria e link direto
- **Fila inteligente** — mantém no máximo 4 notificações visíveis; a mais antiga sai quando chega uma nova
- **Alerta sonoro** — beep triplo na primeira notificação de cada ciclo
- **Retry automático** — em caso de falha de rede, tenta novamente em 1 minuto
- **Filtros** — filtre por palavras-chave e/ou categorias para receber só o que importa
- **Histórico completo** — página dedicada com busca, paginação e ordenação de todos os projetos detectados
- **Alerta por e-mail** — integração opcional com EmailJS (200 e-mails/mês grátis)
- **Limpeza automática** — storage limpo a cada 2 dias, sem acúmulo infinito

---

## Instalação

> A extensão ainda não está na Chrome Web Store. Instale manualmente:

1. Baixe ou clone este repositório
2. Abra o Chrome e acesse `chrome://extensions/`
3. Ative o **Modo do desenvolvedor** (canto superior direito)
4. Clique em **"Carregar sem compactação"**
5. Selecione a pasta `99freelas-monitor`
6. A extensão aparecerá na barra do Chrome ✅

**Pré-requisito:** estar logado no [99Freelas](https://www.99freelas.com.br) no Chrome. A extensão usa sua sessão ativa — nenhuma senha é armazenada.

---

## Como usar

### Dashboard

| Campo | Descrição |
|---|---|
| Toggle on/off | Pausa ou retoma o monitoramento |
| Intervalo | Com que frequência verificar (1 a 30 min) |
| Verificar agora | Força uma verificação imediata |
| Projetos vistos | Total de projetos já registrados |
| Novos detectados | Quantos projetos novos foram encontrados |
| Verificações | Número total de checagens realizadas |

### Aba "Novos Projetos"

Lista os projetos detectados recentemente com link direto para cada um. Clique em **"Ver todos"** para abrir o histórico completo com busca e paginação.

### Aba "Configurações"

- **Palavras-chave:** `next.js, react, wordpress` — alerta apenas se o título contiver uma dessas palavras
- **Categorias:** `desenvolvimento web, design` — filtra pela categoria do projeto
- Deixe em branco para monitorar **todos** os projetos

---

## Configurar alerta por e-mail (opcional)

A extensão usa o [EmailJS](https://emailjs.com) para enviar e-mails sem backend. O plano gratuito inclui **200 e-mails/mês**.

<details>
<summary>Passo a passo</summary>

#### 1. Criar conta no EmailJS
Acesse [emailjs.com](https://emailjs.com) e crie uma conta gratuita.

#### 2. Criar um Email Service
- No dashboard, vá em **Email Services → Add New Service**
- Escolha Gmail (ou outro provedor) e conecte sua conta
- Copie o **Service ID** (ex: `service_abc123`)

#### 3. Criar um Email Template
Vá em **Email Templates → Create New Template** e use as variáveis abaixo:

```
Assunto: 🆕 Novo projeto: {{project_title}}

Novo projeto detectado no 99Freelas!

📌 Título:    {{project_title}}
🏷️ Categoria: {{project_category}}
💰 Orçamento: {{project_budget}}
👤 Cliente:   {{project_client}}
🕐 Detectado: {{check_time}}
🔗 Link:      {{project_url}}
```

Copie o **Template ID** (ex: `template_xyz789`).

#### 4. Pegar a Public Key
Vá em **Account → General** e copie a **Public Key**.

#### 5. Configurar na extensão
Abra a extensão → aba **Configurações** → ative "E-mail" → preencha os campos → **Salvar**.

</details>

---

## Estrutura do projeto

```
99freelas-monitor/
├── manifest.json      → Configuração da extensão (Manifest V3)
├── background.js      → Service worker: polling, parse, notificações
├── popup.html         → Interface do popup
├── popup.js           → Lógica do popup
├── popup.css          → Estilos (tema escuro)
├── projects.html      → Página de histórico completo
├── projects.js        → Busca, paginação e ordenação do histórico
├── offscreen.html     → Documento auxiliar para reprodução de som
├── offscreen.js       → Geração de som via Web Audio API
├── LICENSE
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Solução de problemas

**"Sessão expirada / Não autorizado"**
→ Faça login no 99Freelas no Chrome e tente novamente.

**Nenhum projeto aparece**
→ O 99Freelas pode ter alterado o HTML da página. Abra `background.js` e revise a regex em `parseProjects()` e os nomes de classes em `extractMeta()` inspecionando o HTML atual de `99freelas.com.br/projects`.

**A extensão parou de monitorar após reiniciar o Chrome**
→ O monitoramento é retomado automaticamente na inicialização. Se não ocorrer, abra o popup e reative o toggle.

---

## Privacidade

- Nenhuma senha é armazenada ou transmitida
- Todos os dados ficam no `chrome.storage.local` do seu navegador
- A única requisição externa é ao 99Freelas (para buscar projetos) e ao EmailJS, se configurado

---

## Licença

[MIT](LICENSE) © 2026 Paulo Reducino
