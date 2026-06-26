# Gastronomic ↔ Website Admin Integration Plan

## Backend: sb-template-service (37 REST endpoints)

All bundles under `/api/template/` — 12 Website Admin groups × (GET public + POST save + PUT deactivate).

| Group | API path | Admin section |
|-------|----------|---------------|
| g1 | `top-header-navigation` | Top bar, header, nav |
| g2 | `hero-carousel` | Hero, slideshow |
| g3 | `trusted-brand-logos` | Trusted brands |
| g4 | `stats-and-partners` | Numbers & partners |
| g5 | `about-team-milestones` | Your story ✅ |
| g6 | `reviews-portfolio-gallery` | Reviews & work |
| g7 | `services-features-pricing` | Services & pricing ✅ |
| g8 | `content-faq-legal` | Content & legal |
| g9 | `contact-cta-newsletter` | Contact & CTA |
| g10 | `footer` | Footer |
| g11 | `site-overlays` | Overlays |
| g12 | `branding-seo-pages` | Site & SEO |

Documents: `document/public/document/by/document-upload-id/get/{id}` (same as Website Admin).

Live preview: `APPLY_PREVIEW_SNAPSHOT` → `gastronomic-showcase/public/template-bridge.js` (no full page refresh).

---

## Phase 1 — DONE (verify these)

- [x] **INT-1** Fix `applyCtaStrip` runtime bug; hero `_previewBgUrl` / `_previewMediaUrl`; about `_previewImageUrl`; CTA from `ctaButtons[]`; contact address from office lines; footer `tagline`
- [x] **INT-2** Snapshot enrich: g1 header logo previews (blob + upload-id URL), g2 hero bg/media, g5 about image; about upload triggers live preview
- [x] **INT-3** Saffron & Smoke static defaults for g1–g2, g4–g12; **per-bundle** empty detection (not all-or-nothing); forms + preview seed on first load

---

## Phase 2 — NEXT (after your verification)

- [x] **INT-4** Content & legal (T12): FAQ, blog, legal panels in template-bridge + preview snapshot
- [x] **INT-5** Contact / CTA / footer (T13): CTA subtitle/URL, newsletter, footer columns/copyright, map/hours
- [x] **INT-6** Overlays (T14): cookie (acceptLabel), popup, floating buttons in template-bridge

---

## How to verify Phase 1

1. Run `gastronomic-showcase` (port 5000) and `startbusinessltd-ui` with gastronomic template selected.
2. Open **Website Admin** for a website with **no saved template data** — forms should show Saffron & Smoke demo copy.
3. Edit top bar / hero / menu item — preview iframe updates **without refresh**.
4. Upload header logo, hero background, about image — preview shows immediately (upload-id URL or blob).
5. Home CTA strip updates when Contact & CTA section changes.
