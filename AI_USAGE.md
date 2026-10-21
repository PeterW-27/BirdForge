# AI Usage Disclosure

Project: Birdforge (formerly Gunter's Forge), V1–V6.2
Last updated: October 21, 2026

## Scope of assistance

AI tools were used to support the development of Gunter's Forge through code drafting and revisions, troubleshooting, automated testing, and visual assets. The sections below summarize these uses during development.

## Tools and records

- OpenAI ChatGPT and Codex supported code drafting and revisions, interface changes, debugging, build tooling, and automated tests.
- Anthropic Claude / Claude Code assisted with code changes and troubleshooting during V5.6, V5.7 and later updates.
- ChatGPT was also used to generate the product images and the crest design, which were reviewed and selected by the team.

## Uses during development

| Area | Assistance |
| --- | --- |
| Code organization and ordering | Drafting and revising code for page structure, cart operations, checkout validation, bulk orders, commissions, repairs, and browser storage. |
| Workshop workflow | Assistance with queue calculations, work tickets, quotes, status updates, and fictional demo orders. |
| Search and usability | Search submission, page shortcuts, typo tolerance, ranking, highlighting, category filtering, and mobile layout adjustments. |
| Visual assets | Generating product images and the crest, integrating team-selected assets, and preparing image files for the application. |
| Code review and troubleshooting | Reviewing product creation and data validation and helping investigate implementation issues. |
| Documentation | Assistance with the README file and explanations of existing code. |

## Development record — V1 to V5.14.3

The earlier prototypes were named Nova Market. The project became Gunter's Forge at V4 and BirdForge at V6. Dates are given only where supported by the available project records.

### V1 — Initial prototype

The student prompted OpenAI ChatGPT to build a webpage for a modern online shopping platform. ChatGPT generated an early prototype for an online shopping website based on those requirements. This AI-generated prototype served as the starting point for subsequent development and revisions.

### V2 — Nova Market

ChatGPT reviewed the supplied V1 application and online shopping site requirements, then assisted with producing a responsive storefront using separate HTML, CSS, and JavaScript files. Work included local SVG product illustrations, favorites, cart and checkout validation, order confirmation and tracking, inventory controls, low-stock reporting, browser-local storage, tests, and supporting documentation.

### V3 — Nova Market

ChatGPT assisted with adapting the application to a more specific requirement on the four technology product types: Smartphone, Headphones, Laptop, and Smartwatch. The revision included storefront and administrator components, an inventory-focused Smart Restock feature, automated tests, and requirements documentation.

### V4 — Gunter's Forge

AI assistance supported changing the generic technology shop into a blacksmith storefront set in Mautern. The product catalog, interface, and order terminology were reworked around the forge setting. This version included a forge-themed order workflow, a Supply Ledger, and an optional engraving or custom-request field. Testing and documentation were also revised.

### V5 — Modular workshop foundation

ChatGPT assisted with reorganizing the V4 application into editable data, domain, controller, UI-component, page, and CSS modules. The workshop version introduced ordinary forged goods, custom commissions, independent bulk ordering, iron recycle options, a Forge Board, and individual chronological Work Tickets. Automated tests, a standalone-HTML build tool, and design handoff documentation were prepared. These early workshop behaviors were revised in later versions.

### V5.1 — Shopping interactions

AI-assisted revisions changed ordinary product cards to show Add to Cart before selection and quantity controls afterward, with a separate favorite button. The product-detail layout was adjusted; custom commissions were excluded from bulk ordering and recycling. The iron-collection option was moved into its own cart panel.

### V5.2 — Catalog and production workflow

AI-assisted work refined commission cards and added Commission and Your ♡ catalog filters. Order stages became Placed → Processing → Delivering → Delivered. The Work Tickets rules were revised so completing an individual ticket removes that ticket and completing every ticket in an order advances the order to Delivering. An earlier compatibility mapping for saved statuses was added and later removed.

### V5.3 — Copy placeholders and layout

At the student's request, AI assistance replaced unsolicited promotional text with placeholders, aligned commission buttons at the bottom of product cards, and removed the old-status compatibility code. Functional labels and existing order behavior were retained.

### V5.4 — Repair orders

ChatGPT assisted with adding a separate Repairs page for repairing old ironware. Repair requests gained free-text item and damage fields, an optional image, a separate order type, and stages for Awaiting Drop-off and Assessing. Repair orders were connected to the order history, Forge Board, and Work Tickets.

### V5.5 — Commission assessment and repair layout

AI-assisted changes added an Assessing stage to custom commissions while keeping the ordinary and repair workflows separate. The repair page was titled Ironware Repair, and its item-information and contact-details fields were displayed in separate panels.

### V5.6 — Queue, quotes, reliability, and interface

Claude Code and ChatGPT assisted during this development period. The version added customer queue positions, shared queue numbers on Work Tickets, quote entry for commissions and repairs, short sequential order numbers, safer handling of failed browser-storage saves, cross-tab queue updates, form validation improvements, and navigation changes. Product descriptions, themed copy, demo tools, and automated tests were also expanded.

### V5.7 — Search and filtering

Claude Code assisted during V5.7. Documented changes included a dedicated search-results view, Enter/button submission, typo-tolerant matching, synonyms, result ranking and highlighting, suggested searches, navigation shortcuts to customer pages, and related commission products appearing in category filters. Search tests were added.

### V5.8 — Product management and iron collection

ChatGPT assisted with ensuring category filters displayed related commission products, and removing the iron-recycling option from bulk orders. The former iron-recycling discount was replaced with a collection request: worn-out ironware would be weighed and paid for separately when collected. The Forge Board gained a form for adding ordinary products to the existing categories, with optional images saved in browser-local storage.

### V5.9 and V5.9.1 — Product modal layout

AI-assisted responsive CSS changes made Details and Bulk Order modals vertically stacked when the viewport is taller than it is wide, while retaining a side-by-side layout when the viewport is wider than it is tall. A follow-up revision corrected the portrait image area so pictures use the available width and retain their aspect ratio without large empty side panels.

### V5.10 — Commission workflow and final layout checks

ChatGPT assisted with making commission orders enter Processing automatically when Gunter saves a valid quote during Placed or Assessing. A quote update does not move an order backward from delivery. The commission request modal was changed to an image-above-content layout in both portrait and landscape. A later responsive CSS fix kept the quantity stepper inside narrow product cards. Ordering logic and layout checks were updated.

### V5.10.2 — Validation, Forge Board and product tools

Claude Code assisted with this revision. Form errors now appear under the field that needs fixing, and quote prices are checked against the 100000-crown limit before saving. The Forge Board gained a Show delivered option, an example and live preview for new products, and removal of added products that no order uses. Customers and Gunter can open uploaded reference images in a viewer. The tablet header and the phone home screen were made more compact, and short animations were added for dialogs, notices and the satchel count. Automated tests were added for the new rules.

### V5.11 — October 20, 2026

OpenAI Codex assisted with implementing order status history, footer Backup/Restore controls, save confirmation and filename entry, system save/share options, and file validation. 

### V5.12 — Order updates, estimated dates, and workshop navigation

Codex assisted with adding browser-local order update messages and unread indicators. 

### V5.13 — Orb messages, ready estimates and forge theme

Claude Code assisted with this revision. It added the Orb page, which records a message whenever an order is received, priced, forged, finished or delivered, shows unread counts, updates other open tabs and can show system notifications. The interface was restyled with a dark iron header, ember highlights, parchment surfaces, copper-orange accents, and gold details. Automated tests were added for messages.

### V5.14 — October 20, 2026

OpenAI Codex assisted with implementing the team's Messenger Orb design: mobile-first top notification banners, a single chat-style orb popup, immediate read marking when opened, persistent order updates and local asynchronous messages, and a Forge Board Messages inbox with replies and unread counts. Sample-order notifications were excluded. Assistance also covered notification persistence, backup compatibility, automated checks, responsive layout review, and the standalone build. The team specified the interaction behavior and revised the design before implementation.

### V5.14.2 — October 20, 2026

OpenAI Codex assisted with adjustments on the theme of the V5.14 application. The image editing tool of Codexassisted with producing a dark-gold anvil favicon. Assistance also covered the standalone build, regression checks, and responsive visual review. The team specified the visual reference and the boundaries of the revision. 

### V5.14.3 — October 20, 2026

OpenAI Codex assisted with minor adjustments on theme details. This include the color for background and buttons, and a crest image was added to the homepage. 

### V6.0 — October 20, 2026

Claude Code assisted with this revision. It split the application into a customer page and a workshop page that update each other immediately, added an all-in-one demo page for offline presentations, and added an online mode: a small Node.js server that stores orders, keeps each customer's orders and messages private by device, and pushes changes to open pages. It also fixed General inquiry so each customer device has its own conversation, added the Business report on Forge Board, renamed the shop to Birdforge, redrew the crest concept with a sparrow resting on the anvil (the final crest image was generated by the team with an image tool and prepared for the site by Claude Code), prepared the deployment scripts, and added automated tests for the server, reports and messages.

### V6.1 — October 21, 2026

OpenAI Codex assisted with implementing Forge Credit, ore inventory and recipes, material accounting, the report additions, automated tests, responsive checks and the standalone builds. Its first version of the mine was a minesweeper game. Claude Code then replaced it with a live push-your-luck expedition inspired by the board game Diamant (Incan Gold), with apprentice miners, a canary scout, the customer Mine page, an expedition board for Gunter, server actions for multiplayer play and tests. Codex deployed this version to the online server.

### V6.2 — October 21, 2026

OpenAI Codex assisted with implementing Gunter's Mine, a cooperative card game for 2–6 players inspired by Slay the Spire, from a plan written with Claude Code: the card, enemy and turn rules, rooms with four-letter codes, phone controls, the Mine Stage big screen, timed turns, reward cards, the retreat vote, Forge Credit payouts, server actions and tests. It replaced the V6.1 expedition. Claude Code reviewed and tested the result before the team deployed it to birdforge.shop.

## Project direction and review

Project requirements and revision priorities were directed by the team. Student feedback identified usability issues, guided requested changes, and informed the selection of visual assets. All the comments were written by the team.
