# Playform.toys — Shopify theme

A Shopify Online Store 2.0 theme built around the Playform brick motif: primary
colours on warm cream, chunky rounded type, and category cards shaped like toy
bricks. The home page is the focus; the remaining templates are deliberately
plain so the storefront works end to end without competing with it.

## Home page

`templates/index.json` assembles six sections, all editable in the theme editor:

| Order | Section | File |
| --- | --- | --- |
| 1 | Hero — logo, headline, rainbow line, CTA, side art | `sections/hero-play.liquid` |
| 2 | Category bricks — Toys / Props / Nursery Signs | `sections/category-bricks.liquid` |
| 3 | Featured products | `sections/featured-products.liquid` |
| 4 | How it's made — 4 numbered steps | `sections/process-steps.liquid` |
| 5 | Custom project banner | `sections/custom-project-cta.liquid` |
| 6 | Instagram strip | `sections/instagram-strip.liquid` |

The announcement ticker and header live in `sections/header-group.json`; the
colour-blocked footer lives in `sections/footer-group.json`.

## Setting it up

1. Zip the theme folders (`assets`, `config`, `layout`, `locales`, `sections`,
   `snippets`, `templates`) and upload it under **Online Store → Themes**.
2. Create the `main-menu` and `footer` navigation menus.
3. In **Theme settings**, upload the logo and favicon and set the Instagram,
   TikTok and Etsy URLs.
4. Point the three category bricks at their collections and the Featured
   products section at a collection.
5. Drop artwork into the hero side slots, the banner, and the Instagram tiles.

Every section works before any of that is done — text falls back to the
Playform copy and products fall back to placeholder cards.

## Conventions worth knowing

**Rainbow headlines.** The "Rainbow line" setting colours each word with the
next colour in the palette (`snippets/pf-rainbow.liquid`). "Made to Play With."
becomes red / yellow / blue / green. The starting colour is a section setting.

**Product badges.** `snippets/pf-product-card.liquid` reads badges from product
tags:

- `badge:Rent Me:blue` — explicit label and colour (`red`, `yellow`, `blue`,
  `green`, `purple`).
- `custom`, `made-to-order`, `rental`, `new` — shorthand tags that map to a
  preset label and colour.
- A sold-out product always shows a red **Sold out** badge.

The `rental` tag also changes the price line to "Rental from $95.00"; products
with several variant prices read "from $48.00".

**Colours.** All five brand colours plus the cream background and the corner
radius are theme settings, published to CSS custom properties in
`layout/theme.liquid`. Section-level colour pickers override the background per
section. Nothing in `assets/playform.css` hard-codes a brand colour outside the
`:root` fallbacks.

**Fonts.** Fredoka (display) and Nunito (body) load from Google Fonts, toggled
by the "Load rounded display fonts" theme setting. With it off, the CSS falls
back to the system rounded stack.

## Supporting templates

`product`, `collection`, `list-collections`, `cart`, `search`, `blog`,
`article`, `page`, `404`, `gift_card` and `password` are minimal working
templates so the theme uploads and every link on the home page resolves. They
share the home page's palette and type but carry no bespoke layout. Customer
account templates are not included — Shopify's defaults handle those pages.
