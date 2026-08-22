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
footer lives in `sections/footer-group.json`.

### The scroll film

`sections/scroll-video.liquid` sits directly under the hero: a full-screen
film pinned to the viewport while the visitor scrolls through a tall track,
with the scroll position driving `video.currentTime`. Scroll down and the film
plays; scroll back up and it rewinds. The **Scroll length** setting controls
the exchange rate — 300vh means three screen-heights of scrolling play the
whole film.

It ships with the Playform film bundled as a theme asset
(`assets/playform-scroll-video.mp4`, remuxed for fast start so seeking works
while it streams), and the **Video** setting swaps in any upload from the
admin. Keep replacement films short and silent — around ten seconds scrubs
beautifully; long files scrub coarsely and download slowly.

Fallbacks: with JavaScript off the video is a muted autoplay loop, and
`prefers-reduced-motion` gets that same loop in normal page flow instead of
the pinned scrub. The overlay (eyebrow, rainbow heading, text, button) and the
"Scroll to play" hint are all section settings.

## Setting it up

1. Zip the theme folders (`assets`, `config`, `layout`, `locales`, `sections`,
   `snippets`, `templates`) and upload it under **Online Store → Themes**.
2. Create navigation menus:
   - `main-menu` for consumer shoppers
   - `footer` for footer links
   - (Optional) `b2b-menu` for B2B/trade customers (set in Header section settings)
3. In **Theme settings**, upload the logo and favicon and set the Instagram,
   TikTok and Etsy URLs.
4. Point the three category bricks at their collections and the Featured
   products section at a collection.
5. Drop artwork into the hero side slots, the banner, and the Instagram tiles.
6. (Optional) Set the **Header** section's B2B menu to show a different nav to
   trade customers (requires `customer.b2b?` in Shopify admin).

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
| 1 | Trade hero with stat blocks | `sections/split-hero.liquid` |
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

## Flexible page layouts

Beyond the home page and trade pages, the theme includes reusable sections for
building custom pages:

| Section | Purpose |
| --- | --- |
| `sections/rich-text.liquid` | Configurable text block with optional rainbow headline and CTA button |
| `sections/image-with-text.liquid` | Split layout (image left/right) with headline, text, and CTA |
| `sections/collection-list.liquid` | Grid of collection cards (configurable count and columns) |
| `sections/featured-collection.liquid` | Single collection showcase with product grid and CTA |
| `sections/main-page.liquid` | Container for generic page content |
| `sections/main-collection-product-grid.liquid` | Collection page with pagination |

Use these in JSON templates to build pages without editing Liquid. `main-page`
and `main-collection-product-grid` are section-based equivalents of the plain
`page.liquid` and `collection.liquid` templates — swap a template over to JSON
when you want that page editable in the theme editor.

## The product page

`templates/product.json` is the default product template, built from
`sections/main-product.liquid`. Because it is JSON, the page is editable under
**Online Store → Customize → Products** rather than only in code.

The section owns the image column (with an optional thumbnail strip) and the
section settings; everything in the right-hand column is a **block**, so the
order is drag-and-drop:

| Block | What it renders |
| --- | --- |
| Title | The product title |
| Price | Price, with the compare-at price struck through when there is one |
| Vendor | The product's vendor, if set |
| Variant picker | One control per option — see below |
| Personalisation field | One customer input — see below |
| Buy buttons | Quantity and add to cart — button colour is a setting |
| Description | The product description |
| Rental rates | The full rate table from `pf-rental-rates` (table or inline) |
| Text | A free richtext block, e.g. a shipping or lead-time note |

Section settings cover image position (left or right) and whether thumbnails
show.

### The variant picker

The **Variant picker** block gives a product with more than one option a
separate control per option — Size, then Colour — instead of one long list of
every combination. Its **Style** setting switches between dropdowns and
buttons. Products with a single variant render nothing.

It is a progressive enhancement, not a rewrite. The block renders the plain
select over every variant that the theme has always used, so with JavaScript
off the page works exactly as before. The script then builds one control per
option, hides that select, and keeps writing the chosen variant into it — so
the `id` the form submits is always a real variant. The select carries a
`form="PfProductForm"` attribute, which is what lets it sit outside the form
in its own block and still be submitted with it.

On each change the script re-prices the page, swaps the featured image when the
variant has its own, greys out option values no remaining variant offers, and
puts `?variant=` in the address bar so a chosen combination can be linked.
Sold-out variants disable the button and relabel it; a combination that does
not exist at all reads "Unavailable".

If the Buy buttons block is used without a Variant picker it falls back to
rendering the full variant select itself, so removing the picker in the theme
editor cannot leave a product unbuyable.

### Personalised products

Keychains, wall signs and anything else cut to order need the customer to type
something. `templates/product.custom.json` is a ready-made template for that —
assign it under **Product → Theme template → custom** and it works with no
further setup.

It is built from **Personalisation field** blocks. Each block is one input, so
you add as many as the product needs and drag them into order. Per block:

| Setting | What it does |
| --- | --- |
| Label | The field name, and the name that prints on the order |
| Type | Single line, paragraph, choice list, number, or tick box |
| Choices | Choice list only — comma separated |
| Placeholder | Greyed-out example text |
| Help text | A line under the label |
| Required | Blocks add-to-cart until filled |
| Character limit | Single line and paragraph — adds a live "12 characters left" counter |
| Minimum / Maximum | Number only |

