from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist' / 'Birdforge_V6_1_Standalone.html').read_text(encoding='utf-8')

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=which('chromium') or which('google-chrome') or None, args=['--no-sandbox'])
    for width, height in ((320, 720), (390, 844), (540, 900), (768, 1024), (950, 650), (1350, 900), (667, 375)):
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.set_content(HTML, wait_until='load')
        for kind in ('detail', 'bulk', 'commission'):
            if kind == 'detail':
                page.locator('[data-action="detail"][data-id="plate-light"]').first.click()
            elif kind == 'bulk':
                page.locator('[data-action="bulk"][data-id="plate-light"]').first.click()
            else:
                page.locator('[data-action="commission"][data-id="sword-commission"]').first.click()
            modal = page.locator('.modal')
            expected_class = {'detail': 'detail-modal', 'bulk': 'bulk-order-modal', 'commission': 'commission-order-modal'}[kind]
            assert expected_class in modal.get_attribute('class')
            data = modal.evaluate('''node => {
              const image = node.querySelector('.modal-image').getBoundingClientRect();
              const picture = node.querySelector('.modal-image img');
              const rendered = picture.getBoundingClientRect();
              const body = node.querySelector('.modal-body').getBoundingClientRect();
              const rect = node.getBoundingClientRect();
              return {
                columns: getComputedStyle(node).gridTemplateColumns,
                image: {x: image.x, y: image.y, right: image.right, bottom: image.bottom, width: image.width, height: image.height},
                picture: {x: rendered.x, y: rendered.y, width: rendered.width, height: rendered.height, naturalWidth: picture.naturalWidth, naturalHeight: picture.naturalHeight},
                body: {x: body.x, y: body.y, right: body.right, bottom: body.bottom},
                viewportWidth: innerWidth, viewportHeight: innerHeight, modalWidth: rect.width
              };
            }''')
            if width <= height or kind == 'commission':
                assert data['body']['y'] >= data['image']['bottom'] - 2, (width, height, kind, data)
                assert abs(data['picture']['x'] - data['image']['x']) <= 1, (width, height, kind, data)
                assert abs(data['picture']['width'] - data['image']['width']) <= 1, (width, height, kind, data)
                assert abs(data['picture']['height'] - data['image']['height']) <= 1, (width, height, kind, data)
                expected = data['picture']['width'] * data['picture']['naturalHeight'] / data['picture']['naturalWidth']
                assert abs(data['picture']['height'] - expected) <= 2, (width, height, kind, data)
            else:
                assert data['body']['x'] >= data['image']['right'] - 2, (width, height, kind, data)
            assert data['modalWidth'] <= width, (width, height, kind, data)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (width, height, kind)
            if (width, height, kind) in ((540, 900, 'detail'), (950, 650, 'detail'), (390, 844, 'bulk'), (390, 844, 'commission'), (950, 650, 'commission')):
                page.screenshot(path=str(ROOT / 'previews' / f'modal_{kind}_{width}x{height}.png'))
            page.locator('.modal-close').click()
        page.close()
    browser.close()
print('Modal layout smoke passed: portrait vertical and landscape horizontal for Details/Bulk; Commission always vertical.')
