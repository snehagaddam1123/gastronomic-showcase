# Gastronomic ↔ sb-operation-service template seeder

The catalogue row for Website Admin / Web Builder is seeded in **`sb-operation-service`**:

- Class: `com.sb.operation.common.TemplateClassificationSeederService`
- **Web type:** `GASTRONOMIC` (upserted in `seedWebTypes()`).
- **Template classification:** `Gastronomic Showcase`, `routingUri` **`/landing/gastronomic`**, thumbnail `classpath:static/templates/gastronomic.jpg`.

This matches `startbusinessltd-ui` (`GASTRONOMIC_ROUTING_URI`, gastronomic template iframe + `environment.templateUrls.gastronomic`).

## Thumbnail asset

`gastronomic.jpg` is initially a copy of `startup.jpg` so the seeder can upload a document on first run. Replace `sb-operation-service/src/main/resources/static/templates/gastronomic.jpg` with a real 16:9 card image when design is ready.

## After changing the seeder

Restart **sb-operation-service** (or the stack) so the **`CommandLineRunner`** runs `TemplateClassificationSeederService.runTemplateCatalogueSeed()` (web types + template rows, including document upload). Existing DB rows are **updated** in place if routing URI, web type, or image was wrong.

---

## Carbon Scroll Studio (same seeder class)

- **Web type:** `CARBON_SCROLL_STUDIO`.
- **Template classification:** `Carbon Scroll Studio`, `routingUri` **`/landing/carbon-scroll-studio`**, thumbnail `classpath:static/templates/carbon-scroll-studio.jpg`.

Matches `startbusinessltd-ui` (`CARBON_SCROLL_STUDIO_ROUTING_URI`, `environment.templateUrls.carbonScrollStudio`). Seeder uses **business type id `2`** (same as Gastronomic) so the template appears for the same package band as other showcase rows. Replace the placeholder JPG under `sb-operation-service/src/main/resources/static/templates/` with a real card image when ready.

---

## Cozy Corner Motel (same seeder class)

- **Web type:** `COZY_CORNER_MOTEL`.
- **Template classification:** `Cozy Corner Motel`, `routingUri` **`/landing/cozy-corner-motel`**, thumbnail `classpath:static/templates/cozy-corner-motel.jpg`.

Matches `startbusinessltd-ui` (`COZY_CORNER_MOTEL_ROUTING_URI`, `environment.templateUrls.cozyCornerMotel`, local Vite port **5200** in `cozy-corner-motel/vite.config.ts`). Seeder uses **business type id `2`** (same band as Carbon / Gastronomic).

**Thumbnail file:** `sb-operation-service/src/main/resources/static/templates/cozy-corner-motel.jpg` — committed as a small placeholder (copy of `carbon-scroll-studio.jpg`) so the seeder can upload on first insert; replace with final 16:9 card art when ready.