The default `custom` template ships with the fields a name sign needs: text to
make, an optional second line, lettering style, colour, width in cm, free notes
and a deadline tick box. Rename or delete them to suit — a keychain is
generally just the text, a colour and a quantity.

**How it reaches you.** Fields submit as Shopify [line item
properties](https://shopify.dev/docs/api/liquid/objects/line_item#line_item-properties),
so what the customer typed rides along with the line through cart, checkout and
the order, with no app. `snippets/pf-line-properties.liquid` prints them under
the product name in the cart page and the cart drawer.

Two details worth knowing. Optional fields left blank are removed on submit, so
they don't clutter the order with empty values. And a label starting with an
underscore is hidden from the customer by Shopify — useful for anything you
want recorded but not shown.

Like the variant picker, the fields live in their own blocks outside the form
and are tied to it with `form="PfProductForm"`. Required fields use native
browser validation, so add-to-cart is blocked before any JavaScript runs.

Not included: file uploads. Shopify can accept a `file` line item property for
"send us your artwork", but it needs a multipart form and a size limit, and the
custom orders page currently asks for a link to reference images instead.

**Changing it three ways:**

1. *In the admin, no code* — Customize → Products, reorder or add blocks.
2. *Change the default for every product* — edit `templates/product.json`, or
   add a block type to `sections/main-product.liquid`.
3. *A different layout for some products* — add `templates/product.<name>.json`
   and assign it per product under **Product → Theme template**. This is how
   `templates/product.rental.liquid` already works for hire pieces; it stays a
   plain Liquid template and is unaffected by the JSON conversion.

## Cart drawer and search modal

`snippets/cart-drawer.liquid` and `snippets/search-modal.liquid` render once per
page from `layout/theme.liquid`. Both are progressive enhancements: the header's
cart and search controls stay ordinary links to `/cart` and `/search`, and
`assets/playform.js` intercepts the click to open the overlay instead. With
JavaScript off, both still go to their full pages.

The drawer's remove buttons post to `/cart/change`; if that request fails the
button falls back to the cart page. Search suggestions come from Shopify's
predictive search endpoint (`routes.predictive_search_url`), debounced at 250ms.

## B2B menus

The header takes two menus: **Menu (Consumer)** and an optional **Menu (B2B)**.
When a customer is on a Shopify B2B company account (`customer.b2b?`) and a B2B
menu is set, they get that menu instead. Everyone else gets the consumer one.

`templates/collection.b2b.json` is a collection template for hire catalogues —
the standard product grid plus a trade terms note. Assign it to a collection in
the admin under **Collections → … → Theme template**.

## Cart

`templates/cart.liquid` is the last page the theme controls before Shopify takes
over. Quantity steppers update the line and the subtotal through the Cart API
without a page reload, and the whole thing still works as a plain form when
JavaScript is off — the **Update cart** button is the fallback, not decoration.

Personalisation typed on a product page shows under each line
(`snippets/pf-line-properties.liquid`), so nobody checks out unsure of what they
asked for. There is also a collapsible order note, and an empty state that says
something rather than nothing.

**Free shipping meter.** Off by default. **Theme settings → Cart** turns on a
brick-striped bar counting up to a threshold you set. The bar is display only —
set the actual rate under **Settings → Shipping**, and keep the two numbers in
step yourself.

### A note on the checkout itself

The checkout is not part of the theme and cannot be styled from here. Shopify
serves it from its own infrastructure, and `checkout.liquid` was Plus-only and
has since been retired in favour of Checkout Extensibility.

To brand it, use **Settings → Checkout → Customize**, which covers the logo,
colours, corner radius and typography — enough to carry the palette across.
Anything beyond that (custom fields, upsells, custom banners) needs checkout UI
extensions, which are apps rather than theme files.

## Customer accounts

Seven templates under `templates/customers/`, all built from the brick palette:

| Template | Page |
| --- | --- |
| `login.liquid` | Sign in, with the password reset form folded into the same page |
| `register.liquid` | Create an account |
| `account.liquid` | Dashboard — stats, orders, default address |
| `order.liquid` | A single order, with line items, totals and addresses |
| `addresses.liquid` | Add, edit and delete addresses |
| `reset_password.liquid` | Set a new password from an emailed link |
| `activate_account.liquid` | Activate an invited account |

The dashboard opens with three coloured stat bricks — order count, lifetime
spend, customer since — then the order list, where each order carries two
colour-coded pills for payment and fulfilment status
(`snippets/pf-order-status.liquid`). Sign-in has a show/hide password toggle and
swaps to the reset form in place instead of navigating away, and the address
forms expand inline rather than on their own page.

### B2B accounts

`snippets/pf-account-nav.liquid` checks `customer.b2b?`. A customer on a Shopify
B2B company account gets a **Trade account** pill next to their name, their
company name, and an extra nav link into the hire stock. The dashboard adds a
panel showing the company and location they are ordering for, from
`customer.current_company` and `customer.current_location`.

**Which login your B2B customers actually see depends on a store setting.**
These templates are the classic customer accounts. If the store uses **new
customer accounts** — which is the default for B2B, and is set under **Settings
→ Customer accounts** — Shopify serves its own hosted login and account pages
and none of these templates are used. Classic accounts still render everything
above, B2B panels included. Check that setting before judging the result.

## Supporting templates

`collection`, `list-collections`, `search`, `blog`, `article`, `page`, `404`,
`gift_card` and `password` are minimal working templates so the theme uploads
and every link on the home page resolves. They share the home page's palette and
type but carry no bespoke layout.
