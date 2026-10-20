# Stable interaction contract

The controller uses delegated UI events and does not rely on most CSS class names. Maintain the following controls while redesigning components:

- `data-view="shop|cart|repairs|orders|admin|tickets"`: primary navigation.
- `data-action="browse|shop|clear-filters|filter|saved-filter|favorite|detail|commission|bulk|increase|decrease|remove|close|backdrop|admin-tab|ticket-complete"`: click routes. Product and ticket controls also carry `data-id`.
- `#main`, `#modal-root`, `#toast-root`, `#brand`, `#search`: mount points.
- `#checkout`: normal satchel checkout; fields `name`, `email`, `address`, and `notes`.
- `#recycle-panel`: **separate optional cart section** with `input[name="recycle"]` (checkbox) and `[name="recycleDetails"]`; these do not belong in `#checkout`. The controller combines these values on submission.
- `#direct-order`: direct bulk or custom order; `data-id` identifies the product, `data-mode` must be `bulk` or `custom`.
- The direct-order form has common `name`, `email`, `address`, `qty`, and `notes` fields. **Ordinary Bulk Buying only** adds `title`; **custom commissions only** add `description` and optional `reference`. A `title` is required for bulk; a `description` is required for a custom commission.
- Product cards show an `increase` action labeled **Add to Cart** when quantity is zero, and a separate heart button with `data-action="favorite"` for saved items. Only standard items have the favorite control; commission cards expose only `data-action="commission"`.
- A `select[data-action="status"][data-id="ORDER_ID"]` changes order status in Forge Board. An active work ticket uses `button[data-action="ticket-complete"][data-id="ORDER_ID-INDEX"]`.
- The optional custom reference file is browser-only, with MIME restricted to PNG/JPG/WebP and size up to 350 KB.

UI designers may change text, layout, SVGs, CSS class names, and graphic elements freely so long as these hooks and field semantics remain intact.

## V5.2 queue and catalog behavior

- Catalog category `data-action="filter"` uses `data-id="Commission"` to show the three custom products. Selecting a category clears Your ♡.
- `data-action="saved-filter"` is labeled **Your ♡** and sets the catalog to All while showing the saved ordinary products.
- `STATUSES` in `src/domain/core.js`: **Placed**, **Processing**, **Delivering**, **Delivered**. These names are displayed by the shared progress and status components.
- The active production queue contains only unfinished line-item tickets from **Placed / Processing** orders. `toggleTicket` automatically changes the order to **Delivering** only after all line-item tickets have been marked complete.
- Manually moving an order back from Delivering or Delivered into Placed or Processing reopens its tickets.

## V5.4 Repairs interface

- `data-view="repairs"`: opens the independent Repairs page.
- `#repair-order` submits directly as a `repair` order. Fields: `itemName`, `qty`, `damage`, `name`, `email`, optional `address`, optional `reference` image (PNG/JPG/WebP ≤350 KB).
- The form does not select from `src/data/catalog.js`, does not add items to the shopping cart, and does not have a recycle or bulk control.
- `REPAIR_STATUSES` from `src/domain/repairs.js`: Placed → Awaiting Drop-off → Assessing → Processing → Delivering → Delivered.
- Admin status selector uses the order's type. Repair Work Tickets exist only in Processing. The customer-facing Orders page renders the six-stage repair progress.
- Source comments remain for students to author.

## V5.5

- Custom order status dropdown and timeline use `COMMISSION_STATUSES` from `src/domain/core.js`.
- `#repair-order` still wraps all fields; it now contains two `.repair-panel` sections. The second holds customer contact inputs and the submit button.

## V5.6 queue position, quotes and demo tools

- `queueInfo(state, orderId)` in `src/domain/core.js` returns the customer's place in line. `stage` is `queued` (with `position`, `queueLength`, `ordersAhead`, `itemsAhead`, `openItems`, `totalItems`), `waiting`, `finished`, `delivering` or `delivered`. The Orders page puts `data-queue-position` on `.queue-panel`.
- Work tickets carry `queuePosition`, the same number the customer sees.
- Custom commissions create work tickets only in **Processing**, after Assessing. Standard and bulk orders still create tickets in Placed and Processing; repairs only in Processing.
- `form.quote-form[data-id="ORDER_ID"]` with field `quote` (crowns, up to 2 decimals) sets the price of a custom or repair order through `setQuote`.
- `data-action="add-samples"` adds three fictional sample orders (marked `source: "sample"`, hidden from My Orders). `data-action="reset-demo"` clears all browser data after a confirm dialog.
- Order numbers come from `nextOrderId(orders)`: `GF-0001`, `GF-0002`, …
- `.form-error` inside `#checkout`, `#direct-order` and `#repair-order` shows the reason a submission was refused. If browser storage refuses the save, the order is not created, the form keeps its values and the satchel is unchanged.
- Mobile navigation has two groups: `[data-nav-role="customer"]` and `[data-nav-role="smith"]`. The controller shows one group based on the current view. `body[data-role]` is `customer` or `smith`.
- Product images are buttons with `data-action="detail"` (standard) or `data-action="commission"` (custom). Product cards say **Add to satchel**.

## V5.7 search

- `#search-form` wraps `#search` and a submit `.search-button`. Submitting runs `pageForQuery`; an exact page name navigates, otherwise the shop shows results and focus moves to `#results-heading`.
- `data-action="clear-search"`, `data-action="search-suggest"` (with `data-id` = query) and `data-action="clear-filters-keep-search"` are search controls. `.page-shortcut[data-view]` opens a page.
- `searchCatalog(products, query)` returns ranked `{ product, score, matched }`; `matched` holds the name words to highlight.

- `#add-product`: Forge Board product form; standard products only. Fields `name`, `group`, `price`, `size`, `short`, `details`, `specs`, and optional `image`. Added products are kept in the same browser storage as orders.
