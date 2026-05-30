/**
 * Website Admin ↔ Gastronomic template live data bridge.
 * Fetches sb-template-service public bundles and applies them to saffron-and-smoke.html without full page reload.
 */
(function () {
  function postToHost(payload) {
    try {
      if (window.top && window.top !== window) {
        window.top.postMessage(payload, '*');
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    } catch (e) {
      /* ignore */
    }
  }

  const ENDPOINTS = [
    { key: 'g1', path: 'template/public/top-header-navigation' },
    { key: 'g2', path: 'template/public/hero-carousel' },
    { key: 'g3', path: 'template/public/trusted-brand-logos' },
    { key: 'g4', path: 'template/public/stats-and-partners' },
    { key: 'g5', path: 'template/public/about-team-milestones' },
    { key: 'g6', path: 'template/public/reviews-portfolio-gallery' },
    { key: 'g7', path: 'template/public/services-features-pricing' },
    { key: 'g8', path: 'template/public/content-faq-legal' },
    { key: 'g9', path: 'template/public/contact-cta-newsletter' },
    { key: 'g10', path: 'template/public/footer' },
    { key: 'g11', path: 'template/public/site-overlays' },
    { key: 'g12', path: 'template/public/branding-seo-pages' },
  ];

  const state = {
    websiteId: null,
    apiBase: null,
    parentOrigin: null,
    waPreview: false,
    loading: false,
    bundles: {},
    previewSnapshot: null,
    docObjectUrls: {},
    carouselTimer: null,
    carouselIndex: 0,
    carouselBound: false,
    testiTimer: null,
    testiIdx: 0,
    lastAppliedSnapshotKey: '',
    applySnapshotTimer: null,
    pendingSnapshot: null,
    bridgeReadySent: false,
    revealTimer: null,
    lastCarouselKey: '',
    lastCarouselAutoplayKey: '',
    lastShownCarouselIndex: -1,
    lastShownCarouselBgUrl: '',
    carouselFadeTimer: null,
    customPageRoutes: {},
  };

  function readQuery() {
    const p = new URLSearchParams(window.location.search);
    const rawSearch = window.location.search || '';
    let wid = p.get('websiteId');
    if (wid) {
      const leadingNum = String(wid).match(/^-?\d+/);
      if (leadingNum) {
        state.websiteId = Number(leadingNum[0]);
      }
    }
    const api = p.get('apiBase');
    state.waPreview =
      p.get('wa_preview') === '1' || /(?:^|[?&])wa_preview=1(?:&|$)/.test(rawSearch);
    if (api) state.apiBase = api.endsWith('/') ? api : api + '/';
  }

  function getApiBase() {
    if (state.apiBase) return state.apiBase;
    return 'http://localhost:8013/api/';
  }

  function documentUrl(docId) {
    if (!docId) return null;
    return getApiBase() + 'document/public/document/by/document-upload-id/get/' + docId;
  }

  async function fetchBundle(path, websiteId) {
    const url = getApiBase() + path + '/' + websiteId;
    const res = await fetch(url, { credentials: 'omit' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed ' + path + ' (' + res.status + ')');
    const json = await res.json();
    return json?.responsePayload ?? null;
  }

  async function fetchAll(websiteId) {
    const out = {};
    await Promise.all(
      ENDPOINTS.map(async ({ key, path }) => {
        try {
          out[key] = await fetchBundle(path, websiteId);
        } catch (e) {
          console.warn('[template-bridge]', path, e);
          out[key] = null;
        }
      }),
    );
    return out;
  }

  function mergeBundleGroup(prev, next) {
    if (next == null) return prev;
    if (prev == null) return next;
    if (Array.isArray(next)) return next.slice();
    if (typeof next !== 'object' || typeof prev !== 'object') return next;
    const out = { ...prev };
    for (const k of Object.keys(next)) {
      if (next[k] == null) continue;
      const p = prev[k];
      const n = next[k];
      if (Array.isArray(n)) {
        out[k] = n;
      } else if (typeof n === 'object' && typeof p === 'object' && !Array.isArray(p)) {
        out[k] = { ...p, ...n };
      } else {
        out[k] = n;
      }
    }
    return out;
  }

  function mergeBundles(base, patch) {
    const out = { ...(base || {}) };
    for (const key of Object.keys(patch || {})) {
      if (patch[key] == null) continue;
      out[key] = mergeBundleGroup(out[key], patch[key]);
    }
    return out;
  }

  function trustedBrandSection(g3) {
    if (!g3) return {};
    if (g3.clientLogos && typeof g3.clientLogos === 'object' && !Array.isArray(g3.clientLogos)) {
      return g3.clientLogos;
    }
    if (g3.clientLogoSection && typeof g3.clientLogoSection === 'object' && !Array.isArray(g3.clientLogoSection)) {
      return g3.clientLogoSection;
    }
    return {};
  }

  function trustedBrandHeadHtml(section) {
    const title = section.title != null ? String(section.title).trim() : '';
    const subtitle = section.subtitle != null ? String(section.subtitle).trim() : '';
    return (
      (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') +
      (subtitle ? '<p>' + escapeHtml(subtitle) + '</p>' : '')
    );
  }

  function trustedBrandItems(g3) {
    if (!g3) return [];
    const raw =
      g3.clientLogoItems ||
      g3.logoItems ||
      g3.items ||
      (Array.isArray(g3.clientLogos) ? g3.clientLogos : null) ||
      g3.logos ||
      [];
    return Array.isArray(raw) ? raw : [];
  }

  function logoItemSrc(item) {
    if (!item) return '';
    if (item._previewLogoUrl) return String(item._previewLogoUrl);
    const docId = normDocId(item.logoDocId);
    if (docId) return documentUrl(docId);
    return item.logoUrl ? String(item.logoUrl) : '';
  }

  function setText(el, text) {
    if (el && text != null && String(text).trim() !== '') el.textContent = text;
  }

  function trimStr(v) {
    return v != null && String(v).trim() !== '' ? String(v).trim() : '';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Quoted url('…') so query strings with & work in background-image. */
  function cssBackgroundImageUrl(url) {
    if (!url) return '';
    var u = String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return "url('" + u + "')";
  }

  function initials(name) {
    return String(name || '??')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function formatPlanPrice(plan, cycle) {
    const useAnnual = cycle === 'annual' || cycle === 'yearly';
    const amt = useAnnual
      ? plan.priceAnnual ?? plan.priceMonthly
      : plan.priceMonthly ?? plan.priceAnnual;
    if (amt == null || amt === '') return '';
    const cur = String(plan.currency || '$').trim();
    const suffix = useAnnual && plan.priceAnnual != null ? '/yr' : '/mo';
    return cur + String(amt) + suffix;
  }

  function servicePriceLabel(item) {
    const btn = item.btnLabel != null ? String(item.btnLabel).trim() : '';
    if (btn && (/^\$|^€|^£|^\d/.test(btn) || btn.toLowerCase().includes('price'))) {
      return btn.startsWith('$') || btn.startsWith('€') || btn.startsWith('£') ? btn : '$' + btn;
    }
    const desc = item.shortDesc || item.description || '';
    const m = String(desc).match(/(\$|€|£)\s?\d+(?:[.,]\d{1,2})?/);
    return m ? m[0].replace(/\s/g, '') : '';
  }

  function formatCategoryLabel(cat) {
    const c = String(cat || 'mains').trim();
    if (!c) return 'Menu';
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function itemImageUrl(item) {
    if (item._previewImageUrl) return String(item._previewImageUrl);
    const docId = normDocId(
      item.imageDocId || item.iconDocId || item.mediaDocId || item.thumbnailDocId || item.photoDocId,
    );
    return docId ? documentUrl(docId) : '';
  }

  function setBlockVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.hidden = false;
      el.removeAttribute('hidden');
    } else {
      el.hidden = true;
    }
  }

  function hasItemText(it) {
    return Boolean(String(it?.title || '').trim() || String(it?.description || it?.shortDesc || '').trim());
  }

  function featureItemHasContent(it) {
    return isActiveItem(it) && hasItemText(it);
  }

  function blogPostHasContent(p) {
    return (
      isActiveItem(p) &&
      Boolean(String(p?.title || '').trim() || String(p?.excerpt || p?.content || '').trim())
    );
  }

  function faqItemHasContent(f) {
    return isActiveItem(f) && Boolean(String(f?.question || '').trim());
  }

  function formatPostDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  function getContentLegalHost() {
    const page = document.getElementById('page-contact');
    if (!page) return null;
    let host = document.getElementById('wa-content-legal-host');
    if (!host) {
      const block = page.querySelector('.block .container');
      if (!block) return null;
      host = document.createElement('div');
      host.id = 'wa-content-legal-host';
      host.className = 'wa-content-legal-host';
      block.appendChild(host);
    }
    return host;
  }

  function removeLegacyContentLegalPanels() {
    ['wa-blog-panel', 'wa-faq-panel', 'wa-legal-panel'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function customPageSectionHasContent(s) {
    return (
      isActiveItem(s) &&
      Boolean(String(s?.heading || '').trim() || String(s?.content || '').trim())
    );
  }

  function customPageHasContent(p) {
    if (!isActiveItem(p)) return false;
    if (!String(p?.title || '').trim()) return false;
    const secs = (p?.sections || []).filter(customPageSectionHasContent);
    return secs.length > 0;
  }

  function tabItemHasContent(t) {
    return isActiveItem(t) && Boolean(String(t?.title || '').trim());
  }

  function slugToPageKey(slug) {
    const s =
      String(slug || 'page')
        .replace(/^\/+/, '')
        .replace(/[^a-z0-9-]+/gi, '-')
        .toLowerCase() || 'page';
    return 'custom-' + s;
  }

  function slugToPath(slug) {
    const s = String(slug || '').trim();
    if (!s) return '/page';
    return s.startsWith('/') ? s : '/' + s;
  }

  function buildCustomPageInnerHtml(page) {
    const secs = (page.sections || [])
      .filter(customPageSectionHasContent)
      .sort(function (a, b) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
    const body = secs
      .map(function (s) {
        const imgUrl = itemImageUrl(s);
        const img =
          imgUrl && s.imagePosition !== 'hidden'
            ? '<figure class="wa-custom-sec-img"><img src="' +
              escapeHtml(imgUrl) +
              '" alt="" loading="lazy"></figure>'
            : '';
        return (
          '<article class="wa-custom-sec">' +
          (s.heading ? '<h3>' + escapeHtml(s.heading) + '</h3>' : '') +
          (s.content ? '<div class="wa-legal-body">' + escapeHtml(s.content) + '</div>' : '') +
          img +
          '</article>'
        );
      })
      .join('');
    return (
      '<div class="menu-hero" style="background:none">' +
      '<div style="background:linear-gradient(rgba(26,26,26,.55),rgba(26,26,26,.75)),url(\'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2000&q=80\') center/cover;position:absolute;inset:0"></div>' +
      '<div><p>Custom page</p><h1>' +
      escapeHtml(page.title || '') +
      '</h1></div></div>' +
      '<section class="block"><div class="container">' +
      body +
      '</div></section>'
    );
  }

  function syncCustomPageNavLinks(pages) {
    const nav = document.getElementById('navLinks');
    if (!nav) return;
    nav.querySelectorAll('[data-wa-custom-nav]').forEach(function (n) {
      n.remove();
    });
    const bookBtn = nav.querySelector('.btn.btn-primary');
    pages
      .filter(function (p) {
        return Number(p.isInMenu) !== 0;
      })
      .sort(function (a, b) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      })
      .forEach(function (p) {
        const a = document.createElement('a');
        a.className = 'nav-link';
        a.setAttribute('data-wa-custom-nav', '1');
        a.setAttribute('data-page', slugToPageKey(p.slug));
        a.href = '#';
        a.textContent = p.title || 'Page';
        if (bookBtn) {
          nav.insertBefore(a, bookBtn);
        } else {
          nav.appendChild(a);
        }
      });
  }

  function applyCustomPages(g8) {
    const main = document.querySelector('main');
    if (!main) return;
    const pages = (g8?.customPages || []).filter(customPageHasContent);
    state.customPageRoutes = {};
    const wanted = new Set();
    pages.forEach(function (p) {
      const pageKey = slugToPageKey(p.slug);
      const pageId = 'page-' + pageKey;
      wanted.add(pageId);
      const path = slugToPath(p.slug);
      state.customPageRoutes[path] = pageKey;
      let el = document.getElementById(pageId);
      if (!el) {
        el = document.createElement('section');
        el.className = 'page';
        el.id = pageId;
        main.appendChild(el);
      }
      el.innerHTML = buildCustomPageInnerHtml(p);
    });
    document.querySelectorAll('section.page[id^="page-custom-"]').forEach(function (el) {
      if (!wanted.has(el.id)) {
        el.remove();
      }
    });
    syncCustomPageNavLinks(pages);
  }

  function buildTabsHtml(g8) {
    const section = g8?.tabSection || {};
    if (section && Number(section.isActive) === 0) return '';
    const items = (g8?.tabItems || [])
      .filter(tabItemHasContent)
      .sort(function (a, b) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
    const hasTitle = Boolean(String(section.title || '').trim() || String(section.subtitle || '').trim());
    if (!items.length && !hasTitle) return '';
    const buttons = items
      .map(function (t, i) {
        return (
          '<button type="button" class="wa-cms-tab' +
          (i === 0 ? ' active' : '') +
          '" data-tab="' +
          i +
          '">' +
          escapeHtml(t.title || 'Tab') +
          '</button>'
        );
      })
      .join('');
    const panels = items
      .map(function (t, i) {
        return (
          '<div class="wa-cms-tab-panel' +
          (i === 0 ? ' active' : '') +
          '" data-tab-panel="' +
          i +
          '"><div class="wa-legal-body">' +
          escapeHtml(t.content || '') +
          '</div></div>'
        );
      })
      .join('');
    const emptyHint =
      items.length > 0
        ? ''
        : '<p class="wa-content-block__lead">Add tabs with a title in Website Admin.</p>';
    return (
      '<section class="wa-content-block wa-content-block--tabs" id="wa-cms-tabs">' +
      '<span class="eyebrow">Tabs</span>' +
      '<h3 class="wa-content-block__title">' +
      escapeHtml(section.title || 'Tabs') +
      '</h3>' +
      (section.subtitle
        ? '<p class="wa-content-block__lead">' + escapeHtml(section.subtitle) + '</p>'
        : '') +
      (buttons ? '<div class="wa-cms-tabs">' + buttons + '</div>' : '') +
      (panels ? '<div class="wa-cms-tab-panels">' + panels + '</div>' : emptyHint) +
      '</section>'
    );
  }

  function wireCmsTabs(root) {
    if (!root || root._waTabsBound) return;
    root._waTabsBound = true;
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('.wa-cms-tab');
      if (!btn || !root.contains(btn)) return;
      const idx = btn.getAttribute('data-tab');
      root.querySelectorAll('.wa-cms-tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-tab') === idx);
      });
      root.querySelectorAll('.wa-cms-tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-tab-panel') === idx);
      });
    });
  }

  function featureIconHtml(iconClass) {
    const raw = String(iconClass || '').trim();
    if (!raw) return '';
    const map = {
      'pi-sun': '☀',
      'pi-calendar': '📅',
      'pi-star': '★',
      'pi-heart': '♥',
      'pi-map-marker': '📍',
      'pi-envelope': '✉',
    };
    const key = raw.replace(/^pi\s+/, 'pi-').toLowerCase();
    const glyph = map[key] || raw.replace(/^pi[-.\s]+/i, '').charAt(0).toUpperCase() || '✦';
    return '<div class="feat-icon" aria-hidden="true">' + escapeHtml(glyph) + '</div>';
  }

  function renderSectionHead(el, section) {
    if (!el || !section) return;
    const title = section.title != null ? String(section.title).trim() : '';
    const subtitle = section.subtitle != null ? String(section.subtitle).trim() : '';
    const desc = section.description != null ? String(section.description).trim() : '';
    el.innerHTML =
      (subtitle ? '<span class="eyebrow">' + escapeHtml(subtitle) + '</span>' : '') +
      (title ? '<h2>' + escapeHtml(title) + '</h2>' : '') +
      (desc ? '<p>' + escapeHtml(desc) + '</p>' : '');
    el.hidden = !title && !subtitle && !desc;
  }

  function stopTestiCarousel() {
    if (state.testiTimer) {
      clearInterval(state.testiTimer);
      state.testiTimer = null;
    }
  }

  function reinitTestimonialCarousel(autoplayOn) {
    stopTestiCarousel();
    const track = document.getElementById('track');
    const dotsEl = document.getElementById('dots');
    const prev = document.getElementById('prev');
    const next = document.getElementById('next');
    if (!track || !dotsEl) return;
    const slides = track.children;
    if (!slides.length) {
      dotsEl.innerHTML = '';
      return;
    }
    function goTestiSlide(i) {
      const len = slides.length;
      state.testiIdx = ((i % len) + len) % len;
      track.style.transform = 'translateX(-' + state.testiIdx * 100 + '%)';
      dotsEl.querySelectorAll('.dot').forEach(function (d, k) {
        d.classList.toggle('active', k === state.testiIdx);
      });
    }
    dotsEl.innerHTML = '';
    for (let i = 0; i < slides.length; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i === 0 ? ' active' : '');
      d.addEventListener('click', function () {
        goTestiSlide(i);
      });
      dotsEl.appendChild(d);
    }
    goTestiSlide(0);
    if (prev) prev.onclick = function () { goTestiSlide(state.testiIdx - 1); };
    if (next) next.onclick = function () { goTestiSlide(state.testiIdx + 1); };
    if (isOn(autoplayOn) && slides.length > 1) {
      state.testiTimer = window.setInterval(function () {
        goTestiSlide(state.testiIdx + 1);
      }, 5000);
    }
  }

  function menuItemHtml(item) {
    const img = itemImageUrl(item);
    const priceVal = item._previewPrice || servicePriceLabel(item);
    const price = priceVal ? '<span class="price">' + escapeHtml(String(priceVal)) + '</span>' : '';
    const shortPart = trimStr(item.shortDesc);
    const longPart = trimStr(item.description);
    const descParts = [];
    if (shortPart) descParts.push(shortPart);
    if (longPart && longPart !== shortPart) descParts.push(longPart);
    const desc = descParts.length ? descParts.map(function (d) { return escapeHtml(d); }).join('<br>') : '';
    return (
      '<div class="menu-item">' +
      (img ? '<img src="' + img + '" alt="' + escapeHtml(item.title || '') + '">' : '') +
      '<div class="info"><div class="row"><h4>' +
      escapeHtml(item.title || '') +
      '</h4>' +
      price +
      '</div>' +
      (desc ? '<p>' + desc + '</p>' : '') +
      '</div></div>'
    );
  }

  function isOn(v) {
    return v === 1 || v === true || v === '1';
  }

  function isActiveItem(it) {
    if (!it) return false;
    if (it.isActive === undefined || it.isActive === null) return true;
    return Number(it.isActive) !== 0;
  }

  function previewNavigate(page) {
    if (typeof window.__previewGo === 'function') {
      window.__previewGo(String(page || 'home'));
      scheduleReveals();
    }
  }

  function hexLuminance(hex) {
    if (!hex || typeof hex !== 'string') return 255;
    const h = hex.trim().replace('#', '');
    if (h.length < 6) return 255;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function normDocId(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function normOpacity(v, fallback) {
    if (v == null || v === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    return Math.min(1, Math.max(0, n));
  }

  function scheduleReveals() {
    if (typeof window.__waInitReveals !== 'function') return;
    if (state.revealTimer) window.clearTimeout(state.revealTimer);
    state.revealTimer = window.setTimeout(function () {
      state.revealTimer = null;
      window.__waInitReveals();
    }, 120);
  }

  function pickHeaderLogoDocId(header) {
    if (!header) return null;
    const light = normDocId(header.logoDocId);
    const dark = normDocId(header.logoDarkDocId);
    const bgLum = hexLuminance(header.bgColor || '#ffffff');
    const stickyLum = hexLuminance(header.stickyBgColor || header.bgColor || '#ffffff');
    const transparent = isOn(header.isTransparent);

    if (transparent && dark) return dark;
    if (bgLum < 140 && dark) return dark;
    if (transparent && stickyLum < 140 && dark) return dark;
    return light || dark || null;
  }

  function headerLogoUrl(header, docId) {
    if (!docId) return null;
    const light = normDocId(header.logoDocId);
    const dark = normDocId(header.logoDarkDocId);
    const previewLight = header._previewLogoUrl;
    const previewDark = header._previewLogoDarkUrl;
    const d = Number(docId);
    if (dark != null && Number(dark) === d && previewDark) return String(previewDark);
    if (light != null && Number(light) === d && previewLight) return String(previewLight);
    return documentUrl(docId);
  }

  function activeSocialLinks(g12) {
    return (g12?.socialLinks || []).filter((l) => l && l.isActive !== 0);
  }

  function socialIconChar(platform) {
    const p = String(platform || '').toLowerCase();
    if (p.includes('facebook')) return 'f';
    if (p.includes('instagram')) return '◉';
    if (p.includes('linkedin')) return 'in';
    if (p.includes('twitter') || p === 'x') return '𝕏';
    if (p.includes('youtube')) return '▶';
    if (p.includes('tiktok')) return '♪';
    if (p.includes('whatsapp')) return '✆';
    return '●';
  }

  function applyTopBar(g1, g12) {
    const bar = g1?.topBar;
    const socialBundle = g12 || state.bundles?.g12;
    const el = document.getElementById('topBar') || document.querySelector('.announce');
    const content = document.getElementById('announceContent');
    const meta = document.getElementById('announceMeta');
    const emailEl = document.getElementById('announceEmail');
    const phoneEl = document.getElementById('announcePhone');
    const socialEl = document.getElementById('announceSocial');
    if (!el) return;
    if (!bar || bar.isEnabled === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    if (bar.bgColor) el.style.background = bar.bgColor;
    if (bar.textColor) el.style.color = bar.textColor;
    if (content && bar.announcement != null) {
      const parts = String(bar.announcement).split('•').map((s) => s.trim()).filter(Boolean);
      if (parts.length) {
        content.innerHTML = parts.map((p) => '<span>' + escapeHtml(p) + '</span>').join('<span>•</span>');
      } else {
        content.textContent = String(bar.announcement);
      }
      const announceUrl = bar.announcementUrl ? String(bar.announcementUrl).trim() : '';
      content.style.cursor = announceUrl ? 'pointer' : '';
      content.onclick = announceUrl
        ? function (e) {
            e.preventDefault();
            if (isExternalUrl(announceUrl)) {
              window.open(announceUrl, '_blank', 'noopener');
            } else {
              const page = urlToPage(announceUrl);
              if (page) previewNavigate(page);
            }
          }
        : null;
    }
    let metaVisible = false;
    if (emailEl) {
      const show = isOn(bar.showEmail) && bar.email && String(bar.email).trim();
      emailEl.hidden = !show;
      if (show) {
        emailEl.href = 'mailto:' + String(bar.email).trim();
        emailEl.textContent = String(bar.email).trim();
        emailEl.style.color = bar.textColor || '';
        metaVisible = true;
      } else {
        emailEl.removeAttribute('href');
        emailEl.textContent = '';
      }
    }
    if (phoneEl) {
      const show = isOn(bar.showPhone) && bar.phone && String(bar.phone).trim();
      phoneEl.hidden = !show;
      if (show) {
        const p = String(bar.phone).trim();
        phoneEl.href = 'tel:' + p.replace(/\s+/g, '');
        phoneEl.textContent = p;
        phoneEl.style.color = bar.textColor || '';
        metaVisible = true;
      } else {
        phoneEl.removeAttribute('href');
        phoneEl.textContent = '';
      }
    }
    if (socialEl) {
      const links = activeSocialLinks(socialBundle);
      const show = isOn(bar.showSocial) && links.length;
      socialEl.hidden = !show;
      if (show) {
        socialEl.innerHTML = links
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
          .slice(0, 6)
          .map((l) => {
            const href = String(l.url || '').trim() || '#';
            const label = l.platform || l.label || 'Social';
            return (
              '<a href="' +
              escapeHtml(href) +
              '" target="_blank" rel="noopener" aria-label="' +
              escapeHtml(label) +
              '" title="' +
              escapeHtml(label) +
              '" style="color:inherit;text-decoration:none;font-weight:800;letter-spacing:0">' +
              escapeHtml(socialIconChar(label)) +
              '</a>'
            );
          })
          .join('');
        metaVisible = true;
      } else {
        socialEl.innerHTML = '';
      }
    }
    if (meta) meta.hidden = !metaVisible;
  }

  function headerLogoAlt(header) {
    if (!header || typeof header !== 'object') return 'Logo';
    const v = header.logoAlt ?? header.logo_alt ?? header.logoAltText ?? header['logo-alt'];
    if (v == null) return 'Logo';
    const s = String(v).trim();
    return s !== '' ? s : 'Logo';
  }

  /** Visible wordmark beside optional logo image (matches static “Saffron & Smoke” markup with <em> for “&”). */
  function appendHeaderLogoAltWordmark(logo, alt, opts) {
    const wm = document.createElement('span');
    wm.className = 'wa-logo-wordmark';
    if (opts && opts.ariaHidden) wm.setAttribute('aria-hidden', 'true');
    const splitTwo = alt.match(/^(.+?)\s+&\s+(.+)$/);
    if (splitTwo && !splitTwo[2].includes('&')) {
      wm.appendChild(document.createTextNode(splitTwo[1].trim() + ' '));
      const em = document.createElement('em');
      em.textContent = splitTwo[2].trim();
      wm.appendChild(em);
    } else {
      wm.appendChild(document.createTextNode(alt));
    }
    logo.appendChild(wm);
    return wm;
  }

  function renderHeaderLogoText(logo, header) {
    const alt = headerLogoAlt(header);
    const w = header.logoWidth != null && Number(header.logoWidth) > 0 ? Number(header.logoWidth) : 180;
    delete logo.dataset.logoDocId;
    logo.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    logo.appendChild(dot);
    appendHeaderLogoAltWordmark(logo, alt, null);
    logo.style.fontSize = Math.max(14, Math.round(w / 10)) + 'px';
  }

  function renderHeaderLogo(logo, header) {
    if (!logo || !header) return;
    const alt = headerLogoAlt(header);
    const w = header.logoWidth != null && Number(header.logoWidth) > 0 ? Number(header.logoWidth) : 180;
    const h = header.logoHeight != null && Number(header.logoHeight) > 0 ? Number(header.logoHeight) : 60;
    logo.setAttribute('aria-label', alt);
    logo.setAttribute('title', alt);

    const light = normDocId(header.logoDocId);
    const dark = normDocId(header.logoDarkDocId);
    const picked = pickHeaderLogoDocId(header);
    const docId = picked || light || dark;
    let url = null;
    if (docId) url = headerLogoUrl(header, docId);
    if (!url && header._previewLogoUrl) url = String(header._previewLogoUrl);
    if (!url && header._previewLogoDarkUrl) url = String(header._previewLogoDarkUrl);

    if (!logo.getAttribute('data-page')) logo.setAttribute('data-page', 'home');
    if (url) {
      logo.innerHTML = '';

      const img = document.createElement('img');
      img.className = 'wa-logo-img';
      if (docId) logo.dataset.logoDocId = String(docId);
      else delete logo.dataset.logoDocId;
      img.alt = alt;
      img.title = alt;
      img.style.width = w + 'px';
      img.style.maxWidth = w + 'px';
      img.style.height = h + 'px';
      img.style.maxHeight = h + 'px';
      img.style.objectFit = 'contain';
      img.style.flexShrink = '0';
      img.onerror = function () {
        renderHeaderLogoText(logo, header);
      };
      img.setAttribute('src', url);
      logo.appendChild(img);

      const wm = appendHeaderLogoAltWordmark(logo, alt, { ariaHidden: true });
      wm.style.fontSize = Math.max(13, Math.round(w / 10)) + 'px';
      wm.style.fontWeight = '900';
      wm.style.lineHeight = '1.15';
      wm.style.whiteSpace = 'nowrap';

      logo.style.fontSize = '';
      return;
    }

    renderHeaderLogoText(logo, header);
  }

  function appendHeaderCta(nav, header) {
    if (!nav || !header) return;
    const existing = nav.querySelector('.btn-primary');
    if (!isOn(header.showCtaButton)) {
      if (existing) existing.remove();
      return;
    }
    let cta = existing;
    if (!cta) {
      cta = document.createElement('a');
      cta.className = 'btn btn-primary';
      nav.appendChild(cta);
    }
    cta.textContent = header.ctaLabel || 'Book Now';
    const href = resolveAppNavUrl(header.ctaUrl || '#');
    cta.href = href;
    if (isOn(header.ctaOpenNewTab) || isExternalUrl(href)) {
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
      cta.removeAttribute('data-page');
    } else {
      cta.removeAttribute('target');
      cta.removeAttribute('rel');
      const page = urlToPage(href);
      if (page) cta.setAttribute('data-page', page);
      else cta.removeAttribute('data-page');
    }
  }

  function applyHeaderNavStyles(navEl, header) {
    if (!navEl) return;
    const stickyOn = !!(header && isOn(header.isSticky));
    if (stickyOn) {
      navEl.style.position = 'sticky';
      navEl.style.top = '0';
      navEl.style.zIndex = '50';
      navEl.classList.add('nav--sticky-enabled');
    } else {
      navEl.style.position = '';
      navEl.style.top = '';
      navEl.style.zIndex = '';
      navEl.classList.remove('nav--sticky-enabled');
    }
    if (!header) return;
    const bg =
      isOn(header.isTransparent) && header.stickyBgColor
        ? 'transparent'
        : header.bgColor || '';
    if (bg) navEl.style.background = bg;
    if (header.textColor) {
      navEl.style.color = header.textColor;
      navEl.querySelectorAll('.nav-links a:not(.btn-primary)').forEach((a) => {
        a.style.color = header.textColor;
      });
    }
    if (header.stickyBgColor) {
      navEl.style.setProperty('--nav-sticky-bg', header.stickyBgColor);
    }
    navEl.classList.toggle('nav--transparent', isOn(header.isTransparent));
    const picked = pickHeaderLogoDocId(header);
    navEl.dataset.logoMode = picked != null && picked === normDocId(header.logoDarkDocId) ? 'dark' : 'light';
  }

  function applyHeaderNav(g1) {
    const header = g1?.header;
    const navEl = document.getElementById('nav');
    const inner = document.querySelector('.nav-inner');
    const logo = document.querySelector('.logo');
    if (inner) {
      inner.classList.remove('layout-default', 'layout-centered', 'layout-minimal');
      const lt = String(header?.layoutType || 'default').toLowerCase();
      inner.classList.add('layout-' + (lt === 'centered' || lt === 'minimal' ? lt : 'default'));
    }
    applyHeaderNavStyles(navEl, header);
    if (header) renderHeaderLogo(logo, header);
    const nav = document.getElementById('navLinks');
    const menus = g1?.navMenus || [];
    const items = [];
    for (const menu of menus) {
      if (menu?.isActive === 0) continue;
      for (const it of menu.items || []) {
        if (it?.isActive === 0) continue;
        items.push(it);
      }
    }
    if (nav && items.length) {
      nav.innerHTML = '';
      items
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
        .forEach((it) => {
          const a = document.createElement('a');
          bindNavItemLink(a, it);
          nav.appendChild(a);
        });
    }
    if (header) appendHeaderCta(nav, header);
    if (logo) {
      logo.setAttribute('data-page', 'home');
      logo.href = '#';
    }
  }

  function isExternalUrl(url) {
    const u = String(url || '').trim().toLowerCase();
    return (
      u.startsWith('http://') ||
      u.startsWith('https://') ||
      u.startsWith('mailto:') ||
      u.startsWith('tel:')
    );
  }

  /** Map /auth/* (and public forms) to the Angular shell origin sent by GastronomicTemplateComponent. */
  function resolveAppNavUrl(url) {
    const raw = String(url || '').trim();
    if (!raw || raw === '#') return raw;
    if (isExternalUrl(raw)) return raw;
    const base = state.parentOrigin ? String(state.parentOrigin).replace(/\/$/, '') : '';
    if (!base) return raw;
    const pathOnly = raw.split(/[?#]/)[0] || '';
    if (
      pathOnly.startsWith('/auth') ||
      pathOnly === '/login' ||
      pathOnly === '/register' ||
      pathOnly.startsWith('/forms/')
    ) {
      return base + (pathOnly.startsWith('/') ? pathOnly : '/' + pathOnly);
    }
    return raw;
  }

  function urlToPage(url) {
    if (!url || isExternalUrl(url)) return null;
    const u = String(url).toLowerCase().replace(/^[#?]+/, '');
    const path = u.split('?')[0].split('#')[0];
    if (path === '/' || path === '/home' || path === 'home') return 'home';
    if (path.includes('menu')) return 'menu';
    if (path.includes('about') || path.includes('story')) return 'about';
    if (path.includes('gallery')) return 'gallery';
    if (path.includes('reserv') || path.includes('book')) return 'reservations';
    if (path.includes('review') || path.includes('testimonial')) return 'testimonials';
    if (path.includes('contact')) return 'contact';
    const routes = state.customPageRoutes || {};
    for (const routePath in routes) {
      if (!routePath) continue;
      const norm = routePath.replace(/^\/+/, '');
      if (path === routePath || path === '/' + norm || path.endsWith(routePath) || path.endsWith('/' + norm)) {
        return routes[routePath];
      }
    }
    return 'home';
  }

  function bindNavItemLink(anchor, item) {
    if (!anchor || !item) return;
    const url = resolveAppNavUrl(String(item.url || '#').trim() || '#');
    anchor.href = url;
    anchor.textContent = item.label || '';
    const highlighted = isOn(item.isHighlighted);
    anchor.className = 'nav-link' + (highlighted ? ' active' : '');
    if (isExternalUrl(url)) {
      anchor.removeAttribute('data-page');
      if (item.target === '_blank' || item.target === '_new' || isOn(item.openNewTab)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      } else {
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      }
      return;
    }
    const page = urlToPage(url);
    if (page) anchor.setAttribute('data-page', page);
    else anchor.removeAttribute('data-page');
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  }

  function bindHeroCtaLink(anchor, label, url, fallbackPage) {
    if (!anchor) return;
    anchor.textContent = label != null ? String(label) : '';
    const href = resolveAppNavUrl(url || '#');
    anchor.href = href;
    if (isExternalUrl(href)) {
      anchor.removeAttribute('data-page');
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      return;
    }
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
    const page = urlToPage(href) || fallbackPage;
    if (page) anchor.setAttribute('data-page', page);
    else anchor.removeAttribute('data-page');
  }

  function heroTitleEl(inner) {
    return inner ? inner.querySelector('#heroTitle') || inner.querySelector('h1') : null;
  }

  function heroDescEl(inner) {
    return inner ? inner.querySelector('#heroDescription') || inner.querySelector('p.tagline') : null;
  }

  function heroBadgeEl(inner) {
    return inner ? inner.querySelector('#heroBadge') || inner.querySelector('.badge') : null;
  }

  function hexToRgba(hex, alpha) {
    const a = alpha != null && !Number.isNaN(Number(alpha)) ? Number(alpha) : 0.45;
    if (!hex || typeof hex !== 'string') return 'rgba(26,26,26,' + a + ')';
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (h.length < 6) return 'rgba(26,26,26,' + a + ')';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(function (n) { return Number.isNaN(n); })) return 'rgba(26,26,26,' + a + ')';
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function slideHasContent(s) {
    if (!s || s.isActive === 0) return false;
    if (normDocId(s.bgImageDocId) || s._previewBgUrl) return true;
    if (s.title && String(s.title).trim()) return true;
    if (s.subtitle && String(s.subtitle).trim()) return true;
    if (s.description && String(s.description).trim()) return true;
    if (s.btnLabel && String(s.btnLabel).trim()) return true;
    if (s.bgColor && String(s.bgColor).trim()) return true;
    return false;
  }

  function carouselIsEnabled(g2) {
    const carousel = g2?.carousel || {};
    return carousel.isActive == null || isOn(carousel.isActive);
  }

  function carouselSlidesList(g2) {
    if (!carouselIsEnabled(g2)) return [];
    return (g2?.carouselSlides || [])
      .filter(function (s) {
        if (!s || s.isActive === 0) return false;
        if (state.waPreview) return true;
        return slideHasContent(s);
      })
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
  }

  function slideHasOwnOverlay(slide) {
    return (
      (slide.overlayColor && String(slide.overlayColor).trim()) ||
      (slide.overlayOpacity != null && slide.overlayOpacity !== '')
    );
  }

  function applyHeroBackground(bg, hero) {
    if (!bg || !hero) return;

    const vid = bg.querySelector('video.hero-bg-video');
    if (vid) vid.remove();

    bg.style.backgroundImage = '';
    bg.style.background = '';
    const bgType = String(hero.bgType || 'color').toLowerCase();

    if (bgType === 'video') {
      const videoSrc =
        (hero.bgVideoUrl && String(hero.bgVideoUrl).trim()) ||
        (normDocId(hero.bgVideoDocId) ? documentUrl(normDocId(hero.bgVideoDocId)) : '');
      if (videoSrc) {
        let el = bg.querySelector('video.hero-bg-video');
        if (!el) {
          el = document.createElement('video');
          el.className = 'hero-bg-video';
          el.setAttribute('playsinline', '');
          el.muted = true;
          el.loop = true;
          el.autoplay = true;
          bg.appendChild(el);
        }
        if (el.getAttribute('src') !== videoSrc) el.setAttribute('src', videoSrc);
        return;
      }
    }

    if (bgType === 'image') {
      const bgPreview = hero._previewBgUrl
        ? String(hero._previewBgUrl)
        : normDocId(hero.bgImageDocId)
          ? documentUrl(normDocId(hero.bgImageDocId))
          : '';
      if (bgPreview) {
        bg.style.backgroundImage = cssBackgroundImageUrl(bgPreview);
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
        return;
      }
    }

    if (bgType === 'gradient' && hero.bgColor) {
      const c = String(hero.bgColor).trim();
      bg.style.background =
        'linear-gradient(135deg, ' + c + ' 0%, rgba(26,26,26,.92) 55%, ' + c + ' 100%)';
      return;
    }

    if (hero.bgColor) {
      bg.style.background = hero.bgColor;
    }
  }

  function applyHeroTextColor(root, hero, slide) {
    const color = slide?.textColor || hero?.textColor;
    if (!color || !root) return;
    root.style.color = color;
    const inner = document.getElementById('heroInner');
    if (inner) {
      inner.style.color = color;
      inner
        .querySelectorAll('#heroTitle, #heroDescription, #heroBadge, .hero-cta a')
        .forEach(function (el) {
          if (!el.classList.contains('btn-primary') && !el.classList.contains('btn-gold')) {
            el.style.color =
              el.tagName === 'H1' || el.classList.contains('badge') || el.id === 'heroTitle' || el.id === 'heroBadge'
                ? ''
                : color;
          }
        });
    }
  }

  function applyHero(g2) {
    const hero = g2?.hero;
    const root = document.getElementById('hero') || document.querySelector('#page-home .hero');
    if (!root) return;
    const inner = document.getElementById('heroInner') || root.querySelector('.hero-inner');
    const overlay = document.getElementById('heroOverlay');
    const bg = document.getElementById('heroBg');
    const media = document.getElementById('heroMedia');
    const mediaImg = document.getElementById('heroMediaImg');
    if (!hero) return;

    if (hero.isActive === 0) {
      root.hidden = true;
      return;
    }
    root.hidden = false;

    root.classList.remove(
      'hero--layout-default', 'hero--layout-split', 'hero--layout-centered', 'hero--layout-fullscreen',
      'hero--media-left', 'hero--media-right', 'hero--media-center',
      'hero--align-left', 'hero--align-center', 'hero--align-right',
    );
    const layout = String(hero.layout || 'default').toLowerCase();
    const layoutClass = layout === 'split' || layout === 'centered' || layout === 'fullscreen' ? layout : 'default';
    root.classList.add('hero--layout-' + layoutClass);
    const mediaPos = String(hero.mediaPosition || 'right').toLowerCase();
    root.classList.add('hero--media-' + (mediaPos === 'left' || mediaPos === 'center' ? mediaPos : 'right'));
    const align = String(hero.textAlign || 'center').toLowerCase();
    root.classList.add('hero--align-' + (align === 'left' || align === 'right' ? align : 'center'));

    const minH = hero.minHeight != null && Number(hero.minHeight) > 0 ? Number(hero.minHeight) : null;
    root.style.minHeight = minH ? minH + 'px' : '';
    if (layoutClass === 'fullscreen') {
      root.style.height = '100vh';
    } else {
      root.style.height = '';
    }

    const slides = carouselSlidesList(g2);
    const slideCopyOverHero = slides.length > 0 && !state.waPreview;

    if (overlay && !slides.length) {
      overlay.style.background = hexToRgba(
        hero.overlayColor || '#1a1a1a',
        normOpacity(hero.overlayOpacity, 0.45),
      );
    }

    if (!slides.length) {
      applyHeroBackground(bg, hero);
    }

    const mediaId = normDocId(hero.mediaDocId);
    if (media && mediaImg) {
      const mediaPreview = hero._previewMediaUrl
        ? String(hero._previewMediaUrl)
        : mediaId
          ? documentUrl(mediaId)
          : '';
      if (mediaPreview) {
        media.hidden = false;
        if (mediaImg.getAttribute('src') !== mediaPreview) mediaImg.setAttribute('src', mediaPreview);
        mediaImg.alt = hero.title || 'Hero illustration';
      } else {
        media.hidden = true;
        mediaImg.removeAttribute('src');
      }
    }

    if (inner && !slideCopyOverHero) {
      const h1 = heroTitleEl(inner);
      const tag = heroDescEl(inner);
      const badge = heroBadgeEl(inner);
      if (hero.title != null && hero.title !== '' && h1) {
        const lines = String(hero.title).split('\n');
        h1.innerHTML = lines
          .map(function (l, i) { return i === 1 ? '<span class="accent">' + escapeHtml(l) + '</span>' : escapeHtml(l); })
          .join('<br>');
      }
      if (hero.subtitle && badge) setText(badge, hero.subtitle);
      if (hero.description && tag) setText(tag, hero.description);
      const ctas = inner.querySelectorAll('.hero-cta a');
      bindHeroCtaLink(ctas[0], hero.primaryBtnLabel, hero.primaryBtnUrl, 'reservations');
      bindHeroCtaLink(ctas[1], hero.secondaryBtnLabel, hero.secondaryBtnUrl, 'menu');
    }
    if (slides.length) {
      const idx = Math.min(state.carouselIndex || 0, slides.length - 1);
      if (slideCopyOverHero) {
        applySlideHeroContent(slides[idx], hero);
      } else {
        applySlideHeroInnerText(slides[idx], hero);
        applyHeroTextColor(root, hero, slides[idx]);
        applySlidePrimaryCtaOnly(slides[idx], hero);
      }
    } else {
      applyHeroTextColor(root, hero, null);
    }
  }

  function applySlideHeroInnerText(slide, hero) {
    const inner = document.getElementById('heroInner');
    if (!inner || !slide) return;
    const h1 = heroTitleEl(inner);
    const badge = heroBadgeEl(inner);
    const tag = heroDescEl(inner);
    const title = slide.title != null && slide.title !== '' ? slide.title : hero?.title;
    const subtitle = slide.subtitle != null && slide.subtitle !== '' ? slide.subtitle : hero?.subtitle;
    const description = slide.description != null && slide.description !== '' ? slide.description : hero?.description;
    if (title != null && title !== '' && h1) {
      const lines = String(title).split('\n');
      h1.innerHTML = lines
        .map(function (l, i) {
          return i === 1 ? '<span class="accent">' + escapeHtml(l) + '</span>' : escapeHtml(l);
        })
        .join('<br>');
    }
    if (subtitle && badge) setText(badge, subtitle);
    if (description && tag) setText(tag, description);
  }

  function applySlideHeroContent(slide, hero) {
    const inner = document.getElementById('heroInner');
    if (!inner || !slide) return;
    applySlideHeroInnerText(slide, hero);
    const ctas = inner.querySelectorAll('.hero-cta a');
    const slideBtnUrl = slide.btnUrl || hero?.primaryBtnUrl;
    bindHeroCtaLink(ctas[0], slide.btnLabel || hero?.primaryBtnLabel, slideBtnUrl, 'reservations');
    if (ctas[0]) {
      if (slide.btnTarget === '_blank' || slide.btnTarget === '_new') {
        ctas[0].target = '_blank';
        ctas[0].rel = 'noopener noreferrer';
      } else {
        ctas[0].removeAttribute('target');
        ctas[0].removeAttribute('rel');
      }
    }
    bindHeroCtaLink(ctas[1], hero?.secondaryBtnLabel, hero?.secondaryBtnUrl, 'menu');
    const root = document.getElementById('hero');
    if (root) applyHeroTextColor(root, hero, slide);
  }

  /** Website Admin preview: primary CTA uses slide when set, else hero; secondary stays hero. */
  function applySlidePrimaryCtaOnly(slide, hero) {
    const inner = document.getElementById('heroInner');
    if (!inner || !hero) return;
    const ctas = inner.querySelectorAll('.hero-cta a');
    if (!ctas[0]) return;
    const url =
      slide && slide.btnUrl != null && String(slide.btnUrl).trim() !== ''
        ? slide.btnUrl
        : hero.primaryBtnUrl;
    const label =
      slide && slide.btnLabel != null && String(slide.btnLabel).trim() !== ''
        ? slide.btnLabel
        : hero.primaryBtnLabel;
    bindHeroCtaLink(ctas[0], label, url, 'reservations');
    if (slide) {
      if (slide.btnTarget === '_blank' || slide.btnTarget === '_new') {
        ctas[0].target = '_blank';
        ctas[0].rel = 'noopener noreferrer';
      } else {
        ctas[0].removeAttribute('target');
        ctas[0].removeAttribute('rel');
      }
    }
  }

  function carouselIntervalMs(carousel) {
    if (!carousel) return 5000;
    const sec = Number(carousel.autoplaySeconds);
    if (Number.isFinite(sec) && sec > 0) return Math.min(60000, Math.max(1500, Math.round(sec * 1000)));
    const ms = Number(carousel.autoplaySpeed);
    if (Number.isFinite(ms) && ms > 0) return Math.min(60000, Math.max(1500, Math.round(ms)));
    return 5000;
  }

  function stopCarousel() {
    if (state.carouselTimer) {
      clearInterval(state.carouselTimer);
      state.carouselTimer = null;
    }
  }

  function slideBgUrl(slide) {
    if (!slide) return '';
    if (slide._previewBgUrl) return String(slide._previewBgUrl);
    const docId = normDocId(slide.bgImageDocId);
    if (docId) return documentUrl(docId);
    return '';
  }

  function carouselStepIndex(g2, delta) {
    const slides = carouselSlidesList(g2);
    if (!slides.length) return 0;
    const carousel = g2?.carousel || {};
    const len = slides.length;
    let next = state.carouselIndex + delta;
    if (isOn(carousel.loop) || len <= 1) {
      next = ((next % len) + len) % len;
    } else {
      next = Math.max(0, Math.min(len - 1, next));
    }
    return next;
  }

  function slideBgSignature(slide, hero) {
    const slideUrl = slideBgUrl(slide);
    if (slideUrl) return 'img:' + slideUrl;
    if (slide.bgColor && String(slide.bgColor).trim()) return 'color:' + String(slide.bgColor).trim();
    const heroSig =
      String(hero.bgType || 'color') +
      '|' +
      (hero._previewBgUrl || normDocId(hero.bgImageDocId) || hero.bgColor || '');
    return 'hero:' + heroSig;
  }

  function showCarouselSlide(g2, index) {
    const slides = carouselSlidesList(g2);
    if (!slides.length) return;
    const len = slides.length;
    const carousel = g2?.carousel || {};
    let i = index;
    if (isOn(carousel.loop) || len <= 1) {
      i = ((index % len) + len) % len;
    } else {
      i = Math.max(0, Math.min(len - 1, index));
    }
    const slide = slides[i];
    const hero = g2?.hero || {};
    const bgSig = slideBgSignature(slide, hero);
    const indexChanged = state.lastShownCarouselIndex !== i;
    const bgUnchanged = !indexChanged && bgSig === state.lastShownCarouselBgUrl;
    state.carouselIndex = i;
    state.lastShownCarouselIndex = i;
    state.lastShownCarouselBgUrl = bgSig;
    const bg = document.getElementById('heroBg');
    const overlay = document.getElementById('heroOverlay');
    const root = document.getElementById('hero');
    if (root) {
      const transition = String(g2?.carousel?.transition || 'slide').toLowerCase();
      root.classList.remove('hero--fade', 'hero--transition-slide');
      root.classList.add(transition === 'fade' ? 'hero--fade' : 'hero--transition-slide');
    }
    if (bg && !bgUnchanged) {
      if (state.carouselFadeTimer) {
        window.clearTimeout(state.carouselFadeTimer);
        state.carouselFadeTimer = null;
      }
      const slideUrl = slideBgUrl(slide);
      const applyBg = function () {
        bg.classList.remove('is-fading');
        if (slideUrl) {
          const vid = bg.querySelector('video.hero-bg-video');
          if (vid) vid.remove();
          bg.style.background = '';
          bg.style.backgroundImage = cssBackgroundImageUrl(slideUrl);
          bg.style.backgroundSize = 'cover';
          bg.style.backgroundPosition = 'center';
        } else if (slide.bgColor && String(slide.bgColor).trim()) {
          const vid = bg.querySelector('video.hero-bg-video');
          if (vid) vid.remove();
          bg.style.backgroundImage = '';
          bg.style.background = String(slide.bgColor).trim();
        } else {
          applyHeroBackground(bg, hero);
        }
      };
      if (root && root.classList.contains('hero--fade') && indexChanged) {
        bg.classList.add('is-fading');
        state.carouselFadeTimer = window.setTimeout(applyBg, 280);
      } else {
        applyBg();
      }
    }
    if (overlay) {
      if (slideHasOwnOverlay(slide)) {
        overlay.style.background = hexToRgba(
          slide.overlayColor || hero.overlayColor || '#1a1a1a',
          normOpacity(slide.overlayOpacity, normOpacity(hero.overlayOpacity, 0.45)),
        );
      } else {
        overlay.style.background = hexToRgba(
          hero.overlayColor || '#1a1a1a',
          normOpacity(hero.overlayOpacity, 0.45),
        );
      }
    }
    if (!state.waPreview) {
      applySlideHeroContent(slide, hero);
    } else {
      applySlideHeroInnerText(slide, hero);
      const root = document.getElementById('hero');
      if (root) applyHeroTextColor(root, hero, slide);
      applySlidePrimaryCtaOnly(slide, hero);
    }
    const dots = document.getElementById('heroCarouselDots');
    if (dots) {
      dots.querySelectorAll('.hero-carousel-dot').forEach(function (btn, idx) {
        btn.classList.toggle('is-active', idx === i);
      });
    }
  }

  function currentCarouselGroup() {
    return state.bundles && state.bundles.g2 ? state.bundles.g2 : {};
  }

  function bindCarouselControls() {
    if (state.carouselBound) return;
    const prev = document.getElementById('heroCarouselPrev');
    const next = document.getElementById('heroCarouselNext');
    if (prev) {
      prev.addEventListener('click', function () {
        const g2 = currentCarouselGroup();
        showCarouselSlide(g2, carouselStepIndex(g2, -1));
        restartCarouselAutoplay(g2);
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        const g2 = currentCarouselGroup();
        showCarouselSlide(g2, carouselStepIndex(g2, 1));
        restartCarouselAutoplay(g2);
      });
    }
    state.carouselBound = true;
  }

  function carouselStructureKey(g2) {
    const carousel = g2?.carousel || {};
    const slides = (g2?.carouselSlides || []).map(function (s, idx) {
      return {
        idx: idx,
        id: s?.id,
        isActive: s?.isActive,
        displayOrder: s?.displayOrder,
        bgImageDocId: normDocId(s?.bgImageDocId),
        previewBg: s?._previewBgUrl || '',
        bgColor: s?.bgColor && String(s.bgColor).trim() ? String(s.bgColor).trim() : '',
        title: s?.title != null ? String(s.title).trim() : '',
        subtitle: s?.subtitle != null ? String(s.subtitle).trim() : '',
        description: s?.description != null ? String(s.description).trim() : '',
        btnLabel: s?.btnLabel != null ? String(s.btnLabel).trim() : '',
        btnUrl: s?.btnUrl != null ? String(s.btnUrl).trim() : '',
        btnTarget: s?.btnTarget != null ? String(s.btnTarget) : '',
      };
    });
    return JSON.stringify({
      carousel: {
        autoplay: carousel.autoplay,
        autoplaySeconds: carousel.autoplaySeconds,
        autoplaySpeed: carousel.autoplaySpeed,
        transition: carousel.transition,
        showDots: carousel.showDots,
        showArrows: carousel.showArrows,
        loop: carousel.loop,
        isActive: carousel.isActive,
      },
      slides: slides,
    });
  }

  function carouselAutoplayKey(g2) {
    const carousel = g2?.carousel || {};
    const slides = carouselSlidesList(g2);
    return JSON.stringify({
      enabled: carouselIsEnabled(g2),
      on: carousel.autoplay == null || isOn(carousel.autoplay),
      ms: carouselIntervalMs(carousel),
      count: slides.length,
    });
  }

  function syncCarouselUi(g2, slides) {
    const carousel = g2?.carousel || {};
    const ui = document.getElementById('heroCarouselUi');
    const dots = document.getElementById('heroCarouselDots');
    const prev = document.getElementById('heroCarouselPrev');
    const next = document.getElementById('heroCarouselNext');
    const multi = slides.length > 1;
    const carouselActive = carouselIsEnabled(g2);
    const showArrows = carousel.showArrows == null || carousel.showArrows === '' || isOn(carousel.showArrows);
    const showDots = carousel.showDots == null || carousel.showDots === '' || isOn(carousel.showDots);

    if (ui) ui.hidden = !carouselActive;
    if (prev) prev.hidden = !carouselActive || !multi || !showArrows;
    if (next) next.hidden = !carouselActive || !multi || !showArrows;
    if (dots) {
      dots.hidden = !carouselActive || !multi || !showDots;
    }
  }

  function rebuildCarouselDots(g2, slides) {
    const carousel = g2?.carousel || {};
    const dots = document.getElementById('heroCarouselDots');
    if (!dots) return;
    const multi = slides.length > 1;
    const showDotsCfg = carousel.showDots == null || carousel.showDots === '' || isOn(carousel.showDots);
    if (multi && showDotsCfg && carouselIsEnabled(g2)) {
      const activeIdx = Math.min(state.carouselIndex || 0, slides.length - 1);
      dots.innerHTML = slides
        .map(function (_, idx) {
          return (
            '<button type="button" class="hero-carousel-dot' +
            (idx === activeIdx ? ' is-active' : '') +
            '" data-idx="' +
            idx +
            '" aria-label="Go to slide ' +
            (idx + 1) +
            '"></button>'
          );
        })
        .join('');
      dots.querySelectorAll('.hero-carousel-dot').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const idx = Number(btn.getAttribute('data-idx'));
          const live = currentCarouselGroup();
          showCarouselSlide(live, idx);
          restartCarouselAutoplay(live);
        });
      });
    } else {
      dots.innerHTML = '';
    }
  }

  function restartCarouselAutoplay(g2) {
    const group = g2 || currentCarouselGroup();
    const autoplayKey = carouselAutoplayKey(group);
    if (autoplayKey === state.lastCarouselAutoplayKey && state.carouselTimer) {
      return;
    }
    state.lastCarouselAutoplayKey = autoplayKey;
    const carousel = group?.carousel || {};
    const slides = carouselSlidesList(group);
    stopCarousel();
    const autoplayOn = carousel.autoplay == null || isOn(carousel.autoplay);
    if (slides.length > 1 && autoplayOn && carouselIsEnabled(group)) {
      state.carouselTimer = window.setInterval(function () {
        const live = currentCarouselGroup();
        showCarouselSlide(live, carouselStepIndex(live, 1));
      }, carouselIntervalMs(carousel));
    }
  }

  function updateCarouselLive(g2) {
    const slides = carouselSlidesList(g2);
    const ui = document.getElementById('heroCarouselUi');
    if (!slides.length) {
      if (ui) ui.hidden = true;
      state.carouselIndex = 0;
      state.lastShownCarouselIndex = -1;
      state.lastShownCarouselBgUrl = '';
      stopCarousel();
      applyHeroBackground(document.getElementById('heroBg'), g2?.hero || {});
      return;
    }
    if (state.carouselIndex >= slides.length) {
      state.carouselIndex = 0;
    }
    syncCarouselUi(g2, slides);
    showCarouselSlide(g2, state.carouselIndex);
    restartCarouselAutoplay(g2);
  }

  function applyCarousel(g2) {
    let structureKey = '';
    try {
      structureKey = carouselStructureKey(g2);
    } catch (e) {
      structureKey = '';
    }
    const slides = carouselSlidesList(g2);

    if (!slides.length) {
      state.lastCarouselKey = '';
      state.lastCarouselAutoplayKey = '';
      state.lastShownCarouselIndex = -1;
      state.lastShownCarouselBgUrl = '';
      stopCarousel();
      const ui = document.getElementById('heroCarouselUi');
      if (ui) ui.hidden = true;
      const dots = document.getElementById('heroCarouselDots');
      if (dots) {
        dots.innerHTML = '';
        dots.hidden = true;
      }
      applyHeroBackground(document.getElementById('heroBg'), g2?.hero || {});
      return;
    }

    if (structureKey && structureKey === state.lastCarouselKey) {
      updateCarouselLive(g2);
      return;
    }

    state.lastCarouselKey = structureKey;
    state.lastCarouselAutoplayKey = '';
    stopCarousel();
    bindCarouselControls();
    rebuildCarouselDots(g2, slides);
    syncCarouselUi(g2, slides);
    if (state.carouselIndex >= slides.length) {
      state.carouselIndex = 0;
    }
    showCarouselSlide(g2, state.carouselIndex);
    restartCarouselAutoplay(g2);
  }

  function applyTrustedBrands(g3) {
    const bundle = g3 || state.bundles?.g3;
    const section = trustedBrandSection(bundle);
    const block = document.getElementById('wa-trusted-brands');
    const head = document.getElementById('wa-trusted-head');
    const logosEl = document.getElementById('wa-trusted-logos');
    if (!block || !logosEl) return;

    if (section.isActive === 0) {
      block.hidden = true;
      logosEl.innerHTML = '';
      if (head) head.innerHTML = '';
      return;
    }

    const items = trustedBrandItems(bundle)
      .filter(function (l) {
        return l && l.isActive !== 0 && (logoItemSrc(l) || (l.name && String(l.name).trim()));
      })
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });

    const headHtml = trustedBrandHeadHtml(section);
    const hasHead = headHtml.length > 0;
    const hasLogos = items.length > 0;

    if (!hasHead && !hasLogos) {
      block.hidden = true;
      logosEl.innerHTML = '';
      if (head) head.innerHTML = '';
      return;
    }

    block.hidden = false;
    if (head) head.innerHTML = headHtml;

    logosEl.classList.remove('trusted-brands-logos--grey', 'trusted-brands-logos--marquee');
    if (isOn(section.isGrayscale)) logosEl.classList.add('trusted-brands-logos--grey');
    if (isOn(section.isMarquee)) logosEl.classList.add('trusted-brands-logos--marquee');

    if (!hasLogos) {
      logosEl.innerHTML = '';
      return;
    }

    const logoHtml = items
      .map(function (l) {
        const src = logoItemSrc(l);
        const name = escapeHtml(l.name || l.altText || 'Partner');
        const alt = escapeHtml(l.name || l.altText || 'Brand logo');
        const inner = src
          ? '<img src="' + src.replace(/"/g, '&quot;') + '" alt="' + alt + '">'
          : '<span class="trusted-brand-name">' + name + '</span>';
        const url = l.websiteUrl ? String(l.websiteUrl).trim() : '';
        if (url && url !== '#') {
          return '<a class="trusted-brand-link" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>';
        }
        return '<span class="trusted-brand-item">' + inner + '</span>';
      })
      .join('');

    if (isOn(section.isMarquee)) {
      logosEl.innerHTML = '<div class="trusted-marquee-track">' + logoHtml + logoHtml + '</div>';
    } else {
      logosEl.innerHTML = logoHtml;
    }
  }

  function statDisplayNumber(it) {
    const n = it.number != null && it.number !== '' ? it.number : it.statNumber;
    return String(n != null && n !== '' ? n : '');
  }

  function applyStats(g4) {
    const section = g4?.statsSection || {};
    const strip = document.getElementById('wa-stats-strip');
    const head = document.getElementById('wa-stats-head');
    const grid = document.getElementById('wa-stats-grid');
    if (!strip || !grid) return;

    if (section.isActive === 0) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    strip.classList.toggle('feature-strip--animated', isOn(section.isAnimated));
    if (section.bgColor) strip.style.background = section.bgColor;
    if (section.textColor) strip.style.color = section.textColor;

    if (head) {
      const title = section.title != null ? String(section.title).trim() : '';
      const subtitle = section.subtitle != null ? String(section.subtitle).trim() : '';
      head.innerHTML =
        (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') +
        (subtitle ? '<p>' + escapeHtml(subtitle) + '</p>' : '');
      head.hidden = !title && !subtitle;
    }

    const cols = Number(section.cols) || 4;
    grid.classList.remove('feature-strip-grid--cols-2', 'feature-strip-grid--cols-3');
    if (cols === 2) grid.classList.add('feature-strip-grid--cols-2');
    else if (cols === 3) grid.classList.add('feature-strip-grid--cols-3');

    const items = (g4?.statItems || [])
      .filter(function (i) { return i && i.isActive !== 0; })
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });

    if (!items.length) return;

    grid.innerHTML = items
      .map(function (it, idx) {
        const num = escapeHtml((it.prefix || '') + statDisplayNumber(it) + (it.suffix || ''));
        const cap = trimStr(it.label);
        const note = trimStr(it.description);
        let body = '';
        if (cap) body += '<p class="wa-stat-cap">' + escapeHtml(cap) + '</p>';
        if (note && note !== cap) {
          body +=
            '<p class="wa-stat-note" style="font-size:.85rem;opacity:.85;margin-top:.25rem">' +
            escapeHtml(note) +
            '</p>';
        }
        if (!body) {
          const one = trimStr(it.label || it.description);
          if (one) body = '<p>' + escapeHtml(one) + '</p>';
        }
        const delay = idx > 0 ? ' delay-' + Math.min(idx, 3) : '';
        return '<div class="reveal' + delay + '"><h4>' + num + '</h4>' + body + '</div>';
      })
      .join('');
  }

  function partnerLogoSrc(p) {
    if (p._previewLogoUrl) return String(p._previewLogoUrl);
    const docId = normDocId(p.logoDocId);
    if (docId) return documentUrl(docId);
    return p.logoUrl || '';
  }

  function applyPartners(g4) {
    const section = g4?.partnersSection || {};
    const block = document.getElementById('wa-partners-block');
    const titleEl = document.getElementById('wa-partners-title');
    const subtitleEl = document.getElementById('wa-partners-subtitle');
    const logos = document.getElementById('wa-partners-logos');
    if (!block || !logos) return;

    const partners = (g4?.partners || g4?.partnerItems || [])
      .filter(function (p) { return p && p.isActive !== 0; })
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });

    const showSection = section.isActive !== 0 && (partners.length || section.title || section.subtitle);
    block.hidden = !showSection;
    if (!showSection) return;

    if (titleEl) setText(titleEl, section.title || '');
    if (subtitleEl) setText(subtitleEl, section.subtitle || '');

    logos.innerHTML = partners
      .map(function (p) {
        const src = partnerLogoSrc(p);
        const name = escapeHtml(p.name || 'Partner');
        const inner = src
          ? '<img src="' + src.replace(/"/g, '&quot;') + '" alt="' + name + '">'
          : '<span class="partner-name">' + name + '</span>';
        const rawUrl = trimStr(p.websiteUrl);
        const href = rawUrl && rawUrl !== '#' ? resolveAppNavUrl(rawUrl) : '';
        const ext = href && isExternalUrl(href);
        const page = !ext && href ? internalPageFromUrl(href) : '';
        const tier = trimStr(p.tier);
        const desc = trimStr(p.description);
        const tierHtml = tier ? '<span class="wa-partner-tier" style="font-size:.72rem;color:var(--muted)">' + escapeHtml(tier) + '</span>' : '';
        const descHtml = desc
          ? '<p class="wa-partner-desc" style="font-size:.78rem;margin:.25rem 0 0;line-height:1.35;max-width:160px">' +
            escapeHtml(desc) +
            '</p>'
          : '';
        const logoBlock = href
          ? '<a class="partner-link" href="' +
            escapeHtml(href) +
            '"' +
            (ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
            (page ? ' data-page="' + escapeHtml(page) + '"' : '') +
            '>' +
            inner +
            '</a>'
          : '<span class="partner-item">' + inner + '</span>';
        return (
          '<div class="wa-partner-cell" style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:.25rem">' +
          logoBlock +
          tierHtml +
          descHtml +
          '</div>'
        );
      })
      .join('');
  }

  function setAboutHeroTitle(h1, title) {
    if (!h1 || title == null || String(title).trim() === '') return;
    const parts = String(title)
      .split('|')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (parts.length >= 2) {
      h1.innerHTML =
        escapeHtml(parts[0]) + ' <span>' + escapeHtml(parts.slice(1).join(' ')) + '</span>';
    } else {
      setText(h1, title);
    }
  }

  function teamMemberSocialHtml(m) {
    const links = [];
    if (m.linkedinUrl) {
      links.push(
        '<a href="' +
          escapeHtml(m.linkedinUrl) +
          '" target="_blank" rel="noopener">LinkedIn</a>',
      );
    }
    if (m.instagramUrl) {
      links.push(
        '<a href="' +
          escapeHtml(m.instagramUrl) +
          '" target="_blank" rel="noopener">Instagram</a>',
      );
    }
    if (m.twitterUrl) {
      links.push(
        '<a href="' + escapeHtml(m.twitterUrl) + '" target="_blank" rel="noopener">X</a>',
      );
    }
    if (m.facebookUrl) {
      links.push(
        '<a href="' +
          escapeHtml(m.facebookUrl) +
          '" target="_blank" rel="noopener">Facebook</a>',
      );
    }
    return links.length
      ? '<div class="about-team-social" style="display:flex;gap:.6rem;justify-content:center;margin-top:.5rem;flex-wrap:wrap">' +
          links.join('') +
          '</div>'
      : '';
  }

  function applyAbout(g5) {
    const about = g5?.about || {};
    const page = document.getElementById('page-about');
    if (!page) return;

    if (Number(about.isActive) === 0) {
      page.hidden = true;
      return;
    }
    page.hidden = false;

    const h1 = page.querySelector('.about-hero h1');
    const eyebrow = page.querySelector('.about-hero .eyebrow');
    const lead = page.querySelector('.about-hero .lead');
    if (about.title && h1) setAboutHeroTitle(h1, about.title);
    if (about.subtitle && eyebrow) setText(eyebrow, about.subtitle);
    if (about.description && lead) setText(lead, about.description);

    const chefImg = page.querySelector('.about-img img');
    if (chefImg) {
      const aboutImg = about._previewImageUrl
        ? String(about._previewImageUrl)
        : normDocId(about.imageDocId)
          ? documentUrl(normDocId(about.imageDocId))
          : '';
      if (aboutImg) {
        chefImg.src = aboutImg;
        chefImg.alt = about.founderName || about.title || 'About';
      }
    }

    const founderBlock = page.querySelector('.about-grid .reveal.delay-1');
    if (founderBlock) {
      const founderEyebrow = founderBlock.querySelector('.eyebrow');
      if (about.founderName && founderEyebrow) {
        setText(founderEyebrow, 'Meet the Chef');
      }
      if (about.founderName) {
        const h2 = founderBlock.querySelector('h2');
        if (h2) setText(h2, about.founderName);
      }
      let roleEl = founderBlock.querySelector('.wa-founder-role');
      if (about.founderTitle) {
        if (!roleEl) {
          roleEl = document.createElement('p');
          roleEl.className = 'wa-founder-role';
          roleEl.style.cssText = 'margin-top:.25rem;color:var(--saffron);font-weight:600;font-size:.95rem';
          const h2 = founderBlock.querySelector('h2');
          if (h2) h2.insertAdjacentElement('afterend', roleEl);
        }
        setText(roleEl, about.founderTitle);
      } else if (roleEl) {
        roleEl.remove();
      }
      const storyPs = founderBlock.querySelectorAll('p:not(.wa-founder-role)');
      if (about.mission && storyPs[0]) setText(storyPs[0], about.mission);
      if (about.vision && storyPs[1]) setText(storyPs[1], about.vision);
    }

    const quoteEl = page.querySelector('#wa-milestones-block .quote') || page.querySelector('.quote');
    if (quoteEl) {
      const quoteText = about.values || '';
      if (quoteText) {
        quoteEl.innerHTML =
          escapeHtml(quoteText) +
          (about.founderName
            ? '<span class="author">— ' + escapeHtml(about.founderName) + '</span>'
            : '');
      }
    }

    const teamSec = g5?.teamSection || {};
    const teamBlock = document.getElementById('wa-about-team-block');
    const teamHead = document.getElementById('wa-team-head');
    const teamGrid = document.getElementById('wa-team-grid');
    if (teamBlock) {
      teamBlock.hidden = teamSec.isActive != null && !isOn(teamSec.isActive);
    }
    if (teamHead && (teamSec.isActive == null || isOn(teamSec.isActive))) {
      const eyebrowEl = teamHead.querySelector('.eyebrow');
      const h2 = teamHead.querySelector('h2');
      const desc = teamSec.description || '';
      if (teamSec.subtitle && eyebrowEl) setText(eyebrowEl, teamSec.subtitle);
      if (teamSec.title && h2) setText(h2, teamSec.title);
      let descEl = teamHead.querySelector('.team-section-desc');
      if (desc) {
        if (!descEl) {
          descEl = document.createElement('p');
          descEl.className = 'team-section-desc';
          descEl.style.cssText = 'margin-top:.5rem;color:var(--muted)';
          teamHead.appendChild(descEl);
        }
        setText(descEl, desc);
      } else if (descEl) {
        descEl.remove();
      }
    }

    const members = (g5?.teamMembers || [])
      .filter(isActiveItem)
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });

    if (teamGrid && (teamSec.isActive == null || isOn(teamSec.isActive))) {
      const cols = Number(teamSec.cols) || 3;
      teamGrid.style.gridTemplateColumns = 'repeat(' + Math.min(4, Math.max(1, cols)) + ', 1fr)';
      if (!members.length) {
        teamGrid.innerHTML = '';
      } else {
        teamGrid.innerHTML = members
          .map(function (m) {
            const photoUrl = m._previewPhotoUrl
              ? String(m._previewPhotoUrl)
              : normDocId(m.photoDocId)
                ? documentUrl(normDocId(m.photoDocId))
                : '';
            const img = photoUrl
              ? '<img src="' + photoUrl + '" alt="' + escapeHtml(m.name || '') + '">'
              : '';
            const contact = [];
            if (m.email) {
              contact.push(
                '<a href="mailto:' +
                  escapeHtml(m.email) +
                  '" style="color:inherit">' +
                  escapeHtml(m.email) +
                  '</a>',
              );
            }
            if (m.phone) contact.push(escapeHtml(m.phone));
            return (
              '<article class="about-team-card reveal">' +
              img +
              '<h4>' +
              escapeHtml(m.name || '') +
              '</h4>' +
              '<p class="about-team-role">' +
              escapeHtml(m.designation || m.role || m.department || '') +
              '</p>' +
              (m.bio ? '<p class="about-team-bio">' + escapeHtml(m.bio) + '</p>' : '') +
              (contact.length
                ? '<p class="about-team-contact" style="font-size:.8rem;color:var(--muted);margin-top:.4rem">' +
                  contact.join(' · ') +
                  '</p>'
                : '') +
              teamMemberSocialHtml(m) +
              '</article>'
            );
          })
          .join('');
      }
    } else if (teamGrid) {
      teamGrid.innerHTML = '';
    }
    scheduleReveals();
  }

  function applyMilestones(g5) {
    const section = g5?.milestoneSection || {};
    const head = document.getElementById('wa-milestones-head');
    const timeline = document.getElementById('wa-milestones-timeline') || document.querySelector('#page-about .timeline');

    const milestoneBlock = document.getElementById('wa-milestones-block');
    if (milestoneBlock) {
      milestoneBlock.hidden = section.isActive != null && !isOn(section.isActive);
    }

    if (head && (section.isActive == null || isOn(section.isActive))) {
      const eyebrow = head.querySelector('.eyebrow');
      const h2 = head.querySelector('h2');
      if (section.subtitle && eyebrow) setText(eyebrow, section.subtitle);
      if (section.title && h2) setText(h2, section.title);
    }

    const items = (g5?.milestones || []).filter(isActiveItem);
    if (!timeline || !items.length || (section.isActive != null && !isOn(section.isActive))) {
      if (timeline && section.isActive != null && !isOn(section.isActive)) timeline.innerHTML = '';
      return;
    }
    const sorted = [...items].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    timeline.innerHTML = sorted
      .map((m, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        const year = escapeHtml(m.year || m.label || '');
        const title = escapeHtml(m.title || '');
        const desc = escapeHtml(m.description || '');
        const imgUrl = m._previewImageUrl
          ? String(m._previewImageUrl)
          : normDocId(m.imageDocId)
            ? documentUrl(normDocId(m.imageDocId))
            : '';
        const img = imgUrl
          ? '<img src="' +
            imgUrl +
            '" alt="" style="width:100%;border-radius:8px;margin-bottom:.6rem;max-height:120px;object-fit:cover">'
          : '';
        const icon = m.iconClass
          ? '<span class="' + escapeHtml(m.iconClass) + '" style="display:block;margin-bottom:.4rem"></span>'
          : '';
        const cardBody = icon + img + '<h4>' + title + '</h4><p>' + desc + '</p>';
        if (side === 'left') {
          return (
            '<div class="tl-item left reveal"><div class="tl-card">' +
            cardBody +
            '</div><div class="tl-dot"></div><div class="tl-year">' +
            year +
            '</div></div>'
          );
        }
        return (
          '<div class="tl-item right reveal"><div class="tl-year">' +
          year +
          '</div><div class="tl-dot"></div><div class="tl-card">' +
          cardBody +
          '</div></div>'
        );
      })
      .join('');
    scheduleReveals();
  }

  function applyTestimonials(g6) {
    const section = g6?.testimonialSection || {};
    const block = document.getElementById('wa-testimonials-block');
    if (block) {
      block.hidden = section.isActive != null && !isOn(section.isActive);
    }
    const eyebrow = document.getElementById('wa-testimonials-eyebrow');
    const title = document.getElementById('wa-testimonials-title');
    if (section.subtitle && eyebrow) setText(eyebrow, section.subtitle);
    if (section.title && title) setText(title, section.title);

    const track = document.getElementById('track');
    if (!track) return;
    const sorted = (g6?.testimonials || [])
      .filter(isActiveItem)
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
    if (!sorted.length || (section.isActive != null && !isOn(section.isActive))) {
      track.innerHTML = '';
      stopTestiCarousel();
      return;
    }
    track.innerHTML = sorted
      .map(function (t) {
        const photo = itemImageUrl(t);
        const stars = '★'.repeat(Math.min(5, Math.max(1, Number(t.rating) || 5)));
        const avatar = photo
          ? '<div class="avatar"><img src="' + photo + '" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></div>'
          : '<div class="avatar">' + initials(t.authorName) + '</div>';
        return (
          '<div class="slide"><div class="testi">' +
          avatar +
          '<div class="stars">' +
          stars +
          '</div><p>' +
          escapeHtml(t.review || '') +
          '</p><div class="name">' +
          escapeHtml(t.authorName || '') +
          '</div><div class="role">' +
          escapeHtml([t.designation, t.company].filter(Boolean).join(' · ')) +
          '</div></div></div>'
        );
      })
      .join('');
    track.dataset.bridgeManaged = '1';
    reinitTestimonialCarousel(section.autoplay);
  }

  function awardBadgeUrl(item) {
    if (!item) return '';
    if (item._previewBadgeUrl) return String(item._previewBadgeUrl);
    const docId = normDocId(item.badgeDocId);
    return docId ? documentUrl(docId) : '';
  }

  function applyAwards(g6) {
    const section = g6?.awardSection || {};
    const block = document.getElementById('wa-awards-block');
    const head = document.getElementById('wa-awards-head');
    const grid = document.getElementById('wa-awards-grid');
    if (!block || !grid) return;

    if (section.isActive != null && !isOn(section.isActive)) {
      block.hidden = true;
      grid.innerHTML = '';
      if (head) head.innerHTML = '';
      return;
    }

    const items = (g6?.awardItems || [])
      .filter(isActiveItem)
      .sort(function (a, b) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      })
      .filter(function (it) {
        return (
          it &&
          (awardBadgeUrl(it) ||
            (it.name && String(it.name).trim()) ||
            (it.issuer && String(it.issuer).trim()) ||
            (it.year && String(it.year).trim()) ||
            (it.description && String(it.description).trim()))
        );
      });

    renderSectionHead(head, section);

    if (!items.length) {
      block.hidden = true;
      grid.innerHTML = '';
      return;
    }

    block.hidden = false;
    grid.innerHTML = items
      .map(function (it) {
        const src = awardBadgeUrl(it);
        const img = src
          ? '<img src="' + src.replace(/"/g, '&quot;') + '" alt="" style="max-height:72px;width:auto;object-fit:contain;margin-bottom:.45rem">'
          : '';
        const name = escapeHtml(it.name || '');
        const meta = escapeHtml([it.issuer, it.year].filter(Boolean).join(' · '));
        const desc = it.description ? '<p style="color:var(--muted);font-size:.82rem;margin-top:.25rem;line-height:1.4">' + escapeHtml(String(it.description)) + '</p>' : '';
        return (
          '<div style="text-align:center;max-width:160px">' +
          img +
          (name ? '<div style="font-weight:700;font-size:.92rem">' + name + '</div>' : '') +
          (meta ? '<div style="color:var(--muted);font-size:.82rem;margin-top:.15rem">' + meta + '</div>' : '') +
          desc +
          '</div>'
        );
      })
      .join('');
    scheduleReveals();
  }

  function applyGallery(g6) {
    const section = g6?.gallerySection || {};
    const eyebrow = document.getElementById('wa-gallery-eyebrow');
    const title = document.getElementById('wa-gallery-title');
    if (section.subtitle && eyebrow) setText(eyebrow, section.subtitle);
    if (section.title && title) setText(title, section.title);
    renderSectionHead(document.getElementById('wa-gallery-head'), section);

    const masonry = document.getElementById('masonry');
    if (!masonry) return;
    if (section.isActive != null && !isOn(section.isActive)) {
      masonry.innerHTML = '';
      return;
    }
    const sorted = (g6?.galleryItems || [])
      .filter(isActiveItem)
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
    if (!sorted.length) return;
    masonry.innerHTML = sorted
      .map(function (it) {
        const src = itemImageUrl(it);
        if (!src) return '';
        const cat = trimStr(it.category);
        const cap = trimStr(it.caption);
        const alt = trimStr(it.altText) || cap || cat || 'Gallery image';
        const catHtml = cat
          ? '<span style="position:absolute;top:8px;left:8px;z-index:1;background:rgba(0,0,0,.55);color:#fff;font-size:.72rem;padding:.2rem .45rem;border-radius:4px">' +
            escapeHtml(cat) +
            '</span>'
          : '';
        const capHtml = cap
          ? '<div style="padding:.4rem .3rem 0;font-size:.82rem;color:var(--muted);text-align:center;line-height:1.35">' +
            escapeHtml(cap) +
            '</div>'
          : '';
        return (
          '<div class="item" style="position:relative">' +
          catHtml +
          '<img src="' +
          src +
          '" alt="' +
          escapeHtml(alt) +
          '">' +
          capHtml +
          '</div>'
        );
      })
      .join('');
  }

  function applyPortfolio(g6) {
    const section = g6?.portfolioSection || {};
    const block = document.getElementById('wa-portfolio-block');
    const head = document.getElementById('wa-portfolio-head');
    const grid = document.getElementById('wa-portfolio-grid');
    if (!block || !grid) return;

    const items = (g6?.portfolioItems || g6?.portfolio || [])
      .filter(isActiveItem)
      .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
    const show =
      (section.isActive == null || isOn(section.isActive)) && (items.length || section.title || section.subtitle);
    block.hidden = !show;
    if (!show) return;

    renderSectionHead(head, section);
    grid.innerHTML = items
      .map(function (it) {
        const src = itemImageUrl(it);
        const title = trimStr(it.title);
        const cat = trimStr(it.category);
        const client = trimStr(it.client);
        const desc = trimStr(it.description);
        const detail = trimStr(it.detailUrl);
        const catBadge = cat
          ? '<span style="display:inline-block;font-size:.72rem;font-weight:600;color:var(--saffron);margin-bottom:.35rem">' +
            escapeHtml(cat) +
            '</span>'
          : '';
        const imgHtml = src
          ? '<img src="' + src + '" alt="' + escapeHtml(title || 'Portfolio') + '">'
          : '<div style="aspect-ratio:4/3;background:rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.9rem">No image</div>';
        const inner =
          '<article class="portfolio-card">' +
          imgHtml +
          '<div class="body">' +
          catBadge +
          (title ? '<h4>' + escapeHtml(title) + '</h4>' : '') +
          (client ? '<p class="client">' + escapeHtml(client) + '</p>' : '') +
          (desc ? '<p>' + escapeHtml(desc) + '</p>' : '') +
          '</div></article>';
        if (detail) {
          const page = internalPageFromUrl(detail);
          return (
            '<a class="wa-portfolio-card-wrap" href="' +
            escapeHtml(resolveAppNavUrl(detail)) +
            '" style="text-decoration:none;color:inherit;display:block"' +
            (page ? ' data-page="' + escapeHtml(page) + '"' : '') +
            '>' +
            inner +
            '</a>'
          );
        }
        return inner;
      })
      .join('');
  }

  function renderDishCards(grid, picks, plans) {
    grid.innerHTML = picks
      .slice(0, 3)
      .map(function (item, idx) {
        const img = itemImageUrl(item);
        const price =
          item._previewPrice ||
          servicePriceLabel(item) ||
          (plans[idx] ? formatPlanPrice(plans[idx]) : '');
        const tag =
          item.badgeText ||
          (Number(item.isFeatured) === 1 ? 'Signature' : idx === 1 ? 'New' : "Chef's Pick");
        return (
          '<article class="dish-card reveal' +
          (idx ? ' delay-' + idx : '') +
          '"><div class="img"><span class="dish-tag">' +
          escapeHtml(tag) +
          '</span>' +
          (img ? '<img src="' + img + '" alt="' + escapeHtml(item.title || item.name || '') + '">' : '') +
          '</div><div class="body"><div class="row"><h3>' +
          escapeHtml(item.title || item.name || '') +
          '</h3>' +
          (price ? '<span class="price">' + escapeHtml(price) + '</span>' : '') +
          '</div>' +
          (function () {
            const sd = trimStr(item.shortDesc);
            const ld = trimStr(item.description);
            const body =
              sd && ld && ld !== sd ? escapeHtml(sd) + '<br>' + escapeHtml(ld) : escapeHtml(sd || ld || '');
            return body ? '<p class="desc">' + body + '</p>' : '<p class="desc"></p>';
          })() +
          '</div></article>'
        );
      })
      .join('');
  }

  function applyDishHighlights(g7) {
    const featSec = g7?.featureSection || {};
    const block = document.getElementById('wa-dish-block');
    const head = document.getElementById('wa-dish-head');
    const grid = document.getElementById('wa-dish-grid');
    if (!grid) return;

    const sectionActive = featSec.isActive == null || isOn(featSec.isActive);
    const featItems = (g7?.featureItems || []).filter(featureItemHasContent);
    const services = (g7?.services || []).filter(isActiveItem);
    const plans = (g7?.pricingPlans || []).filter(isActiveItem);

    let picks = [];
    if (featItems.length) {
      picks = featItems.slice(0, 3).map(function (it, idx) {
        return {
          title: it.title,
          shortDesc: it.description,
          imageDocId: it.imageDocId,
          iconDocId: it.iconDocId,
          _previewImageUrl: it._previewImageUrl,
          badgeText: idx === 0 ? 'Featured' : "Chef's Pick",
          isFeatured: 1,
        };
      });
    } else {
      picks = services.filter(function (s) {
        return Number(s.isFeatured) === 1;
      });
      if (!picks.length) picks = services.filter(hasItemText).slice(0, 3);
      if (!picks.length && plans.length) {
        picks = plans.slice(0, 3).map(function (p) {
          return {
            title: p.name,
            shortDesc: p.description,
            imageDocId: null,
            _previewPrice: formatPlanPrice(p),
            badgeText: p.badgeText,
          };
        });
      }
    }

    const show = sectionActive && picks.length;
    setBlockVisible(block, show);
    if (!show) {
      grid.innerHTML = '';
      return;
    }

    const headData = {
      title: featSec.title || "Tonight's Highlights",
      subtitle: featSec.subtitle || "Chef's Selection",
      description:
        featSec.description || 'Bold, seasonal plates pulled from our open-fire kitchen.',
    };
    if (head) {
      renderSectionHead(head, headData);
      head.hidden = false;
      head.removeAttribute('hidden');
    }

    renderDishCards(grid, picks, plans);
    scheduleReveals();
  }

  function applyFeaturesToTarget(blockId, headId, gridId, g7) {
    const section = g7?.featureSection || {};
    const block = document.getElementById(blockId);
    const head = document.getElementById(headId);
    const grid = document.getElementById(gridId);
    if (!block || !grid) return;

    const items = (g7?.featureItems || []).filter(featureItemHasContent).sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
    const hasHead =
      String(section.title || '').trim() ||
      String(section.subtitle || '').trim() ||
      String(section.description || '').trim();
    const show = (section.isActive == null || isOn(section.isActive)) && (items.length || hasHead);
    setBlockVisible(block, show);
    if (!show) {
      grid.innerHTML = '';
      return;
    }

    if (section.bgColor) block.style.background = section.bgColor;
    if (head) {
      renderSectionHead(head, section);
      head.hidden = false;
      head.removeAttribute('hidden');
    }
    const cols = Number(section.cols) || 3;
    grid.style.gridTemplateColumns = 'repeat(' + Math.min(4, Math.max(1, cols)) + ', 1fr)';
    grid.innerHTML = items.length
      ? items
          .map(function (it) {
            const img = itemImageUrl(it);
            const icon = featureIconHtml(it.iconClass);
            const btn =
              it.btnLabel && it.btnUrl && it.btnUrl !== '#'
                ? '<a class="btn btn-outline" href="' +
                  escapeHtml(resolveAppNavUrl(it.btnUrl)) +
                  '" style="margin-top:.75rem;display:inline-block">' +
                  escapeHtml(it.btnLabel) +
                  '</a>'
                : '';
            return (
              '<article class="feature-card reveal">' +
              icon +
              (img
                ? '<img src="' +
                  img +
                  '" alt="" style="width:100%;border-radius:8px;margin-bottom:.75rem">'
                : '') +
              '<h4>' +
              escapeHtml(it.title || '') +
              '</h4><p>' +
              escapeHtml(it.description || '') +
              '</p>' +
              btn +
              '</article>'
            );
          })
          .join('')
      : '<p style="grid-column:1/-1;text-align:center;color:var(--muted)">Add highlight items in Website Admin.</p>';
    scheduleReveals();
  }

  function applyFeatures(g7) {
    if (!g7) return;
    applyFeaturesToTarget('wa-features-block', 'wa-features-head', 'wa-features-grid', g7);
    applyFeaturesToTarget('wa-menu-features-block', 'wa-menu-features-head', 'wa-menu-features-grid', g7);
  }

  function readPricingPlanFeatures(plan) {
    if (!plan || typeof plan !== 'object') return [];
    let f = plan.features;
    if (!Array.isArray(f) && typeof f === 'string') {
      try {
        const parsed = JSON.parse(f);
        if (Array.isArray(parsed)) f = parsed;
      } catch (e) {
        f = [];
      }
    }
    return Array.isArray(f) ? f : [];
  }

  function renderPricingPlans(grid, plans, section, cycle) {
    grid.innerHTML = plans
      .map(function (p) {
        const price = formatPlanPrice(p, cycle);
        const popular = Number(p.isPopular) === 1;
        const feats = readPricingPlanFeatures(p)
          .filter(isActiveItem)
          .sort(function (a, b) {
            return (a.displayOrder || 0) - (b.displayOrder || 0);
          });
        const featHtml = feats.length
          ? '<ul class="plan-features">' +
            feats
              .map(function (f) {
                const inc = Number(f.isIncluded) !== 0;
                const label = trimStr(f.label) || trimStr(f.tooltip) || '—';
                const tip = trimStr(f.tooltip);
                return (
                  '<li class="' +
                  (inc ? '' : 'excluded') +
                  '"' +
                  (tip ? ' title="' + escapeHtml(tip) + '"' : '') +
                  '>' +
                  escapeHtml(label) +
                  '</li>'
                );
              })
              .join('') +
            '</ul>'
          : '';
        const badge =
          popular || p.badgeText
            ? '<span class="plan-badge">' + escapeHtml(p.badgeText || 'Popular') + '</span>'
            : '';
        const cta =
          p.btnLabel && p.btnUrl
            ? '<a class="btn btn-gold" href="' +
              escapeHtml(resolveAppNavUrl(p.btnUrl)) +
              '" style="margin-top:auto">' +
              escapeHtml(p.btnLabel) +
              '</a>'
            : '';
        return (
          '<article class="plan-card' +
          (popular ? ' popular' : '') +
          '">' +
          badge +
          '<h4>' +
          escapeHtml(p.name || '') +
          '</h4>' +
          (p.description ? '<p style="font-size:.9rem;opacity:.85">' + escapeHtml(p.description) + '</p>' : '') +
          (price ? '<div class="plan-price">' + escapeHtml(price) + '</div>' : '') +
          featHtml +
          cta +
          '</article>'
        );
      })
      .join('');
  }

  function applyPricing(g7) {
    const section = g7?.pricingSection || {};
    const block = document.getElementById('wa-menu-pricing');
    const head = document.getElementById('wa-pricing-head');
    const grid = document.getElementById('wa-pricing-grid');
    if (!block || !grid) return;

    const plans = (g7?.pricingPlans || []).filter(isActiveItem).sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
    const show = (section.isActive == null || isOn(section.isActive)) && plans.length;
    block.hidden = !show;
    if (!show) return;

    renderSectionHead(head, section);

    let toggleWrap = block.querySelector('.wa-pricing-toggle');
    const showToggle = isOn(section.showToggle);
    let cycle = block.dataset.waPriceCycle || 'monthly';

    if (showToggle) {
      if (!toggleWrap) {
        toggleWrap = document.createElement('div');
        toggleWrap.className = 'wa-pricing-toggle';
        head.insertAdjacentElement('afterend', toggleWrap);
      }
      const l1 = section.toggleLabel1 || 'Monthly';
      const l2 = section.toggleLabel2 || 'Annual';
      toggleWrap.innerHTML =
        '<button type="button" data-cycle="monthly"' +
        (cycle === 'monthly' ? ' class="active"' : '') +
        '>' +
        escapeHtml(l1) +
        '</button><button type="button" data-cycle="annual"' +
        (cycle === 'annual' ? ' class="active"' : '') +
        '>' +
        escapeHtml(l2) +
        (section.discountBadge
          ? ' <span style="font-size:.75rem;opacity:.8"> (' + escapeHtml(section.discountBadge) + ')</span>'
          : '') +
        '</button>';
      toggleWrap.querySelectorAll('button').forEach(function (btn) {
        btn.onclick = function () {
          cycle = btn.getAttribute('data-cycle') || 'monthly';
          block.dataset.waPriceCycle = cycle;
          toggleWrap.querySelectorAll('button').forEach(function (b) {
            b.classList.toggle('active', b === btn);
          });
          renderPricingPlans(grid, plans, section, cycle);
        };
      });
    } else if (toggleWrap) {
      toggleWrap.remove();
    }

    renderPricingPlans(grid, plans, section, cycle);
    scheduleReveals();
  }

  function applyProcess(g7) {
    const section = g7?.processSection || {};
    const block = document.getElementById('wa-process-block');
    const head = document.getElementById('wa-process-head');
    const grid = document.getElementById('wa-process-grid');
    if (!block || !grid) return;

    const steps = (g7?.processSteps || []).filter(isActiveItem).sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
    const show =
      (section.isActive == null || isOn(section.isActive)) &&
      (steps.length || section.title || section.subtitle);
    block.hidden = !show;
    if (!show) return;

    renderSectionHead(head, section);
    grid.innerHTML = steps
      .map(function (s, idx) {
        const img = itemImageUrl(s);
        const num = s.stepNumber != null ? s.stepNumber : idx + 1;
        const icon = s.iconClass
          ? '<div class="feat-icon"><i class="' + escapeHtml(s.iconClass) + '"></i></div>'
          : '';
        return (
          '<article class="process-step-card reveal">' +
          '<span class="step-num">' +
          escapeHtml(String(num)) +
          '</span>' +
          icon +
          (img ? '<img src="' + img + '" alt="" style="width:100%;border-radius:8px;margin:.5rem 0;max-height:80px;object-fit:cover">' : '') +
          '<h4>' +
          escapeHtml(s.title || '') +
          '</h4><p style="font-size:.88rem;color:var(--muted)">' +
          escapeHtml(s.description || '') +
          '</p></article>'
        );
      })
      .join('');
    scheduleReveals();
  }

  function applyServicesMenu(g7) {
    const section = g7?.serviceSection || {};
    const page = document.getElementById('page-menu');
    const eyebrow = document.getElementById('wa-menu-eyebrow');
    const title = document.getElementById('wa-menu-title');
    const hero = document.getElementById('wa-menu-hero');

    if (page && section.isActive != null && !isOn(section.isActive)) {
      if (hero) hero.style.opacity = '0.5';
    } else if (hero) {
      hero.style.opacity = '';
    }

    if (section.subtitle && eyebrow) setText(eyebrow, section.subtitle);
    if (section.title && title) setText(title, section.title);
    const leadText = trimStr(section.description);
    if (hero) {
      let lead = hero.querySelector('.menu-lead');
      if (leadText) {
        if (!lead) {
          lead = document.createElement('p');
          lead.className = 'menu-lead';
          lead.style.cssText = 'margin-top:.6rem;opacity:.85;max-width:520px';
          title?.insertAdjacentElement('afterend', lead);
        }
        lead.textContent = leadText;
      } else if (lead) {
        lead.remove();
      }
    }

    const services = (g7?.services || []).filter(isActiveItem);
    const container = document.getElementById('wa-menu-container') || document.querySelector('#page-menu .container');
    if (!container) return;

    if (!services.length) {
      return;
    }

    const byCat = {};
    services.forEach(function (s) {
      const cat = String(s.category || 'mains').toLowerCase().trim() || 'mains';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(s);
    });
    const cats = Object.keys(byCat).sort();
    const tabs = document.getElementById('menuTabs');
    if (tabs) {
      tabs.innerHTML = cats
        .map(function (c, i) {
          return (
            '<button type="button" class="menu-tab' +
            (i === 0 ? ' active' : '') +
            '" data-cat="' +
            escapeHtml(c) +
            '">' +
            escapeHtml(formatCategoryLabel(c)) +
            '</button>'
          );
        })
        .join('');
    }

    container.querySelectorAll('.menu-category').forEach(function (n) {
      n.remove();
    });

    cats.forEach(function (cat, idx) {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'menu-category' + (idx === 0 ? ' active' : '');
      sectionDiv.setAttribute('data-cat', cat);
      const menuGrid = document.createElement('div');
      menuGrid.className = 'menu-grid';
      byCat[cat]
        .sort(function (a, b) {
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        })
        .forEach(function (item) {
          menuGrid.insertAdjacentHTML('beforeend', menuItemHtml(item));
        });
      sectionDiv.appendChild(menuGrid);
      container.appendChild(sectionDiv);
    });
    scheduleReveals();
  }

  function applyServicesPricing(g7) {
    if (!g7) return;
    applyServicesMenu(g7);
    applyFeatures(g7);
    applyProcess(g7);
    applyPricing(g7);
    applyDishHighlights(g7);
  }

  function columnHeading(col) {
    return col?.heading || col?.title || '';
  }

  function formatOfficeAddress(loc) {
    if (!loc) return '';
    if (loc.address) return String(loc.address);
    return [
      loc.addressLine1,
      loc.addressLine2,
      [loc.city, loc.state].filter(Boolean).join(', '),
      loc.pincode,
      loc.country,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function internalPageFromUrl(url) {
    const u = String(url || '').trim();
    if (!u.startsWith('/')) return '';
    return u.replace(/^\//, '').split(/[?#]/)[0] || '';
  }

  function applyCtaStrip(g9) {
    const cta = g9?.ctaSection;
    const strip = document.querySelector('#page-home .cta-strip');
    if (!strip || !cta || Number(cta.isActive) === 0) return;
    const h2 = strip.querySelector('h2');
    const p = strip.querySelector('p');
    const btn = strip.querySelector('a');
    if (cta.title && h2) setText(h2, cta.title);
    const body = cta.subtitle || cta.description;
    if (body && p) setText(p, body);
    if (cta.bgColor) strip.style.background = cta.bgColor;
    if (cta.textColor) strip.style.color = cta.textColor;
    const buttons = (g9?.ctaButtons || [])
      .filter(isActiveItem)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const primary = buttons[0];
    if (primary && btn) {
      if (primary.label) btn.textContent = primary.label;
      if (primary.url) {
        btn.setAttribute('href', resolveAppNavUrl(primary.url));
        const page = internalPageFromUrl(primary.url);
        if (page) btn.setAttribute('data-page', page);
      }
      if (primary.target) btn.setAttribute('target', primary.target);
    }
  }

  function applyNewsletter(g9) {
    const ns = g9?.newsletterSection;
    const page = document.getElementById('page-contact');
    if (!page) return;
    let panel = document.getElementById('wa-newsletter-panel');
    if (!ns || Number(ns.isActive) === 0) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'wa-newsletter-panel';
      panel.className = 'container';
      panel.style.marginTop = '2rem';
      const block = page.querySelector('.block .container');
      if (block) block.appendChild(panel);
    }
    panel.innerHTML =
      '<div style="background:var(--cream);padding:1.6rem;border-radius:var(--radius);box-shadow:var(--shadow-md)">' +
      (ns.title ? '<h3 style="margin-bottom:.5rem">' + escapeHtml(ns.title) + '</h3>' : '') +
      (ns.subtitle ? '<p style="color:var(--muted);margin-bottom:1rem">' + escapeHtml(ns.subtitle) + '</p>' : '') +
      '<form class="wa-newsletter-form" style="display:flex;gap:.6rem;flex-wrap:wrap">' +
      '<input type="email" required placeholder="' +
      escapeHtml(ns.placeholder || 'Your email') +
      '" style="flex:1;min-width:200px;padding:.65rem 1rem;border:1px solid #ddd;border-radius:6px">' +
      '<button type="submit" class="btn btn-primary">' +
      escapeHtml(ns.btnLabel || 'Subscribe') +
      '</button></form></div>';
    panel.querySelector('form')?.addEventListener('submit', function (e) {
      e.preventDefault();
      const ok = panel.querySelector('.wa-newsletter-ok');
      if (!ok) {
        const p = document.createElement('p');
        p.className = 'wa-newsletter-ok';
        p.style.cssText = 'margin-top:.8rem;color:var(--crimson);font-weight:700';
        p.textContent = ns.successMsg || 'Thanks for subscribing!';
        panel.querySelector('div')?.appendChild(p);
      }
    });
  }

  function applyContact(g9) {
    const contact = g9?.contactSection;
    const page = document.getElementById('page-contact');
    if (!page || !contact || Number(contact.isActive) === 0) return;
    const heroH1 = page.querySelector('.menu-hero h1');
    if (contact.title && heroH1) setText(heroH1, contact.title);
    const h2 = page.querySelector('.contact-grid h2');
    if (contact.subtitle && h2) setText(h2, contact.subtitle);
    const locations = (g9?.officeLocations || [])
      .filter(isActiveItem)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const hq =
      locations.find((l) => Number(l.isHeadquarters) === 1) || locations[0];
    const cards = page.querySelectorAll('.contact-info .info-card');
    if (hq && cards[0]) {
      const p = cards[0].querySelector('p');
      const addr = formatOfficeAddress(hq);
      if (addr && p) p.innerHTML = escapeHtml(addr).replace(/\n/g, '<br>');
    }
    const phone = contact.phone || hq?.phone;
    const email = contact.email || hq?.email;
    if (phone && cards[1]) setText(cards[1].querySelector('p'), phone);
    if (email && cards[2]) setText(cards[2].querySelector('p'), email);
    const mapEl = page.querySelector('.map');
    const embed = contact.mapEmbedUrl || hq?.mapEmbedUrl;
    if (mapEl) {
      if (Number(contact.showMap) !== 0 && embed) {
        mapEl.innerHTML =
          '<iframe title="Map" src="' +
          escapeHtml(embed) +
          '" style="width:100%;height:220px;border:0;border-radius:var(--radius)" loading="lazy"></iframe>';
      } else if (Number(contact.showMap) === 0) {
        mapEl.style.display = 'none';
      }
    }
    const hoursText = contact.workingHours || hq?.workingHours;
    const hoursEl = page.querySelector('.hours');
    if (hoursText && hoursEl) {
      const lines = String(hoursText)
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) {
        hoursEl.innerHTML =
          '<h3>Opening Hours</h3>' +
          lines
            .map(function (line) {
              const parts = line.split(/[:\-–—]/);
              if (parts.length >= 2) {
                return (
                  '<div class="row"><span class="day">' +
                  escapeHtml(parts[0].trim()) +
                  '</span><span class="time">' +
                  escapeHtml(parts.slice(1).join(':').trim()) +
                  '</span></div>'
                );
              }
              return '<div class="row"><span class="day">' + escapeHtml(line) + '</span></div>';
            })
            .join('');
      }
    }
    const quickForm = page.querySelector('#quickForm');
    if (quickForm) {
      if (Number(contact.showForm) === 0) {
        quickForm.style.display = 'none';
      } else {
        quickForm.style.display = '';
        const formTitle = quickForm.querySelector('h3');
        if (contact.formTitle && formTitle) setText(formTitle, contact.formTitle);
      }
    }
    applyNewsletter(g9);
  }

  function applyFooter(g10, g12) {
    const footer = g10?.footer;
    const bottom = g10?.footerBottom;
    const footEl = document.querySelector('footer');
    if (!footEl) return;
    if (footer && Number(footer.isActive) === 0) {
      footEl.style.display = 'none';
      return;
    }
    footEl.style.display = '';
    const brand = footEl.querySelector('.brand');
    const tag = footEl.querySelector('.tag');
    if (footer?.tagline && brand) setText(brand, footer.tagline);
    if (footer?.description && tag) setText(tag, footer.description);
    const cols = (footer?.columns || [])
      .filter(isActiveItem)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const footCols = footEl.querySelectorAll('.foot-grid > div');
    cols.forEach((col, i) => {
      const el = footCols[i + 1];
      if (!el) return;
      const heading = columnHeading(col);
      const h5 = el.querySelector('h5');
      if (heading && h5) setText(h5, heading);
      const ul = el.querySelector('ul');
      if (ul && col.links?.length) {
        ul.innerHTML = col.links
          .filter(isActiveItem)
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
          .map(function (l) {
            const page = internalPageFromUrl(l.url);
            const attrs =
              ' href="' +
              escapeHtml(l.url || '#') +
              '"' +
              (l.target ? ' target="' + escapeHtml(l.target) + '"' : '') +
              (page ? ' data-page="' + escapeHtml(page) + '"' : '');
            return '<li><a' + attrs + '>' + escapeHtml(l.label || '') + '</a></li>';
          })
          .join('');
      }
    });
    const socialWrap = footEl.querySelector('#wa-footer-socials');
    if (socialWrap) {
      const followCol = socialWrap.parentElement;
      const showSoc = footer && (footer.showSocial == null || Number(footer.showSocial) !== 0);
      if (!showSoc) {
        socialWrap.innerHTML = '';
        if (followCol) followCol.style.display = 'none';
      } else {
        if (followCol) followCol.style.display = '';
        const rawLinks = (g12 && g12.socialLinks) || [];
        const links = rawLinks
          .filter(isActiveItem)
          .filter(function (l) {
            return l && (l.showFooter == null || Number(l.showFooter) !== 0);
          })
          .sort(function (a, b) {
            return (a.displayOrder || 0) - (b.displayOrder || 0);
          });
        if (links.length) {
          socialWrap.innerHTML = links
            .map(function (l) {
              const url = trimStr(l.url) || '#';
              const href = url !== '#' ? resolveAppNavUrl(url) : '#';
              const ext = href !== '#' && isExternalUrl(href);
              const lab = trimStr(l.platform) || 'Social';
              const shortLab = lab.length > 2 ? lab.slice(0, 2).toUpperCase() : lab.toUpperCase();
              const ic = trimStr(l.iconClass);
              const inner = ic
                ? '<i class="' + escapeHtml(ic) + '" aria-hidden="true"></i>'
                : escapeHtml(shortLab);
              return (
                '<a href="' +
                escapeHtml(href) +
                '" aria-label="' +
                escapeHtml(lab) +
                '"' +
                (ext ? ' target="_blank" rel="noopener noreferrer"' : '') +
                '>' +
                inner +
                '</a>'
              );
            })
            .join('');
        } else {
          socialWrap.innerHTML = '';
        }
      }
    }
    const spans = footEl.querySelectorAll('.foot-bot span');
    const copyText = bottom?.copyrightText || bottom?.rightText;
    if (copyText && spans[0]) setText(spans[0], copyText);
    const footBot = footEl.querySelector('.foot-bot');
    if (footBot && bottom) {
      let legal = footBot.querySelector('.wa-foot-legal');
      const links = [];
      if (Number(bottom.showPrivacy) !== 0 && bottom.privacyLabel) {
        links.push(
          '<a href="' +
            escapeHtml(bottom.privacyUrl || '/privacy') +
            '">' +
            escapeHtml(bottom.privacyLabel) +
            '</a>',
        );
      }
      if (Number(bottom.showTerms) !== 0 && bottom.termsLabel) {
        links.push(
          '<a href="' +
            escapeHtml(bottom.termsUrl || '/terms') +
            '">' +
            escapeHtml(bottom.termsLabel) +
            '</a>',
        );
      }
      if (Number(bottom.showRefund) !== 0 && bottom.refundLabel) {
        links.push(
          '<a href="' +
            escapeHtml(bottom.refundUrl || '/refund') +
            '">' +
            escapeHtml(bottom.refundLabel) +
            '</a>',
        );
      }
      if (links.length) {
        if (!legal) {
          legal = document.createElement('span');
          legal.className = 'wa-foot-legal';
          legal.style.cssText = 'display:flex;gap:1rem;flex-wrap:wrap';
          footBot.appendChild(legal);
        }
        legal.innerHTML = links.join('');
      } else if (legal) {
        legal.remove();
      }
    }
  }

  function buildBlogHtml(g8) {
    const section = g8?.blogSection || {};
    if (section && Number(section.isActive) === 0) return '';
    let posts = (g8?.blogPosts || []).filter(blogPostHasContent);
    posts = posts.sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });
    const limit = Number(section.postsCount);
    if (Number.isFinite(limit) && limit > 0) {
      posts = posts.slice(0, limit);
    }
    if (!posts.length) return '';
    const showDate = section.showDate == null || Number(section.showDate) !== 0;
    const showCategory = Number(section.showCategory) !== 0;
    const title = section.title || 'From the blog';
    const cards = posts
      .map(function (p) {
        const date = showDate ? formatPostDate(p.publishedAt) : '';
        const meta = [date, p.readTime ? p.readTime + ' min read' : '', showCategory && p.category ? p.category : '']
          .filter(Boolean)
          .join(' · ');
        return (
          '<article class="wa-blog-card">' +
          '<h4>' +
          escapeHtml(p.title || '') +
          '</h4>' +
          (meta ? '<p class="wa-blog-meta">' + escapeHtml(meta) + '</p>' : '') +
          (p.excerpt ? '<p class="wa-blog-excerpt">' + escapeHtml(p.excerpt) + '</p>' : '') +
          '</article>'
        );
      })
      .join('');
    return (
      '<section class="wa-content-block wa-content-block--blog">' +
      '<span class="eyebrow">Blog</span>' +
      '<h3 class="wa-content-block__title">' +
      escapeHtml(title) +
      '</h3>' +
      (section.subtitle
        ? '<p class="wa-content-block__lead">' + escapeHtml(section.subtitle) + '</p>'
        : '') +
      '<div class="wa-blog-grid">' +
      cards +
      '</div></section>'
    );
  }

  function buildFaqHtml(g8) {
    const section = g8?.faqSection || {};
    if (section && Number(section.isActive) === 0) return '';
    const items = (g8?.faqItems || [])
      .filter(faqItemHasContent)
      .sort(function (a, b) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      });
    const title = section.title || 'FAQ';
    const hasTitle = Boolean(String(title).trim() || String(section.subtitle || '').trim());
    if (!items.length && !hasTitle) return '';
    const list =
      items.length > 0
        ? items
            .map(function (f) {
              return (
                '<details class="wa-faq-item"><summary>' +
                escapeHtml(f.question || '') +
                '</summary><p>' +
                escapeHtml(f.answer || '') +
                '</p></details>'
              );
            })
            .join('')
        : '<p class="wa-content-block__lead">Add FAQ items with a question in Website Admin.</p>';
    return (
      '<section class="wa-content-block wa-content-block--faq">' +
      '<span class="eyebrow">FAQ</span>' +
      '<h3 class="wa-content-block__title">' +
      escapeHtml(title) +
      '</h3>' +
      (section.subtitle
        ? '<p class="wa-content-block__lead">' + escapeHtml(section.subtitle) + '</p>'
        : '') +
      '<div class="wa-faq-list">' +
      list +
      '</div></section>'
    );
  }

  function buildLegalHtml(g8) {
    const blocks = [
      { key: 'legalPrivacy', sections: 'legalPrivacySections', fallback: 'Privacy Policy' },
      { key: 'legalTerms', sections: 'legalTermsSections', fallback: 'Terms of Service' },
      { key: 'legalRefund', sections: 'legalRefundSections', fallback: 'Refund Policy' },
    ];
    const parts = [];
    blocks.forEach(function (b) {
      const doc = g8?.[b.key];
      const secs = (g8?.[b.sections] || []).filter(isActiveItem);
      if (!doc && !secs.length) return;
      if (doc && Number(doc.isActive) === 0) return;
      const heading = doc?.pageTitle || doc?.title || b.fallback;
      parts.push('<h3 class="wa-content-block__title">' + escapeHtml(heading) + '</h3>');
      if (doc?.intro || doc?.content) {
        parts.push(
          '<div class="wa-legal-body">' + escapeHtml(doc.intro || doc.content || '') + '</div>',
        );
      }
      secs
        .sort(function (a, b) {
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        })
        .forEach(function (s) {
          const h = s.heading || s.title || '';
          const body = s.content || s.body || '';
          if (!String(h).trim() && !String(body).trim()) return;
          parts.push(
            '<h4 class="wa-legal-sub">' +
              escapeHtml(h) +
              '</h4><p class="wa-legal-body">' +
              escapeHtml(body) +
              '</p>',
          );
        });
    });
    if (!parts.length) return '';
    return '<section class="wa-content-block wa-content-block--legal">' + parts.join('') + '</section>';
  }

  function applyContentLegal(g8) {
    removeLegacyContentLegalPanels();
    applyCustomPages(g8);
    const host = getContentLegalHost();
    if (!host) return;
    if (!g8) {
      host.innerHTML = '';
      setBlockVisible(host, false);
      return;
    }
    const html = [buildBlogHtml(g8), buildFaqHtml(g8), buildTabsHtml(g8), buildLegalHtml(g8)]
      .filter(Boolean)
      .join('');
    if (!html) {
      host.innerHTML = '';
      setBlockVisible(host, false);
      return;
    }
    host.innerHTML = html;
    setBlockVisible(host, true);
    wireCmsTabs(host);
    scheduleReveals();
  }

  function applyCookieConsent(g11) {
    const cookie = g11?.cookieConsent;
    let bar = document.getElementById('wa-cookie-bar');
    if (!cookie || Number(cookie.isActive) === 0) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'wa-cookie-bar';
      bar.style.cssText =
        'position:fixed;bottom:0;left:0;right:0;background:#1a1a1a;color:#fff;padding:1rem 1.5rem;z-index:9999;display:flex;gap:1rem;align-items:center;justify-content:center;flex-wrap:wrap';
      document.body.appendChild(bar);
    }
    if (cookie.bgColor) bar.style.background = cookie.bgColor;
    if (cookie.textColor) bar.style.color = cookie.textColor;
    const acceptLabel = cookie.acceptLabel || cookie.btnLabel || 'Accept';
    const rejectLabel = cookie.rejectLabel || '';
    const policy =
      cookie.policyLabel && cookie.policyUrl
        ? '<a href="' +
          escapeHtml(cookie.policyUrl) +
          '" style="color:inherit;text-decoration:underline">' +
          escapeHtml(cookie.policyLabel) +
          '</a>'
        : '';
    bar.innerHTML =
      '<span>' +
      escapeHtml(cookie.message || cookie.text || 'We use cookies to improve your experience.') +
      (policy ? ' ' + policy : '') +
      '</span>' +
      (rejectLabel
        ? '<button type="button" data-wa-cookie-reject style="padding:.5rem 1rem;background:transparent;border:1px solid currentColor;border-radius:4px;cursor:pointer;color:inherit">' +
          escapeHtml(rejectLabel) +
          '</button>'
        : '') +
      '<button type="button" data-wa-cookie-accept style="padding:.5rem 1rem;background:var(--gold);border:0;border-radius:4px;cursor:pointer">' +
      escapeHtml(acceptLabel) +
      '</button>';
    bar.querySelector('[data-wa-cookie-accept]')?.addEventListener('click', () => bar.remove());
    bar.querySelector('[data-wa-cookie-reject]')?.addEventListener('click', () => bar.remove());
  }

  function applyPopup(g11) {
    const popup = g11?.popup;
    let el = document.getElementById('wa-popup');
    if (!popup || Number(popup.isActive) === 0) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'wa-popup';
      el.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem';
      document.body.appendChild(el);
    }
    const show = function () {
      el.style.display = 'flex';
      el.innerHTML =
        '<div style="background:#fff;max-width:480px;width:100%;padding:1.6rem;border-radius:12px;position:relative">' +
        '<button type="button" data-wa-popup-close style="position:absolute;top:.6rem;right:.8rem;border:0;background:transparent;font-size:1.4rem;cursor:pointer">×</button>' +
        (popup.title ? '<h3 style="margin-bottom:.6rem">' + escapeHtml(popup.title) + '</h3>' : '') +
        (popup.content ? '<p style="color:var(--muted);margin-bottom:1rem">' + escapeHtml(popup.content) + '</p>' : '') +
        (popup.btnLabel
          ? '<a class="btn btn-primary" href="' +
            escapeHtml(resolveAppNavUrl(popup.btnUrl || '#')) +
            '">' +
            escapeHtml(popup.btnLabel) +
            '</a>'
          : '') +
        '</div>';
      el.querySelector('[data-wa-popup-close]')?.addEventListener('click', () => {
        el.style.display = 'none';
      });
      el.addEventListener('click', function (ev) {
        if (ev.target === el) el.style.display = 'none';
      });
    };
    el.style.display = 'none';
    const delay = Number(popup.triggerDelay) || 3000;
    const type = String(popup.triggerType || 'delay').toLowerCase();
    if (type === 'scroll') {
      const pct = Number(popup.triggerScrollPct) || 50;
      const onScroll = function () {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        if ((window.scrollY / max) * 100 >= pct) {
          show();
          window.removeEventListener('scroll', onScroll);
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    } else {
      window.setTimeout(show, delay);
    }
  }

  function applyFloatingButtons(g11) {
    const cfg = g11?.floatingButtons;
    let wrap = document.getElementById('wa-floating-buttons');
    const items = (cfg?.items || []).filter(isActiveItem);
    if (!cfg || Number(cfg.isActive) === 0 || !items.length) {
      if (wrap) wrap.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'wa-floating-buttons';
      document.body.appendChild(wrap);
    }
    const pos = String(cfg.position || 'right').toLowerCase();
    wrap.style.cssText =
      'position:fixed;bottom:5rem;' +
      (pos.includes('left') ? 'left:1.2rem' : 'right:1.2rem') +
      ';z-index:9998;display:flex;flex-direction:column;gap:.6rem';
    wrap.innerHTML = items
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map(function (it) {
        return (
          '<a href="' +
          escapeHtml(resolveAppNavUrl(it.url || '#')) +
          '" title="' +
          escapeHtml(it.label || '') +
          '" style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:' +
          escapeHtml(it.bgColor || 'var(--crimson)') +
          ';color:' +
          escapeHtml(it.iconColor || '#fff') +
          ';text-decoration:none;box-shadow:var(--shadow-md);font-size:1.1rem">' +
          escapeHtml(it.label ? it.label.charAt(0) : '•') +
          '</a>'
        );
      })
      .join('');
  }

  function applyOverlays(g11) {
    if (!g11) return;
    applyCookieConsent(g11);
    applyPopup(g11);
    applyFloatingButtons(g11);
  }

  function applyBranding(g12) {
    const branding = g12?.branding;
    if (!branding) return;
    if (branding.primaryColor) document.documentElement.style.setProperty('--crimson', branding.primaryColor);
    if (branding.secondaryColor) document.documentElement.style.setProperty('--saffron', branding.secondaryColor);
    if (branding.accentColor) document.documentElement.style.setProperty('--gold', branding.accentColor);
    const seo = (g12?.seoSettings || [])[0];
    if (seo?.metaTitle) document.title = seo.metaTitle;
    if (seo?.metaDescription) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', seo.metaDescription);
    }
  }

  function snapshotStableKey(snapshot) {
    try {
      return JSON.stringify(snapshot);
    } catch (e) {
      return '';
    }
  }

  async function flushApplyPreviewSnapshot() {
    const snapshot = state.pendingSnapshot;
    if (!snapshot) return;
    const key = snapshotStableKey(snapshot);
    if (key && key === state.lastAppliedSnapshotKey) {
      return;
    }
    state.lastAppliedSnapshotKey = key;
    state.previewSnapshot = snapshot;
    const base = state.bundles && Object.keys(state.bundles).length ? state.bundles : {};
    const merged = mergeBundles(base, snapshot);
    await applyBundles(merged);
    postToHost({ action: 'PREVIEW_SNAPSHOT_APPLIED' });
  }

  function queueApplyPreviewSnapshot(snapshot) {
    state.pendingSnapshot = snapshot;
    if (state.applySnapshotTimer) {
      window.clearTimeout(state.applySnapshotTimer);
    }
    state.applySnapshotTimer = window.setTimeout(function () {
      state.applySnapshotTimer = null;
      void flushApplyPreviewSnapshot();
    }, 90);
  }

  window.__waApplyPreviewSnapshot = function (snapshot) {
    queueApplyPreviewSnapshot(snapshot);
  };

  async function applyBundles(bundles) {
    state.bundles = bundles;
    applyTopBar(bundles.g1, bundles.g12);
    applyHeaderNav(bundles.g1);
    applyHero(bundles.g2);
    applyCarousel(bundles.g2);
    applyTrustedBrands(bundles.g3);
    applyStats(bundles.g4);
    applyPartners(bundles.g4);
    applyAbout(bundles.g5);
    applyMilestones(bundles.g5);
    applyTestimonials(bundles.g6);
    applyAwards(bundles.g6);
    applyGallery(bundles.g6);
    applyPortfolio(bundles.g6);
    applyServicesPricing(bundles.g7);
    applyCtaStrip(bundles.g9);
    applyContact(bundles.g9);
    applyFooter(bundles.g10, bundles.g12);
    applyContentLegal(bundles.g8);
    applyOverlays(bundles.g11);
    applyBranding(bundles.g12);
  }

  async function refresh() {
    if (!state.websiteId || state.loading) return;
    state.loading = true;
    try {
      const bundles = await fetchAll(state.websiteId);
      const merged = state.previewSnapshot ? mergeBundles(bundles, state.previewSnapshot) : bundles;
      await applyBundles(merged);
      window.parent.postMessage({ action: 'TEMPLATE_DATA_APPLIED', websiteId: state.websiteId }, '*');
    } catch (e) {
      console.error('[template-bridge] refresh failed', e);
    } finally {
      state.loading = false;
    }
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || !data.action) return;
    if (data.action === 'SET_WEBSITE_ID' && data.websiteId) {
      const nextId = Number(data.websiteId);
      if (nextId !== state.websiteId) {
        state.websiteId = nextId;
        state.previewSnapshot = null;
        void refresh();
      }
    }
    if (data.action === 'SET_USER_WEBSITE_ID' && data.userWebsiteId) {
      const nextId = Number(data.userWebsiteId);
      if (nextId !== state.websiteId) {
        state.websiteId = nextId;
        state.previewSnapshot = null;
        void refresh();
      }
    }
    if (data.action === 'REFRESH_TEMPLATE_DATA') {
      state.lastAppliedSnapshotKey = '';
      state.lastCarouselKey = '';
      state.lastCarouselAutoplayKey = '';
      void refresh();
    }
    if (data.action === 'SET_API_BASE' && data.apiBase) {
      state.apiBase = String(data.apiBase).endsWith('/') ? data.apiBase : data.apiBase + '/';
    }
    if (data.action === 'SET_PARENT_ORIGIN' && data.origin) {
      state.parentOrigin = String(data.origin).replace(/\/$/, '');
    }
    if (data.action === 'APPLY_PREVIEW_SNAPSHOT' && data.snapshot) {
      queueApplyPreviewSnapshot(data.snapshot);
    }
    if (data.action === 'PREVIEW_NAVIGATE' && data.page) {
      previewNavigate(data.page);
    }
  }

  window.addEventListener('message', onMessage);
  readQuery();
  // In Website Admin live preview, wait for APPLY_PREVIEW_SNAPSHOT instead of API fetch on load.
  if (state.websiteId && !state.waPreview) {
    window.addEventListener('DOMContentLoaded', () => void refresh());
    if (document.readyState !== 'loading') void refresh();
  }

  window.TemplateBridge = { refresh, getState: () => ({ ...state }) };

  function signalBridgeReady() {
    if (state.bridgeReadySent) return;
    state.bridgeReadySent = true;
    postToHost({ action: 'PREVIEW_BRIDGE_READY' });
  }
  signalBridgeReady();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', signalBridgeReady);
  }
})();
