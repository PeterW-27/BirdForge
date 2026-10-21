# Birdforge Version 6.0

Yuzhe Wang, Zilu Niu, and Lin Ma

## Project overview

Birdforge is the shop application for Gunter, the blacksmith of Mautern. Customers can order swords, plate armor, chain mail, and cooking pots, then check their place on his work list. They can also request custom pieces or repairs.

Gunter uses Forge Board to review orders, set prices, and update their status. Work Tickets gives him a separate list of unfinished jobs, ordered from oldest to newest. Each ticket contains the work details without the customer's contact information.

The app is written in HTML, CSS, and JavaScript, with layouts for phones and desktop browsers. It runs fully offline in one browser, or online with a small Node.js server so customers and Gunter can use different devices. Orders and payments are for demonstration only.

### New in V6.0

- **Birdforge name and crest:** The shop is now called Birdforge. The new crest shows a sparrow resting on Gunter's anvil while sparks fly from the forge.
- **Separate customer and workshop pages:** `index.html` is the customer shop. `forge.html` is Gunter's workshop with Forge Board and Work Tickets. Both pages share the same orders and update each other immediately.
- **All-in-one demo page:** `demo.html` keeps the customer pages and the workshop in one window, for presenting or testing without a network.
- **Online mode:** `server/server.js` stores orders on a server and pushes every change to open pages. Each customer device only sees its own orders and messages. The workshop page is never published to the internet.
- **Business report:** Forge Board → Reports summarizes any period: delivered revenue, orders received, booked value, average order, average time to delivery, order mix, best sellers and a written summary, with comparison to the previous period, CSV download and printing.
- **Private General inquiry:** Every customer device has its own General inquiry conversation, and Gunter sees each one as a separate thread.

### New in V5.14

- **Messenger Orb:** A floating orb opens one chat-style popup for order updates and asynchronous messages to Gunter. Opening the orb immediately marks all received messages as read. Conversations stay in this browser, with time dividers between sessions; drafts are kept while navigating or closing the popup.
- **Order notifications:** Customer order status changes and quotes create saved notifications. Large top banners appear for four seconds and slide upward, survive page navigation, and link to the matching order. Two notifications appear separately; three or more show one notification plus an “And ... more notifications.” banner that opens the orb. Sample orders never notify customers.
- **Forge Board Messages:** Gunter can read customer conversations and reply under Messages, with unread counts and order context. Replies reach the customer when they return to a customer page or reopen the app. This remains a browser-local demonstration without cross-device messaging.

## Setup instructions

### Open the standalone version

Extract the project ZIP and open one of these files in a modern browser. Each file includes the code, styles, and images, so it works offline without installing anything else:

| File | Use |
| --- | --- |
| `dist/Birdforge_V6_0_All_In_One_Standalone.html` | Customer pages and Gunter's workshop in one window. Best for a quick demo. |
| `dist/Birdforge_V6_0_Standalone.html` | Customer shop only. |
| `dist/Birdforge_V6_0_Workshop_Standalone.html` | Gunter's workshop only. |

Open the customer and workshop files side by side in the same browser to see them update each other. Use the same browser and file location to keep working with the same saved demo data.

### Run the online version

The online version needs Node.js 18 or newer and no npm packages. From the project root:

```bash
node server/server.js
```

The customer shop opens at <http://127.0.0.1:8789> and Gunter's workshop at <http://127.0.0.1:8790>. Data is saved in `data/state.json`. Set `PUBLIC_HOST`, `PUBLIC_PORT`, `ADMIN_HOST`, `ADMIN_PORT`, `BIRDFORGE_DATA` or `SHOP_URL` to change where it listens and stores data. The `deploy/` folder contains generic deployment templates. Set your own `HOST`, `SHOP_DOMAIN` and `SHOP_URL` before use; review the service and Caddy configuration for your environment. `enable-https.sh` only stages and validates a Caddy configuration for review. Keep the workshop port private.

### Run the source version

To edit the project, open a terminal in the folder containing `index.html` and `package.json`. Start a local server with Python 3:

Windows, with the Python launcher installed:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

macOS or Linux:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. Press `Ctrl+C` in the terminal when finished.

Use the server for `index.html` because the source version loads JavaScript modules. The server only serves files; order data still stays in the browser.

### Rebuild after editing

With Python 3.9 or newer, run this from the project root:

```bash
python3 tools/build_standalone.py
```

On Windows, use `py tools/build_standalone.py`. This rebuilds the three standalone files in `dist/` from the current source, styles, and assets.

## Usage guide

### Place and track an order

1. Open Shop and choose a category or search for a product.
2. Open Details to read about an item, then select Add to satchel.
3. Adjust the quantity and open Satchel.
4. Enter fictional contact details and select Place order.
5. Open My Orders to see the status, queue position, and work ahead of the order.

