from pathlib import Path
from shutil import which
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'dist'/'Gunters_Forge_V5_14_3_Standalone.html').read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=which('chromium') or which('google-chrome') or None,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1350,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(HTML,wait_until='load')
    assert page.locator('.product-card').count()==13
    assert page.locator('.commission-product').count()==3
    assert page.locator('.commission-product .favorite-icon').count()==0
    assert page.locator('[data-action="saved-filter"]').inner_text()=='Your ♡'
    page.locator('[data-action="filter"][data-id="Commission"]').click()
    assert page.locator('.product-card').count()==3
    assert page.locator('.commission-product').count()==3
    page.locator('[data-action="filter"][data-id="All"]').click()
    assert page.locator('#catalog .section-heading .eyebrow').count()==0
    assert page.locator('#catalog .section-heading .muted').count()==0
    assert page.locator('.product-card .eyebrow').count()==0
    standard=page.locator('.product-card[data-product="sword-short"]')
    assert standard.locator('.add-cart-button').is_visible()
    assert standard.locator('.quantity').count()==0
    assert standard.locator('.favorite-icon').is_visible()
    standard.locator('.favorite-icon').click()
    assert standard.locator('.favorite-icon').get_attribute('aria-pressed')=='true'
    standard.locator('.add-cart-button').click()
    standard=page.locator('.product-card[data-product="sword-short"]')
    assert standard.locator('.quantity strong').inner_text()=='1'
    standard.locator('[data-action="decrease"]').click()
    assert page.locator('.product-card[data-product="sword-short"] .quantity').count()==0
    page.locator('[data-action="detail"][data-id="plate-light"]').first.click()
    assert page.locator('.modal-cart-controls .add-cart-button').is_visible()
    assert page.locator('.modal-bulk-section [data-action="bulk"]').is_visible()
    page.locator('.modal-cart-controls .add-cart-button').click()
    assert page.locator('.modal-cart-controls .quantity strong').inner_text()=='1'
    page.locator('[data-action="close"]').click()
    page.locator('.desktop-nav [data-view="cart"]').click()
    assert page.locator('.cart-row').count()==1
    assert page.locator('#recycle-panel').is_visible()
    assert page.locator('#checkout [name="recycle"]').count()==0
    assert page.locator('#recycle-panel .recycle-extra').is_hidden()
    assert page.locator('#cart-estimate').inner_text()=='270.00 crowns'
    page.locator('#recycle-panel [name="recycle"]').check()
    assert page.locator('#recycle-panel .recycle-extra').is_visible()
    assert page.locator('#cart-estimate').inner_text()=='270.00 crowns'
    page.locator('#recycle-panel textarea[name="recycleDetails"]').fill('Worn iron kitchen tools')
    for name,value in {'name':'Elena Carter','email':'elena@example.com','address':'Fictional town','notes':'For the court'}.items():
        page.locator(f'#checkout [name="{name}"]').fill(value)
    page.locator('#checkout button[type="submit"]').click()
    assert page.locator('.order-card').count()==1
    assert 'Recycle Your Iron Tools' in page.locator('.order-card').inner_text()
    assert 'Worn iron kitchen tools' in page.locator('.order-card').inner_text()
    page.locator('.desktop-nav [data-view="shop"]').click()
    for custom_id in ('sword-commission','armor-commission','cookware-commission'):
        card=page.locator(f'.product-card[data-product="{custom_id}"]')
        assert card.locator('[data-action="bulk"]').count()==0
        assert card.locator('[data-action="commission"]').count()==2
    page.locator('[data-action="commission"][data-id="armor-commission"]').first.click()
    assert page.locator('#direct-order [name="recycle"]').count()==0
    assert page.locator('#direct-order [name="qty"]').input_value()=='1'
    assert page.locator('#direct-order [name="reference"]').count()==1
    for name,value in {'name':'A noble','email':'noble@example.com','description':'A custom full armor piece for a royal ceremony'}.items():
        page.locator(f'#direct-order [name="{name}"]').fill(value)
    page.locator('#direct-order button[type="submit"]').click()
    assert page.locator('.royal-order').count()==1
    assert 'Quote pending' in page.locator('.royal-order .order-total').inner_text()
    assert page.locator('.royal-order .commission-progress li').count()==5
    commission_id=page.locator('.royal-order').get_attribute('data-order')
    page.locator('.desktop-nav [data-view="admin"]').click()
    commission=page.locator(f'.admin-order[data-order="{commission_id}"]')
    assert commission.locator('select[data-action="status"] option').count()==5
    commission.locator('select[data-action="status"]').select_option('Assessing')
    page.locator('.desktop-nav [data-view="orders"]').click()
    assert page.locator('.royal-order .status').inner_text()=='Assessing'
    page.locator('.desktop-nav [data-view="shop"]').click()
    page.locator('[data-action="bulk"][data-id="pot-medium"]').click()
    assert page.locator('#direct-order [name="recycle"]').count()==0
    for name,value in {'name':'Castle steward','email':'steward@example.com','title':'Steward','qty':'30','notes':'Festival cooking'}.items():
        page.locator(f'#direct-order [name="{name}"]').fill(value)
    page.locator('#direct-order button[type="submit"]').click()
    assert page.locator('.order-card').count()==3
    page.locator('.desktop-nav [data-view="tickets"]').click()
    assert page.locator('.work-ticket').count()==2
    assert commission_id not in ' '.join(page.locator('.work-ticket').all_inner_texts())
    assert all(s in page.locator('.work-ticket').first.inner_text() for s in ('Placed',))
    page.locator('.work-ticket [data-action="ticket-complete"]').first.click()
    assert page.locator('.work-ticket').count()==1
    page.locator('.desktop-nav [data-view="orders"]').click()
    assert 'Delivering' in page.locator('.order-card').all_inner_texts()[0] or any('Delivering' in x for x in page.locator('.order-card').all_inner_texts())
    assert not errors,errors
    page.close()
    repair=browser.new_page(viewport={'width':1200,'height':900})
    repair.set_content(HTML,wait_until='load')
    repair.locator('.desktop-nav [data-view="repairs"]').click()
    assert repair.locator('#repair-order').is_visible()
    assert repair.get_by_role('heading',name='Ironware Repair').is_visible()
    assert repair.locator('#repair-order > .repair-panel').count()==2
    assert repair.locator('#repair-order > .repair-panel').nth(1).get_by_role('heading',name='Contact details').is_visible()
    assert repair.locator('#repair-order select[name="productId"]').count()==0
    repair.locator('#repair-order [name="itemName"]').fill('Damaged farmhouse door hinge')
    repair.locator('#repair-order [name="qty"]').fill('3')
    repair.locator('#repair-order [name="damage"]').fill('The hinge does not close and needs repair.')
    repair.locator('#repair-order [name="name"]').fill('Elena Carter')
    repair.locator('#repair-order [name="email"]').fill('elena@example.com')
    repair.locator('#repair-order button[type="submit"]').click()
    assert repair.locator('.order-card').count()==1
    assert repair.locator('.order-card').get_attribute('data-order')
    assert repair.locator('.order-card .repair-progress li').count()==6
    repair.locator('.desktop-nav [data-view="tickets"]').click()
    assert repair.locator('.work-ticket').count()==0
    repair.locator('.desktop-nav [data-view="admin"]').click()
    status=repair.locator('select[data-action="status"]')
    assert status.locator('option').count()==6
    status.select_option('Awaiting Drop-off')
    status=repair.locator('select[data-action="status"]')
    status.select_option('Assessing')
    repair.locator('.desktop-nav [data-view="tickets"]').click()
    assert repair.locator('.work-ticket').count()==0
    repair.locator('.desktop-nav [data-view="admin"]').click()
    repair.locator('select[data-action="status"]').select_option('Processing')
    repair.locator('.desktop-nav [data-view="tickets"]').click()
    assert repair.locator('.work-ticket').count()==1
    assert 'Damaged farmhouse door hinge' in repair.locator('.work-ticket').inner_text()
    assert '3' in repair.locator('.work-ticket').inner_text()
    assert 'elena@example.com' not in repair.locator('.work-ticket').inner_text()
    repair.locator('.work-ticket [data-action="ticket-complete"]').click()
    assert repair.locator('.work-ticket').count()==0
    repair.locator('.desktop-nav [data-view="orders"]').click()
    assert 'Delivering' in repair.locator('.order-card').inner_text()
    repair.close()
    for width in [320,375,390,768,1024,1350]:
        p=browser.new_page(viewport={'width':width,'height':850})
        p.set_content(HTML,wait_until='load')
        assert not p.evaluate('document.documentElement.scrollWidth > innerWidth'),f'Overflow at {width}'
        if width<=760: assert p.locator('.mobile-nav').is_visible()
        p.close()
    browser.close()
print('Browser smoke passed: standard checkout, custom, bulk, repair drop-off/assessment/tickets, and six viewport widths.')
