from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
html = (root / 'dist' / 'Birdforge_V6_0_Standalone.html').read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=which('chromium') or which('google-chrome') or None, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.set_content(html, wait_until='load')
    page.locator('[data-action="commission"][data-id="sword-commission"]').first.click()
    for name, value in {'name': 'Example customer', 'email': 'customer@example.com', 'description': 'A commission with notes for the craftsperson.'}.items():
        page.locator(f'#direct-order [name="{name}"]').fill(value)
    page.locator('#direct-order button[type="submit"]').click()
    order_id = page.locator('.royal-order').first.get_attribute('data-order')
    page.locator('.mobile-nav [data-view="admin"]:visible').click()
    order = page.locator(f'.admin-order[data-order="{order_id}"]')
    order.locator('select[data-action="status"]').select_option('Assessing')
    order = page.locator(f'.admin-order[data-order="{order_id}"]')
    assert order.locator('.status').inner_text() == 'Assessing'
    order.locator('.quote-form input[name="quote"]').fill('150.50')
    order.locator('.quote-form button[type="submit"]').click()
    order = page.locator(f'.admin-order[data-order="{order_id}"]')
    assert order.locator('.status').inner_text() == 'Processing'
    assert '150.50 crowns' in order.inner_text()
    page.locator('.mobile-nav [data-view="tickets"]:visible').click()
    assert page.locator('.work-ticket').count() == 1
    page.locator('.mobile-nav [data-view="admin"]:visible').click()
    order = page.locator(f'.admin-order[data-order="{order_id}"]')
    order.locator('select[data-action="status"]').select_option('Delivering')
    order = page.locator(f'.admin-order[data-order="{order_id}"]')
    order.locator('.quote-form input[name="quote"]').fill('160')
    order.locator('.quote-form button[type="submit"]').click()
    assert page.locator(f'.admin-order[data-order="{order_id}"] .status').inner_text() == 'Delivering'
    browser.close()
print('Commission quote browser flow passed: assess, quote, Processing ticket, price update without rollback.')