The optional Recycle Your Iron Tools section records old iron the customer plans to bring. It does not discount the order.

Search accepts product names and descriptive terms, including common spelling variations and limited typos. Press Enter or the search button to focus the results. Queries such as `repair`, `orders`, and `cart` open those pages. Use the heart button to save standard products and Your ♡ to find them again.

### Other requests

- For a bulk purchase, select Bulk order (10+) on a standard product. Enter 10 to 10,000 units, a buyer title or position, and contact details. The order goes directly to Gunter without using the satchel.
- For a custom piece, open a commission card and describe the design. A commission is for one item and does not support bulk buying.
- For a repair, open Repairs and describe the item and damage. The item does not have to be one of the products in the shop.

Commissions and repairs can include a PNG, JPEG, or WebP reference image up to the 350 KB upload limit. Their price is pending until Gunter enters a quote.

### Work through the queue

Open Forge Board from the workshop page (or from Gunter on the all-in-one page). Here you can review orders, filter by type, enter quotes, and change statuses.

Open Work Tickets to see unfinished jobs. One ticket represents an order line, which may include several units of the same product. Mark complete removes that ticket; once all tickets in an order are finished, the order moves to Delivering. Queue positions in My Orders update as work is completed.

Standard and bulk orders have tickets in Placed or Processing. Commissions and repairs appear only in Processing. Quoting a commission in Placed or Assessing moves it to Processing automatically.

Forge Board also lets you add standard products to the four categories, add fictional sample orders, or clear demo data. Sample orders contribute to the queue but are hidden from My Orders. Clearing demo data removes saved orders, added products, favorites, and satchel contents after confirmation.

Delivered orders are hidden from Forge Board by default; turn on Show delivered to see them again. When adding a product, Fill in an example shows a sample entry, and the shop preview shows how the new card will look. Products added on Forge Board can be removed if no order uses them, and uploaded reference images open in a viewer for both the customer and Gunter.

## Feature list

- Four product categories, with multiple standard items and related commissions.
- Satchel quantities, totals, checkout validation, and optional notes.
- Queue positions showing orders and unfinished lines ahead.
- Work tickets and order status updates.
- Custom commissions and repairs with quotes and optional reference images.
- Direct bulk orders for standard products.
- Search with ranking, synonyms, typo tolerance, highlighted matches, suggestions, and page shortcuts.
- Saved products, category filters, and sorting.
- Product creation and demo-data controls in Forge Board.
- Phone and desktop layouts, with local saving and feedback when saving fails.
- Business report with period selection, comparison, CSV export and printing.
- Online mode with live updates between devices and private customer data.

## Team contributions

All three of us worked on the project through AI-assisted coding. Our main areas were:

| Team member | Work |
| --- | --- |
| Yuzhe Wang | Order and workshop management logic, plus parts of the UI. |
| Zilu Niu | System iteration and interface design. |
| Lin Ma | Image generation, artwork, and text editing. |

## Project structure

```text
index.html                Customer shop entry
forge.html                Gunter's workshop entry
demo.html                 All-in-one demo entry
src/main.js               Customer startup (forge.js and demo.js start the other pages)
src/controller/           Navigation, event handling, and state updates
src/data/                 Catalog, browser storage, and sample orders
src/domain/               Order, product, repair, queue, and search rules
src/ui/components/        Reusable interface components
src/ui/pages/             Shop, Satchel, Repairs, Orders, and workshop pages
src/extensions/           Extension registration
server/server.js          Online server with live updates
deploy/                   Server service file and deployment scripts
styles/                   Shared theme, component, and responsive styles
assets/                   Product images and crest
tests/                    Automated business and browser checks
tools/build_standalone.py Offline HTML build script
dist/                     Standalone application
AI_USAGE.md               AI assistance disclosure
```

## Development checks

The JavaScript tests need Node.js 18 or newer. No npm package installation is required:

```bash
node --test tests/*.test.js
```

The optional browser scripts in `tests/` need Python Playwright and Chromium. They cover ordering, commissions, and dialog layouts.

## Data and limitations

Offline, the app uses `localStorage` for orders, favorites, added products, and uploaded images. Data belongs to the current browser profile and origin, so different devices or browser profiles do not share it. Clearing browser data removes it. Large images or browser storage restrictions can prevent saving; the app reports save failures and checks stored data when restoring it.

Online, orders, products and messages live on the server, while the satchel and saved items stay on each device. A customer is recognized by a random device ID stored in the browser, so clearing browser data or switching devices hides earlier orders from that customer (Gunter still sees them). The workshop has no login and relies on being reachable only from Gunter's computer. There is no payment processing or inventory service. Use fictional details when demonstrating it.
