# sb-template-service ↔ Website Admin ↔ Gastronomic template

This document maps the Java **sb-template-service** REST API to **startbusinessltd-ui** Website Admin and **gastronomic-showcase** (`public/template-bridge.js` + `public/saffron-and-smoke.html`).

## Work plan (checklist)

| # | Task | Status |
|---|------|--------|
| 1 | Catalogue all template APIs and paths | Done (this doc §2) |
| 2 | Gap analysis: admin, bridge, HTML | Done (this doc §5–7) |
| 3 | Seed **Trusted brands (g3)** in admin when API empty | Done |
| 4 | Partners + hero carousel slides + legal (g8) gastronomic defaults | Done |
| 5 | Audit `saffron-and-smoke.html` ids vs `template-bridge.js` | Done (this doc §7) |
| 6 | Document URL parity + preview hooks | Done (§3; awards in §7) |

---

## 1. Base paths

- **Public (no auth):** `/api/template/public/...`
- **Secured:** `/api/template/...` — `POST .../save`, `PUT .../deactivate/{websiteId}`
- **Ping:** `GET /api/template/public/ping`

Source: `sb-template-service/.../common/URLConstants.java`.

Angular mirrors these in `startbusinessltd-ui/.../website-admin/service/website-admin-url.service.ts`.

---

## 2. API inventory (per website)

Each resource exposes **GET** by `websiteId`, **POST** save, **PUT** deactivate.

| Group | Public GET path | Admin UI area | `template-bridge.js` key |
|-------|-----------------|---------------|---------------------------|
| g1 | `/api/template/public/top-header-navigation/{id}` | Top bar, Header, Navigation | `g1` |
| g2 | `/api/template/public/hero-carousel/{id}` | Hero, Slideshow | `g2` |
| g3 | `/api/template/public/trusted-brand-logos/{id}` | Trusted brands | `g3` |
| g4 | `/api/template/public/stats-and-partners/{id}` | Numbers & partners | `g4` |
| g5 | `/api/template/public/about-team-milestones/{id}` | Your story | `g5` |
| g6 | `/api/template/public/reviews-portfolio-gallery/{id}` | Reviews & work | `g6` |
| g7 | `/api/template/public/services-features-pricing/{id}` | Services & pricing | `g7` |
| g8 | `/api/template/public/content-faq-legal/{id}` | Content & legal | `g8` |
| g9 | `/api/template/public/contact-cta-newsletter/{id}` | Contact & CTA | `g9` |
| g10 | `/api/template/public/footer/{id}` | Footer | `g10` |
| g11 | `/api/template/public/site-overlays/{id}` | Overlays | `g11` |
| g12 | `/api/template/public/branding-seo-pages/{id}` | Site & SEO | `g12` |

**Response shape:** JSON wrapper with `responsePayload` (same pattern admin `HttpClient` reads as `body.responsePayload`).

**Empty data:** Public GET may return **404** when the bundle is empty; admin uses `catchError(() => of(null))` and then `applyGastronomicStaticDefaultsIfNeeded(...)` for gastronomic preview.

---

## 3. Document (image) URLs — single convention

**Public blob by upload id** (used in bridge and Angular):

`{apiBase}document/public/document/by/document-upload-id/get/{documentId}`

- Bridge: `template-bridge.js` → `documentUrl(docId)`
- Admin previews: `DocumentService` in `document.service.ts` → same path segment for `getDocumentBlob`

Preview snapshot enrichment adds `_previewLogoUrl`, `_previewBgUrl`, etc., so the iframe does not rely on cross-origin blob URLs for logos.

---

## 4. Live preview (no full refresh)

1. **Iframe** loads gastronomic HTML with `websiteId`, `apiBase`, `wa_preview=1` (see `website-admin.ts` — `appendWebsitePreviewQuery`, `ensureGastronomicPreviewSrc`).
2. **template-bridge.js** fetches all 12 public bundles when it has `websiteId` + `apiBase`. The static page must load the bridge with a **same-directory** script URL (`./template-bridge.js`), not `/template-bridge.js`, so it works when the app is deployed under a path prefix (e.g. `/gastronomic/`).
3. **Website Admin** posts `APPLY_PREVIEW_SNAPSHOT` with merged form state (`gastronomic-preview-snapshot.ts` + `enrichGastronomicPreviewSnapshot` in `website-admin.ts`).
4. Bridge merges snapshot into bundles and reapplies DOM writers (`applyTopBar`, `applyHero`, …).
5. After **Save**, admin can post `REFRESH_TEMPLATE_DATA` to re-fetch from API (see `notifyTemplatePreviewRefresh` usage).

