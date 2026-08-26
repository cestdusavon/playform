# Collection pages — SEO build

Branch `collection-seo`, built 22 Aug 2026. Verified against the live store
over the Admin API the same day. Not yet deployed.

## The headline finding: the shelves, not the templates

Search engines rank collection pages that list products. Right now most of
the catalog can't rank no matter what the templates do:

| Collection | Storefront products | What it needs |
|---|---|---|
| props | **0** | Stock it — the audit's softest keyword ("prop rental", comp 0.16) points at props/rentals |
| keychains | **0** | Stock it or leave it noindexed |
| rentals | **0 live** (its one product, "HIRE — Oversized Luxury Sport Wall Clock", is DRAFT) | **Publish that draft.** This is the single cheapest unblock in the whole project |
| portfolio | 0 | Fine to leave noindexed |
| custom-orders-personal / -commercial | 0 | Landing copy is the point — set `index_when_empty` (below) |
| toys, wall-art-signs, baby-shower, wedding, event-decor, large-scale | 1 each | One-product grids won't rank for 4–12k-volume heads. Each needs 3–6 products |
| accessories | 5 | Workable |
| home-decor | 13 | The only genuinely healthy collection |

Every template change below is ready, but stocking is the multiplier.

## Verified live state (22 Aug, Admin API — supersedes the earlier crawl)

Corrections to the table supplied with the task:

- **home-decor has 13 active products**, not 12.
- **toys is not empty** — "Custom 3D-Printed Collectible Figure" published 22 Aug 01:31, after the crawl.
- **wedding is healthy** — the crawl error was transient; 1 active product.
- **wall-art-signs' product is genuinely sold out** (tracks inventory, qty 0), not a data error.
- **large-scale and large-scale-props contain the same single product** (Oversized Luxury Sport Wall Clock, sold out) — duplicate collections competing for the same query. One should be consolidated into the other with a URL redirect.
- **trade-catalog was missing from the table**: 4 active trade case-packs, publicly indexable, with wholesale pricing visible to anyone. Flagged for a decision, unchanged here.
- **No collection has an SEO title or SEO description set** (all `seo.title`/`seo.description` null).
- The shop name is literally **"playforms.toys"** — plural, mismatching the domain. Until it's fixed, every page title ends "– playforms.toys" (see admin to-do #1).

## What changed, file by file

**`layout/theme.liquid`**
- Title tag rebuilt from a guaranteed-non-blank base: blank `page_title` now
  falls back to the collection title, then the shop name — the leading
  "– playforms.toys" bug can no longer occur on any page. Also fixed a
  latent bug where `current_tags` was piped through `t:` before `join`.
  The "– Page N" suffix behaviour is kept (it already existed).
- Meta description: collections with no SEO description now fall back to the
  collection description, stripped of HTML and truncated to 155 characters.
  Previously such pages had **no** meta description tag at all.
