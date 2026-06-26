# Gastronomic Template — Section Audit & Fix Plan

**API:** `sb-template-service` (12 bundles g1–g12)  
**Preview:** `gastronomic-showcase/public/saffron-and-smoke.html` + `template-bridge.js`  
**Admin:** `startbusinessltd-ui` → `/website-admin`

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Wired (API + admin + bridge + template DOM) |
| ⚠️ | Partial (some fields or preview gaps) |
| ❌ | Not in template HTML / no bridge function |
| 🔄 | In progress this phase |

---

## Phase 1 — Top bar, header, navigation, CTA (g1) 🔄

| Component | API | Admin | Bridge | Template DOM | Notes |
|-----------|-----|-------|--------|--------------|-------|
| Top bar / announcement | g1.topBar | ✅ | applyTopBar | #topBar | Email, phone, social from g12 |
| Sticky header | g1.header | ✅ | applyHeaderNavStyles | #nav | sticky + transparent + scrolled |
| Logo upload/display | g1.header | ✅ | renderHeaderLogo | .logo | Preview URLs + doc API |
| Navigation links | g1.navMenus | ✅ | applyHeaderNav | #navLinks | SPA data-page routing |
| CTA button | g1.header | ✅ | appendHeaderCta | .btn-primary | showCtaButton, label, url |

**Phase 1 fixes:** preserve default nav when CMS empty; external URLs; hide CTA when disabled; announcement link; logo → home.

---

## Phase 2 — Hero & slideshow (g2) 🔄 (re-verify)

| Component | Status | Notes |
|-----------|--------|-------|
| Hero copy, buttons, layout | ✅ | applyHero + align/media/split |
| Hero bg color/image/gradient/video | ✅ | applyHeroBackground |
| Hero overlay | ✅ | normOpacity 0–1 or 0–100 |
| Carousel slides | ✅ | text-only slides allowed |
| Autoplay, dots, arrows, loop | ✅ | defaults on; live edit without full rebuild |
| Fade transition | ✅ | hero--fade; skip fade if same bg |

---

## Phase 3 — Stats, partners, trusted brands (g3–g4) ⏳

| Component | Status | Notes |
|-----------|--------|-------|
| Numbers strip | ✅ | applyStats |
| Partners | ✅ | applyPartners + links |
| Trusted brands | ✅ | applyTrustedBrands + name/url |

---

## Phase 4 — About, team, milestones (g5) ✅

| Component | Status | Notes |
|-----------|--------|-------|
| About hero (title pipe, subtitle, lead) | ✅ | applyAbout + setAboutHeroTitle |
| Founder block (mission, vision, role) | ✅ | applyAbout |
| Quote / values | ✅ | milestones .quote from about.values |
| About image | ✅ | imageDocId + preview URL |
| Team section headings + cols | ✅ | applyAbout + admin cols |
| Team members (photo, bio, contact, social) | ✅ | #wa-team-grid |
| Milestones / timeline + images | ✅ | applyMilestones |
| Section visibility toggles | ✅ | about / team / timeline isActive |

---

## Phase 5 — Reviews & work (g6) ⏳

| Component | Status | Notes |
|-----------|--------|-------|
| Testimonials carousel | ✅ | applyTestimonials |
| Gallery | ✅ | applyGallery + lightbox |
| Portfolio grid | ⚠️ | Grid only, not carousel |
| Awards / badges / press | ❌→⚠️ | Admin + API; HTML block Phase 5 |

---

## Phase 6 — Services & pricing (g7) ✅

| Component | Status | Notes |
|-----------|--------|-------|
| Menu / services (tabs, categories, prices) | ✅ | applyServicesMenu |
| Dish highlights (home) | ✅ | applyDishHighlights |
| Features block (home) | ✅ | applyFeatures + icons/CTA |
| Pricing plans (menu) | ✅ | applyPricing + features, toggle, popular |
| Process steps (menu) | ✅ | applyProcess + wa-process-block |

---

## Phase 7 — Content, contact, footer, overlays, SEO (g8–g12) ⏳

| Component | Status | Notes |
|-----------|--------|-------|
| FAQ | ✅ | applyFaq on contact page |
| Blog / legal pages | ❌ | No public pages in template |
| Contact + offices | ⚠️ | applyContact partial |
| CTA strip (home) | ✅ | applyCtaStrip |
| Newsletter | ❌ | API only |
| Footer columns | ⚠️ | applyContact partial |
| Cookie bar | ⚠️ | applyOverlays cookie only |
| Popup / floating buttons | ❌ | API only |
| Branding colors / SEO | ✅ | applyBranding |

---

## Verification workflow

After each phase, confirm in Website Admin preview (desktop + mobile device frame):

1. Edit fields → live update without blink  
2. Save → REFRESH still works  
3. No console errors  
4. Correct page when clicking admin left nav  

**Current ask:** Verify **Phase 1** before Phase 2 starts.