After gastronomic static defaults run on load, admin calls `syncAllSlideBgPreviews()` so new carousel slide document ids resolve for the snapshot.

---

## 5. Gap analysis (updated)

### Implemented in admin (`applyGastronomicStaticDefaultsIfNeeded`)

- **g3** Trusted brands (text placeholders).
- **g4** Stats + **partners** (full empty bundle, or partners-only empty via `partnersPayloadIsEmpty`).
- **g2** Hero + **carousel + two slides** when hero/carousel API bundle empty.
- **g6** Testimonials + **portfolio + gallery + awards** section copy when bundle empty.
- **g8** Privacy / terms / refund page copy when full content bundle empty, or **legal-only** empty when blog/FAQ/tabs already exist (`legalPagesPayloadIsEmpty`).

### Still optional / follow-up

- **g7 dish block:** `GASTRONOMIC_DISH_SECTION` exists in `gastronomic-static-defaults.ts` but service rows are driven by `serviceSection` + `services` — confirm naming vs `applyDishHighlights` when API returns partial data only.
- **g6 awards:** Admin and snapshot include `awardSection` / `awardItems`; **template-bridge.js** has no `applyAwards` yet — awards save to API but do not render in the static HTML until a block is added.
- **g12** deep fields (scripts, page map) vs `applyBranding` — verify per product need.

---

## 6. File index

| Concern | Location |
|---------|----------|
| Backend routes | `backend/sb-template-service/.../controller/Template*.java` |
| Path constants | `.../common/URLConstants.java` |
| Admin URLs | `startbusinessltd-ui/.../website-admin/service/website-admin-url.service.ts` |
| Admin load + defaults | `.../website-admin/website-admin.ts`, `gastronomic-static-defaults.ts` |
| Preview snapshot | `.../gastronomic-preview-snapshot.ts` |
| Iframe bridge | `gastronomic-showcase/public/template-bridge.js` |
| Template page | `gastronomic-showcase/public/saffron-and-smoke.html` |

---

## 7. HTML `wa-*` / bridge targets (`saffron-and-smoke.html`)

| Bridge target | In static HTML? | Notes |
|---------------|-----------------|-------|
| `wa-trusted-brands`, `wa-trusted-head`, `wa-trusted-logos` | Yes | |
| `wa-stats-strip`, `wa-stats-head`, `wa-stats-grid` | Yes | |
| `wa-partners-block`, `wa-partners-title`, `wa-partners-subtitle`, `wa-partners-logos` | Yes | |
| `wa-dish-block`, `wa-dish-head`, `wa-dish-grid` | Yes | |
| `wa-portfolio-block`, `wa-portfolio-head`, `wa-portfolio-grid` | Yes | |
| `wa-features-block`, `wa-features-head`, `wa-features-grid` | Yes | |
| `wa-menu-*`, `wa-process-block`, `wa-menu-pricing` | Yes | |
| `wa-about-team-block`, `wa-team-head`, `wa-team-grid` | Yes | |
| `wa-milestones-*` | Yes | |
| `wa-gallery-*`, `masonry` | Yes | `masonry` id unchanged |
| `wa-testimonials-block`, `track`, `dots` | Yes | |
| `wa-content-legal-host` | Yes | Blog / FAQ / tabs / legal inject here |
| `wa-newsletter-panel` | **No** — created on demand | `applyNewsletter` appends under `#page-contact` |
| `wa-cookie-bar`, `wa-popup`, `wa-floating-buttons` | **No** — created on demand | Cookie / popup / floating UI |
| `footer` (tag) | Yes | `applyFooter` uses structure + `.wa-foot-legal` |
| Hero / carousel ids (`hero`, `heroBg`, `heroCarouselUi`, …) | Yes | |

---

*Last updated: integration pass (todos 1–6).*
