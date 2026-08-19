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

## B2B prop rentals

`templates/page.rentals.json` is a trade-facing rentals page. Create a page in
the admin (suggested handle `rentals`, so the home page's Props brick resolves)
and assign it the **rentals** template.

| Order | Section | File |
| --- | --- | --- |
| 1 | Trade hero with stat blocks | `sections/rental-hero.liquid` |
| 2 | Rate card + volume/trade discount table | `sections/rental-rates.liquid` |
| 3 | Deposit figure + terms | `sections/rental-deposit.liquid` |
| 4 | Rental catalogue with per-item rates | `sections/rental-catalog.liquid` |
| 5 | Page body content, if any | `sections/page-content.liquid` |
| 6 | B2B quote request form | `sections/rental-quote.liquid` |

The rate card in section 2 is hand-written copy — it is the published price
list. Sections 4 and 6 and the `product.rental` template read live figures per
product, described below.

### How rates and deposits are calculated

`snippets/pf-rental-rates.liquid` derives every figure for a product. The
product price is treated as the **one-day rate**; longer periods are
percentages of it, set under **Theme settings → Rentals**:

| Figure | Default | Derived from |
| --- | --- | --- |
| Day rate | — | Product price |
| Weekend | 250% | Day rate |
| Week | 400% | Day rate |
| Month | 1200% | Day rate |
| Deposit | 30% | Replacement value, else the weekly rate |

So a $95/day prop quotes $237.50 for a weekend, $380 a week, and holds a $114
deposit — no per-product data entry needed.

### Per-product overrides

Any figure can be overridden with a product metafield in the `rental`
namespace. Use type **Money** or **Decimal** for the amounts and **Integer**
for the day counts:

| Metafield | Type | Overrides |
| --- | --- | --- |
| `rental.day_rate` | Money / Decimal | The day rate (instead of the product price) |
| `rental.weekend_rate` | Money / Decimal | The weekend rate |
| `rental.week_rate` | Money / Decimal | The weekly rate |
| `rental.month_rate` | Money / Decimal | The monthly rate |
| `rental.deposit` | Money / Decimal | The deposit outright |
| `rental.replacement_value` | Money / Decimal | The base the deposit percentage applies to |
| `rental.min_days` | Integer | Minimum hire length |
| `rental.lead_days` | Integer | Booking lead time |

### Rental products

Assign hire pieces the **rental** product template
(`templates/product.rental.liquid`). It replaces the standard product page with
the full rate table, the deposit, booking notes, and a link into the quote
form. Tag them `rental` so they also read "Rental from $95.00" and carry the
blue **Rent me** badge anywhere the standard product card is used.

### Restricting trade rates

**Theme settings → Rentals → Who sees trade rates** controls visibility:

- **Everyone** — rates are public (default).
- **Logged-in customers** — anonymous visitors see a login prompt instead.
- **B2B company accounts only** — rates show only to customers on a Shopify
  B2B company account (`customer.b2b?`).

When rates are withheld, `snippets/pf-trade-gate.liquid` renders in their place
with links to log in and to the trade application page (see below).

### The quote form

`sections/rental-quote.liquid` posts through Shopify's built-in `contact` form,
so submissions arrive at the store's customer-service email with no app
required. Alongside the standard name/email/body it sends company, phone,
event date, hire period, venue, and whether delivery is needed.

Note that this is a lead-capture flow, not a booking engine — it does not
reserve dates or hold inventory. Availability is confirmed by whoever answers
the quote.

## Other pages

Four more page templates round out the pages the header, footer and rentals
page actually link to. Create a page in the admin for each, set the matching
handle so the built-in links resolve, and assign the listed template.

| Page | Handle | Template | Links to it from |
| --- | --- | --- | --- |
| Trade application | `trade-application` | `page.trade-application` | The trade gate (`pf-trade-gate.liquid`) and the rentals page |
| Custom orders | `custom-orders` | `page.custom-orders` | Header nav, the home page's "Start a custom project" banner |
| About | `about` | `page.about` | Header nav |
| Rental FAQ | `rental-faq` | `page.rental-faq` | Footer "Help" menu |

**Trade application** (`templates/page.trade-application.json`) runs a hero,
a benefits grid, and `sections/account-application-form.liquid` — another
`contact`-form submission, tagged `Trade application`, asking for company,
business type, expected volume and a resale/tax ID. Approving someone means
giving them a customer account or a Shopify B2B company account in the admin,
matching whatever **Who sees trade rates** is set to.

**Custom orders** (`templates/page.custom-orders.json`) reuses the "How it's
made" steps section, then `sections/custom-order-form.liquid` — a `contact`
submission tagged `Custom order`. It asks for a link to reference images
(Pinterest board, Instagram post, Drive folder) rather than a file upload,
since Shopify's built-in contact form can't accept attachments.

**About** (`templates/page.about.json`) is the only template built from
sections with no other home yet: `sections/story-split.liquid` (image + rich
text, `image_position: left` or `right`) and `sections/feature-grid.liquid`
(a heading over a row of colour-dot points — also used for the trade
application's benefits list). Both are generic and safe to drop into any
other page.

**Rental FAQ** (`templates/page.rental-faq.json`) is
`sections/faq-accordion.liquid`, a `<details>/<summary>` accordion with no
JavaScript — question and richtext-answer blocks, plus an optional
closing CTA.

### Shipping and returns

These don't need a page or a template. `templates/policy.liquid` styles
Shopify's automatic policy pages — Shipping, Refund, Privacy, Terms of
Service — which are generated from whatever you write under **Settings →
Policies**. `sections/footer.liquid`'s **Link store policies** setting adds
whichever ones you've filled in to the footer automatically.

## Supporting templates

`product`, `collection`, `list-collections`, `cart`, `search`, `blog`,
`article`, `page`, `404`, `gift_card` and `password` are minimal working
templates so the theme uploads and every link on the home page resolves. They
share the home page's palette and type but carry no bespoke layout. Customer
account templates are not included — Shopify's defaults handle those pages.
