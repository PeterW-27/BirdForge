# Penpot design handoff map

| Penpot section | Code component | Primary styling | Interactive contract |
| --- | --- | --- | --- |
| Site masthead & royal arms | `src/ui/components/site-shell.js` | `styles/layout.css`, `components.css` | `#brand`, `data-view`, `#search` |
| Prestige hero | `src/ui/components/hero.js` | `styles/layout.css`, `components.css` | `data-action="browse"` |
| Category filters & listing | `src/ui/pages/shop.js` | `styles/pages.css` | `data-action="filter"`, `data-id`, `#sort` |
| Ordinary item / custom commission cards | `src/ui/components/product-card.js` | `styles/components.css` | `data-action="increase/decrease/detail/commission/bulk/favorite"` |
| Product modal & direct-order form | `src/ui/components/product-modal.js` | `styles/components.css` | `#direct-order`, `data-mode`, form field names |
| Satchel line item | `src/ui/components/cart-row.js` | `styles/components.css` | `data-action="increase/decrease/remove"` |
| Standard checkout & recycling option | `src/ui/components/checkout-form.js`, `shared.js` | `styles/components.css` | `#checkout`, `name="recycle"`, `name="recycleDetails"` |
| Commission history | `src/ui/components/order-card.js` | `styles/components.css` | `royal-order` gold appearance is stylistic |
| Administrative board | `src/ui/pages/admin.js` | `styles/components.css` | `data-action="status"`, `#admin-filter` |
| Gunter's production tickets | `src/ui/pages/tickets.js`, `components/work-ticket.js` | `styles/components.css` | `data-action="ticket-complete"`, `data-id` |
| Global site palette | `styles/tokens.css` | — | Design-only variables, safe to change |

For each category and product image, edit the `images` lookup in `src/data/catalog.js`. Heraldic element path is held in `src/ui/components/shared.js`, exported as `crest`. Both are ordinary image paths and do not depend on SVG markup hardcoded in the UI.

Do not copy pixel values from the current prototype unless you like them. Penpot should be the visual source of truth.

## V5.1 interaction-component additions

- `src/ui/components/purchase-controls.js` renders the **Add to Cart / quantity selector** and **heart-shaped favorite** buttons.
- `src/ui/components/product-card.js` has no variant caption; `src/ui/pages/shop.js` omits the catalog overline and item count.
- `src/ui/pages/cart.js` places `#recycle-panel` between the items and summary; CSS selectors `.cart-layout`, `.cart-main`, `.recycle-panel`.
- `src/ui/components/product-modal.js` separates `.modal-cart-controls` from `.modal-bulk-section`.
- `src/ui/components/shared.js` contains the reusable `recyclingFields` function; use only with the ordinary cart.

## V5.2 visual handoff

- `src/ui/components/product-card.js`: the `commission-product` branch is intentionally separate from standard cards. It uses `.commission-image`, `.commission-body`, `.commission-cta`; there is no commission favorite button.
- `styles/components.css`: these commission-specific classes can be restyled directly in Penpot without changing purchasing or order rules.
- `src/ui/pages/shop.js`: group tabs include **Commission** and **Your ♡**. Commission items also appear in their corresponding standard group filters.
- `src/domain/core.js`: the four workflow stages drive `src/ui/components/shared.js` and `src/ui/pages/tickets.js`.