- Empty collections emit `<meta name="robots" content="noindex, follow">`,
  driven by the live `collection.all_products_count` (counts only products
  published to the Online Store — DRAFT products don't count). The boolean
  collection metafield `custom.index_when_empty` opts a collection out.

**`templates/collection.liquid` → `templates/collection.json`** (deleted / added)
- The default collection template is now an OS 2.0 JSON template running
  `main-collection-product-grid` (the section already live on the B2B
  template) at 24 products/page, with four optional blocks. Visual note:
  this section shows a collection feature image as a hero when one is set
  in admin — no collection currently has one, so nothing changes visually
  on deploy day.

**`sections/main-collection-product-grid.liquid`**
- Four new blocks, all metafield-driven so content is **per collection**
  while the template stays shared (block settings in a JSON template are
  per-template, not per-collection — inline copy in blocks would repeat on
  every collection):
  - **Extended intro** → `custom.collection_intro` (rich text), under the description
  - **Long-form copy** → `custom.collection_longform` (rich text), below the grid
  - **FAQ** → `custom.collection_faq` (JSON list of `{question, answer}`),
    rendered as a native `<details>` accordion, plus FAQPage JSON-LD emitted
    only when at least one complete pair exists
  - **Related collections** → `custom.related_collections` (list of
    collections), rendered as link cards — internal linking without nesting
    the flat menus
  A block whose metafield is empty renders nothing. Removing a block in the
  theme editor turns the feature off everywhere.
- Renders the structured-data snippet (below) inside the paginate block so
  ItemList positions match the visitor's actual page; empty collections get
  CollectionPage + Breadcrumb markup without an ItemList.

**`snippets/pf-collection-jsonld.liquid`** (new)
- One `@graph` per collection page: **CollectionPage** (name from SEO title
  or collection title; description/image only when they exist),
  **BreadcrumbList** (Home → Collections → collection, all real URLs), and
  **ItemList** (only when products are listed; per product: name, URL,
  image only if present, offer with real price, currency, and
  `InStock`/`OutOfStock` from `product.available`). Nothing is fabricated:
  optional fields are omitted, never guessed.

Constraints honored: menus stay flat (internal linking is the related block
plus in-copy links), no robots.txt or sitemap changes, no visual changes to
any currently-rendering page (new blocks render nothing until metafields are
populated).

## Validation

- `shopify theme check`: **78 files, 0 errors** — 3 pre-existing warnings
  (Google Fonts loaded from Google's CDN, a deliberate choice).
- Repo validation suite (JSON parse, Liquid balance, schema JSON,
  render/section targets, template-vs-schema settings and blocks, locale
  keys, 25-char schema/block name limit): all pass.
- All four changed/new theme files were upserted to the unpublished sandbox
  theme (165794676956) so Shopify's own validator checked them: section,
  layout and snippet accepted. `templates/collection.json` was rejected
  there **only** because `collection.liquid` still exists on that theme —
  which is the deploy-ordering risk documented below, not a content error.

## Deploy runbook (when you say deploy)

Shopify **refuses a `collection.json` while `collection.liquid` exists**
(verified empirically above), and this store's GitHub sync has already shown
it applies diffs file-by-file and silently skips failures. So the
delete+add in this commit has one risky ordering: if the sync tries the add
before the delete, the add is skipped, and if the delete then lands, the
theme briefly has **no collection template**.

On deploy I will therefore, immediately after pushing:
1. Verify via Admin API that the live theme has `templates/collection.json`
   and no `templates/collection.liquid`.
2. If the JSON is missing but the Liquid was deleted → upsert
   `collection.json` straight to the live theme via `themeFilesUpsert`
   (succeeds once the Liquid is gone). Recovery window: seconds.
3. If neither changed (sync skipped both) → collections keep rendering with
   the old template; force a retry with a byte-changing no-op commit after
   the delete lands.
4. Then verify checksums of all four files against the repo, as usual.

## Admin to-do list (in order)

1. **Rename the shop** from "playforms.toys" to "Playform"
   (Settings → General → Store details). Every title tag appends the shop
   name; until this is fixed, SEO titles that say "| Playform" will still
   get "– playforms.toys" stapled on (the append is skipped only when the
   title already contains the shop name).
2. **Create five collection metafield definitions**
   (Settings → Custom data → Collections → Add definition), all in
   namespace `custom` with these exact keys:
   | Key | Type |
   |---|---|
   | `collection_intro` | Rich text |
   | `collection_longform` | Rich text |
   | `collection_faq` | JSON |
   | `related_collections` | List of collections |
   | `index_when_empty` | True or false |
   I can create these over the Admin API at deploy time if you'd rather —
   say so and I'll include it in the deploy.
3. **Publish the DRAFT rental product** ("HIRE — Oversized Luxury Sport
   Wall Clock") to the Online Store — rentals stops being empty, escapes
   the noindex rule, and the audit's best keyword gets a real page.
4. **Set `index_when_empty` = true** on: custom-orders-personal,
   custom-orders-commercial (their landing copy is the point). Rentals too
   if you'd rather not publish the draft yet.
5. **Paste the copy** from the next section (descriptions in the collection
   editor; FAQ JSON and related lists into the new metafields).
6. **Set per-collection SEO titles/descriptions** (collection editor →
   Search engine listing) — suggested titles are with each copy block.
7. **Stock props and keychains** or accept they stay noindexed — and add
   2–5 products each to toys, wall-art-signs, baby-shower, wedding,
   event-decor. A fidget line would unlock "3d printed fidget toys"
   (8,100/mo), which currently has no honest home in the catalog.
8. **Consolidate large-scale vs large-scale-props**: move the product to
   whichever handle you want to keep (suggest keeping `large-scale-props`
   — closer to "prop" queries), delete the other, and add a URL redirect
   (Online Store → Navigation → URL redirects).
9. **Decide on trade-catalog**: it is public with wholesale pricing. If
   that's unintended, gate it behind the trade login like the rest of the
   B2B layer — say the word and I'll wire it.
10. Beyond the theme (from the Semrush audit, unchanged by this work):
    verify the domain in Search Console, submit the sitemap, request
    indexing on home + top collections, and review/disavow the PBN link
    clusters.

## Paste-ready copy

Voice-matched to the live home-decor/accessories/rentals descriptions.
"Don't optimize for bare 'playform'" respected — nothing below targets the
brand term.

### New collection descriptions (replace existing)

**wall-art-signs** — targets: custom wall art (2,400), 3d printed wall art (880), laser cut wall art (210), custom nursery name sign (170)
> Custom wall art and signs, made one at a time in our studio — 3D printed, laser cut, or both on the same piece. Name signs for a nursery door, layered two-tier signs with the letters raised off the backboard rather than printed flat, and text or logo pieces for a desk, a studio wall or a shop counter. Tell us the name, the wording and the colours; we set the layout, print or cut it, sand every edge and pack it ready to hang. Made to order, so no two leave the studio identical.

Suggested SEO title: `Custom Wall Art & Signs — 3D Printed and Laser Cut | Playform`

**toys** — targets: 3d printed toys (8,100)
> 3D printed toys, collectibles and character pieces, printed in-house and finished by hand. Nothing here is cast from a mould — each figure is sculpted digitally, printed in matte, then sanded and detailed one at a time, so surfaces read as fabric, armour or fur instead of plastic. Collectible figures can be customised before printing: pose, palette, base. Made to order in small batches in our studio.

Suggested SEO title: `3D Printed Toys & Collectibles, Made to Order | Playform`

**baby-shower** — targets: baby shower welcome sign (4,400); fixes the "day.Shop" lost-space typo
> Baby shower welcome signs and decor, made to order in our studio. The welcome sign is the piece guests photograph first — ours are 3D printed or laser cut with the name and date built into the design rather than stuck on top, in colours matched to the shower. Around it: milestone markers, cake toppers, guestbook alternatives and photo props, all made in-house on the same machines as everything else we sell. No mass-produced plastic — one-of-a-kind keepsakes that stay long after the last balloon comes down.

Suggested SEO title: `Custom Baby Shower Welcome Signs & Decor | Playform`

**wedding** — targets: wedding welcome sign (12,100); fixes the "theme.Perfect" typo
> Wedding welcome signs and decor, designed and made in-house. The welcome sign sets the tone at the door — ours are 3D printed, laser cut or hand-painted to match your palette, with the names and date part of the piece itself rather than a sticker on acrylic. Table numbers, cake toppers, guestbook alternatives and photo props follow the same design language, so ceremony and reception read as one room. Works for engagement parties and bridal showers too. Tell us the date early — made-to-order takes time we'd rather spend on the details.

Suggested SEO title: `Custom Wedding Welcome Signs & Decor | Playform`

Existing descriptions for home-decor, accessories, event-decor, rentals,
trade-catalog and both custom-orders collections are already strong and
in-voice — leave them.

### Long-form copy (`custom.collection_longform`, rich text)

**home-decor** — targets: 3d printed home decor (390), tissue box cover (12,100), catchall tray (1,600)
> **Why 3D printed home decor?** Because the texture is the object. A tufted tissue box cover printed with real upholstery folds doesn't need a pattern printed on top of it — the surface is the pattern. The same goes for the catchall trays: the quilting is modelled, not embossed, so it catches light the way fabric does.
>
> Every piece runs in the three core colourways — Bone, Ash and Latte — from batch-matched spools. Order a tray this year and a tissue box cover next year and they'll still sit together like a set. The sets themselves are printed from a single spool in a single run.
>
> Everything is finished by hand: sanded where it touches a surface, checked where it touches your things. Made to order in small batches, which means a short wait and no warehouse of extras.

**wall-art-signs** — supporting the intro above
> **How a custom sign comes together.** Send the name or wording and where it's going — nursery door, office wall, shop counter. We lay out the type, send a proof, and once you approve it the piece is printed or cut in-house. Two-tier signs raise the letters off the backboard so the name reads in shadow as well as colour. Laser-cut pieces come in wood or acrylic; 3D printed pieces in the studio colourways or matched to a swatch you send.
>
> Every sign ships with its hanging hardware fitted, edges sanded, ready for the wall the day the box opens.

**rentals** — target: prop rental (320, comp 0.16 — the audit's "lead with this")
> **Prop rental, from the people who build the props.** Because every hire piece is made in-house, it's engineered to be packed, hauled, and set up again — not assembled once and binned. Event planners and photographers hire the oversized pieces for weekends; retail teams take them for seasonal windows.
>
> Standard hire is 3 days, weekly rates on each piece, refundable deposit returned within 5 business days of the piece coming back as it left. Local delivery for a flat fee, self-collection free. If the piece you need doesn't exist yet, that's what Custom Orders — Commercial is for — and if it's something other events will want, we'll quote lower in exchange for keeping it in the hire collection afterwards.

### FAQ JSON (`custom.collection_faq`)

**home-decor**
```json
[
  {"question": "Will pieces bought at different times match?", "answer": "Yes. The three core colourways — Bone, Ash and Latte — run from batch-matched spools across the whole range, so a piece you add next year still matches the one you bought today. Sets are printed from a single spool in a single run."},
  {"question": "What are the pieces made of?", "answer": "Each piece is 3D printed in a matte finish and hand-sanded before packing. The texture — tufting, quilting, fabric folds — is sculpted into the form itself, not printed on top."},
  {"question": "How long does made-to-order take?", "answer": "Pieces are printed in small batches in our studio. Most orders leave within two weeks; the product page shows the current turnaround."}
]
```

**accessories**
```json
[
  {"question": "Will the trays scratch my jewelry?", "answer": "Every edge that touches jewelry is hand-sanded so nothing snags a chain. The matte finish reads as satin or canvas rather than hard plastic."},
  {"question": "What colours do the vanity pieces come in?", "answer": "Ballet blush pink and Bone ivory across the range, with Ash grey on the vanity pieces. The Vanity Set brings the tray, bow dish and brush organizer together in one matched colourway."},
  {"question": "Is the Vanity Set cheaper than buying the pieces separately?", "answer": "Yes — the set prices the three pieces below what they cost individually, and all three are printed from the same spool so the colour match is exact."}
]
```

**wall-art-signs**
```json
[
  {"question": "Can I see the design before it's made?", "answer": "Yes. We lay out your name or wording and send a proof; nothing is printed or cut until you approve it."},
  {"question": "What's the difference between 3D printed and laser cut signs?", "answer": "3D printed signs build the letters in relief — a two-tier sign raises the name off the backboard so it reads in shadow as well as colour. Laser-cut signs are cut from wood or acrylic for a flat, crisp silhouette. Some pieces combine both."},
  {"question": "Do signs come ready to hang?", "answer": "Yes — hanging hardware is fitted and every edge is sanded before the sign ships."}
]
```

**toys**
```json
[
  {"question": "Are these mass-produced figures?", "answer": "No. Each figure is sculpted digitally, printed in-house in matte, then sanded and detailed by hand — no moulds, no factory runs."},
  {"question": "Can a collectible figure be customised?", "answer": "Yes — pose, palette and base can be set before printing. Tell us what you're after on the product page."},
  {"question": "Are the toys safe for young children?", "answer": "These are collectible display pieces finished by hand, not toys for under-3s — small parts and fine details are part of the design."}
]
```

**baby-shower**
```json
[
  {"question": "Can the welcome sign have the baby's name and shower date?", "answer": "Yes — the name and date are built into the design itself rather than stuck on top, and colours are matched to the shower."},
  {"question": "How far ahead should I order?", "answer": "Every piece is made to order in our studio. Order as soon as the date is set — two to three weeks ahead is comfortable; ask about rush timing if the shower is sooner."},
  {"question": "Do you make matching pieces beyond the sign?", "answer": "Milestone markers, cake toppers, guestbook alternatives and photo props can all be made in the same colours and lettering as the welcome sign."}
]
```

**wedding**
```json
[
  {"question": "Can the sign match our wedding colours?", "answer": "Yes — pieces are 3D printed, laser cut or hand-painted to your palette, and the names and date are part of the piece itself rather than a sticker on acrylic."},
  {"question": "How early should we order?", "answer": "As soon as the date and palette are set. Everything is made to order in-house; earlier orders leave more time for proofs and detail work."},
  {"question": "Can we get matching table numbers and cake toppers?", "answer": "Yes — table numbers, cake toppers, guestbook alternatives and photo props follow the same design language as the welcome sign, so ceremony and reception read as one."}
]
```

**rentals**
```json
[
  {"question": "How long is a standard hire?", "answer": "3 days — collect or delivered Friday, back Monday. Weekly rates are listed on each piece."},
  {"question": "How does the deposit work?", "answer": "A refundable damage deposit is held on every hire and listed on the piece. It's returned within 5 business days of the item coming back in the condition it left in. Normal event wear is expected and fine; breakage, water damage, paint, adhesive residue and non-return are charged against the deposit."},
  {"question": "Do you deliver?", "answer": "Local delivery and collection can be arranged for a flat fee — ask when booking. Self-collection is free."},
  {"question": "Can you build a prop that isn't in the collection?", "answer": "Yes — most hire pieces started as a custom commission. Through Custom Orders — Commercial we can build for your event, and if it's a piece other people will want we'll quote it lower in exchange for keeping it in the hire collection afterwards."}
]
```

### Related collections (`custom.related_collections`)

| Collection | Link to |
|---|---|
| home-decor | accessories, wall-art-signs, toys |
| accessories | home-decor, wall-art-signs |
| wall-art-signs | home-decor, wedding, baby-shower |
| toys | home-decor, accessories |
| wedding | baby-shower, event-decor, rentals |
| baby-shower | wedding, event-decor, wall-art-signs |
| event-decor | wedding, baby-shower, rentals |
| rentals | event-decor, large-scale-props, custom-orders-commercial |

## Rendered `<head>`, before → after

Both domains are blocked by this environment's egress proxy, so these are
constructed from the exact template logic against live Admin API data
(titles, descriptions, counts, SEO fields verified 22 Aug), not fetched
pages. I'll re-verify the real pages at deploy time through the Admin API
checksums plus your browser.

### /collections/home-decor (populated, 13 products)

**Before**
```html
<link rel="canonical" href="https://playform.toys/collections/home-decor">
<title>Home Decor – playforms.toys</title>
<!-- meta description: no SEO description is set in admin. If Shopify's
     auto-derived page_description kicked in, the tag carried the raw
     description untrimmed; if not, there was no tag. (Unverifiable from
     this environment — the storefront is proxy-blocked.) -->
<!-- no robots meta, no structured data of any kind -->
```

**After**
```html
<link rel="canonical" href="https://playform.toys/collections/home-decor">
<title>Home Decor – playforms.toys</title>
<meta name="description" content="Objects for the surfaces you pass every day — the nightstand, the bathroom counter, the shelf by the front door where keys land. Everything here is prin...">
<!-- description auto-falls back to the collection description (155 chars);
     replaced the moment an SEO description is pasted in admin.
     Title becomes "Custom 3D-Printed Home Decor | Playform" once admin
     to-dos #1 and #6 are done. -->
```
…and in the body, one `@graph` with CollectionPage, BreadcrumbList
(Home → Collections → Home Decor) and a 13-item ItemList (name, URL, image
where present, price in USD, InStock/OutOfStock per product), plus FAQPage
once the FAQ metafield is pasted.

### /collections/props (empty)

**Before**
```html
<link rel="canonical" href="https://playform.toys/collections/props">
<title>Props – playforms.toys</title>
<!-- indexable despite listing zero products -->
```

**After**
```html
<link rel="canonical" href="https://playform.toys/collections/props">
<title>Props – playforms.toys</title>
<meta name="robots" content="noindex, follow">
```
…plus CollectionPage + BreadcrumbList markup (no ItemList — nothing is
fabricated for an empty shelf). The noindex lifts automatically the day a
product is published into the collection.

## Out of scope, noted not fixed

- Homepage title/meta (shop rename in to-do #1 helps it incidentally).
- The /pages/rentals content cluster, product and blog templates, Core Web
  Vitals.
- robots.txt and sitemaps (audit confirms both healthy; untouched).
- The spam backlink profile — an off-site workstream (to-do #10).
