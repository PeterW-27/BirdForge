import {addProduct} from '../src/domain/products.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,groups} from '../src/data/catalog.js';
import {shopPage} from '../src/ui/pages/shop.js';
import {makeState,restoreState,cartCount,totalCents,changeQuantity,placeCartOrder,placeDirectOrder,updateStatus,workTickets,toggleTicket,STATUSES,COMMISSION_STATUSES,statusesFor,orderStats,customerIssue,setQuote} from '../src/domain/core.js';
const customer={name:'Elena of Mautern',email:'elena@example.com',address:'Fictional town',recycle:'no'};
const first=catalog.find(p=>p.type==='standard');
const withCart=(id=first.id,qty=1)=>({...makeState(),cart:{[id]:qty}});
const place=(state,id,date)=>placeCartOrder(catalog,state,customer,id,date);
test('only four specified product categories',()=>assert.deepEqual(groups,['Sword','Plate Armor','Chain Mail','Cooking Pot']));
test('all standard products use those categories',()=>assert.ok(catalog.filter(p=>p.type==='standard').every(p=>groups.includes(p.group))));
test('exactly three named commission products',()=>assert.deepEqual(catalog.filter(p=>p.type==='custom').map(p=>p.name),['Sword Commission','Armor Commission','Cookware Commission']));
test('armor commission is visible in plate armor and chain mail filters',()=>assert.deepEqual(catalog.find(p=>p.id==='armor-commission').groups,['Plate Armor','Chain Mail']));
test('several normal products in each family',()=>assert.ok(groups.every(g=>catalog.filter(p=>p.groups.includes(g)&&p.type==='standard').length>=2)));
test('catalog images have separate replaceable file locations',()=>assert.equal(new Set(catalog.map(p=>p.image)).size,catalog.length));
test('state has no stock or inventory tracking',()=>assert.ok(!('inventory' in makeState())));
test('no inventory limits normal 99-unit cart quantity',()=>assert.equal(changeQuantity(catalog,makeState(),first.id,99).state.cart[first.id],99));
test('over 99 normal quantity rejected',()=>assert.ok(changeQuantity(catalog,makeState(),first.id,100).error));
test('custom items not allowed in normal satchel',()=>assert.ok(changeQuantity(catalog,makeState(),'sword-commission',1).error));
test('price subtotal calculation',()=>assert.equal(totalCents(catalog,withCart(first.id,2)),first.priceCents*2));
test('restore state strips invalid cart values',()=>assert.deepEqual(restoreState({cart:{'sword-commission':1,[first.id]:-5}},catalog).cart,{}));
test('cart total counts quantities',()=>assert.equal(cartCount(catalog,withCart(first.id,5)),5));
test('normal order starts Placed and clears only standard cart',()=>{const r=place(withCart(), 'O-1','2026-10-17T12:00:00Z');assert.equal(r.order.status,'Placed');assert.deepEqual(r.state.cart,{});});
test('ordinary checkout accepts recycled iron descriptions',()=>{const r=placeCartOrder(catalog,withCart(),{...customer,recycle:'yes',recycleDetails:'used iron cooking tools'},'O-1','2026-10-17T12:00:00Z');assert.equal(r.order.totalCents,first.priceCents);assert.equal(r.order.recycleDetails,'used iron cooking tools');});
test('bulk order submits directly without changing satchel',()=>{const s=withCart();const r=placeDirectOrder(catalog,s,first.id,'bulk',{...customer,qty:25,title:'Royal quartermaster',notes:'Deliver to smithy'},'B-1','2026-10-17T12:00:00Z');assert.equal(r.order.type,'bulk');assert.equal(r.order.items[0].qty,25);assert.equal(r.state.cart[first.id],1);});
test('bulk requests must include buyer title',()=>assert.ok(placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:25,title:''},'B-1','2026').error));
test('bulk requires at least ten of same product',()=>assert.ok(placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:9,title:'Steward'},'B-1','2026').error));
test('bulk rejects quantity above maximum',()=>assert.ok(placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:10001,title:'Steward'},'B-1','2026').error));
test('custom commission requires meaningful description',()=>assert.ok(placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'short'},'C-1','2026').error));
test('custom commission has pending quote',()=>{const r=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'A custom ceremonial design for the royal court'},'C-1','2026-10-17T12:00:00Z');assert.equal(r.order.type,'custom');assert.equal(r.order.totalCents,null);});
test('custom commission rejects bulk buying',()=>{const r=placeDirectOrder(catalog,makeState(),'armor-commission','bulk',{...customer,qty:12,title:'Castle steward',description:'Tailored armor for a castle ceremonial guard'},'BC-1','2026-10-17T12:00:00Z');assert.match(r.error,/cannot use Bulk Buying/);});
test('custom commission rejects recycling',()=>{const r=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,recycle:'yes',qty:1,description:'A custom ceremonial sword for the royal court'},'C-3','2026-10-17T12:00:00Z');assert.match(r.error,/Recycling is unavailable/);});
test('custom commission always records no recycling',()=>{const r=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'A custom ceremonial sword for the royal court'},'C-4','2026-10-17T12:00:00Z');assert.equal(r.order.recycle,'no');});
test('custom supports optional image reference',()=>{const image='data:image/png;base64,AA==';const r=placeDirectOrder(catalog,makeState(),'cookware-commission','custom',{...customer,qty:1,description:'Large specialized cooking vessel with two handles'},'C-2','2026-10-17T12:00:00Z',image);assert.equal(r.order.referenceImage,image);});
test('invalid reference image rejected',()=>assert.ok(placeDirectOrder(catalog,makeState(),'cookware-commission','custom',{...customer,qty:1,description:'Large specialized cooking vessel with handles'},'C-2','2026-10-17T12:00:00Z','data:text/html;base64,AA==').error));
test('invalid customer email blocked',()=>assert.ok(customerIssue({...customer,email:'oops'})));
test('ticket queue sorts oldest to newest regardless insertion order',()=>{const newer=place(withCart(),'N','2026-10-17T15:00:00Z').state.orders[0];const older=place(withCart(),'O','2026-10-17T09:00:00Z').state.orders[0];assert.deepEqual(workTickets({orders:[newer,older]}).map(x=>x.orderId),['O','N']);});
test('multi-product order yields one ticket per product',()=>{const state={...makeState(),cart:{[catalog[0].id]:2,[catalog[1].id]:3}};const r=place(state,'T','2026-10-17T12:00:00Z');assert.deepEqual(workTickets(r.state).map(x=>x.qty),[2,3]);});
test('work tickets do not expose customer address or email',()=>{const t=workTickets(place(withCart(),'O','2026-10-17T12:00:00Z').state)[0];assert.ok(!('customer' in t));assert.ok(!('address' in t));assert.ok(!('email' in t));});
test('Delivering and Delivered orders never show in work tickets',()=>{const r=place(withCart(),'O','2026-10-17T12:00:00Z');for(const status of ['Delivering','Delivered']){const updated=updateStatus(r.state,'O',status).state;assert.equal(workTickets(updated).length,0);}});
test('forge status stages follow new fulfillment flow',()=>assert.deepEqual(STATUSES,['Placed','Processing','Delivering','Delivered']));
test('order stats include custom and bulk',()=>{const one=placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:10,title:'Steward'},'B','2026-10-17T12:00:00Z');assert.equal(orderStats(one.state).bulk,1);});

test('ticket completion affects only selected item',()=>{const r=place({...makeState(),cart:{[catalog[0].id]:1,[catalog[1].id]:3}},'M','2026-10-17T12:00:00Z');const tickets=workTickets(r.state);const next=toggleTicket(r.state,tickets[0].id).state;assert.equal(workTickets(next).length,1);assert.equal(workTickets(next)[0].id,tickets[1].id);});
test('completed tickets persist through restoring stored state',()=>{const r=place(withCart(),'M','2026-10-17T12:00:00Z');const t=workTickets(r.state)[0];const finished=toggleTicket(r.state,t.id).state;assert.equal(workTickets(restoreState(finished,catalog)).length,0);});
test('ticket cannot be marked complete for unknown order',()=>assert.ok(toggleTicket(makeState(),'missing-0').error));

const shopUI={category:'All',savedOnly:false,sort:'featured',search:''};
test('commission filter shows exactly three special products',()=>{const html=shopPage(makeState(),{...shopUI,category:'Commission'});assert.equal((html.match(/data-product="[^"]+"/g)||[]).length,3);assert.ok(html.includes('Sword Commission'));assert.ok(html.includes('Armor Commission'));assert.ok(html.includes('Cookware Commission'));});
test('product category filters also show related commissions',()=>{for(const group of groups){const html=shopPage(makeState(),{...shopUI,category:group});const related=catalog.filter(p=>p.type==='custom'&&p.groups.includes(group));for(const product of related)assert.ok(html.includes('data-product="'+product.id+'"'),group);}});
test('commission product card contains no save control',()=>{const html=shopPage(makeState(),{...shopUI,category:'Commission'});assert.ok(!html.includes('data-action="favorite"'));assert.ok(html.includes('Request a commission'));});
test('favorite filter has new label and supports normal products',()=>{const s={...makeState(),favorites:['sword-short']};const html=shopPage(s,{...shopUI,savedOnly:true});assert.ok(html.includes('Your ♡'));assert.equal((html.match(/data-product="[^"]+"/g)||[]).length,1);});
test('stored favorites omit commission items',()=>assert.deepEqual(restoreState({favorites:['sword-commission','sword-short']},catalog).favorites,['sword-short']));
test('unrecognized statuses are rejected without backward conversion',()=>{const current=place(withCart(),'T','2026-10-17T12:00:00Z').state;const unsupported={...current,orders:current.orders.map(o=>({...o,status:'Requested'}))};assert.equal(restoreState(unsupported,catalog).orders.length,0);});
test('only Placed and Processing orders appear as tickets',()=>{const state=place(withCart(),'T','2026-10-17T12:00:00Z').state;for(const status of STATUSES){const updated=updateStatus(state,'T',status).state;assert.equal(workTickets(updated).length,['Placed','Processing'].includes(status)?1:0);}});
test('single-item complete advances to Delivering',()=>{const r=place(withCart(),'T','2026-10-17T12:00:00Z');const ticket=workTickets(r.state)[0];const result=toggleTicket(r.state,ticket.id);assert.equal(result.advanced,true);assert.equal(result.state.orders[0].status,'Delivering');assert.equal(workTickets(result.state).length,0);});
test('first ticket in multi-item order keeps others visible and status Placed',()=>{const r=place({...makeState(),cart:{'sword-short':1,'plate-light':2}},'T','2026-10-17T12:00:00Z');const slips=workTickets(r.state);const partial=toggleTicket(r.state,slips[0].id);assert.equal(partial.advanced,false);assert.equal(partial.state.orders[0].status,'Placed');assert.equal(workTickets(partial.state).length,1);const all=toggleTicket(partial.state,slips[1].id);assert.equal(all.state.orders[0].status,'Delivering');assert.equal(workTickets(all.state).length,0);});
test('reopening a Delivering order restores all its tickets',()=>{const r=place(withCart(),'T','2026-10-17T12:00:00Z');const done=toggleTicket(r.state,workTickets(r.state)[0].id).state;const renewed=updateStatus(done,'T','Processing').state;assert.equal(renewed.completedTickets.length,0);assert.equal(workTickets(renewed).length,1);});
test('cannot mark ticket complete after order has left production',()=>{const r=place(withCart(),'T','2026-10-17T12:00:00Z');const id=workTickets(r.state)[0].id;const changed=updateStatus(r.state,'T','Delivered').state;assert.match(toggleTicket(changed,id).error,/not in the production queue/);});

test('storefront copy has no placeholder text',()=>{const html=shopPage(makeState(),{...shopUI,category:'All'});assert.ok(!/lorem ipsum/i.test(html));assert.ok(html.includes('Mautern'));});

import {placeRepairOrder,REPAIR_STATUSES} from '../src/domain/core.js';
import {repairsPage} from '../src/ui/pages/repairs.js';
const repairInput={...customer,itemName:'Broken garden hinge',qty:2,damage:'The hinge is bent and needs repair.'};
const repairDate='2026-10-18T15:00:00Z';
const repair=(state=makeState(),id='R-1')=>placeRepairOrder(state,repairInput,id,repairDate);
test('repair form allows free-form tool names, not catalog selection',()=>{const html=repairsPage();assert.ok(html.includes('name="itemName"'));assert.ok(!html.includes('name="productId"'));});
test('repair workflow includes arrival and assessment stages',()=>assert.deepEqual(REPAIR_STATUSES,['Placed','Awaiting Drop-off','Assessing','Processing','Delivering','Delivered']));
test('repair request creates separate order without changing shopping cart',()=>{const state=withCart('sword-short',2);const r=repair(state);assert.equal(r.order.type,'repair');assert.equal(r.order.items[0].name,'Broken garden hinge');assert.equal(r.order.items[0].qty,2);assert.equal(r.order.totalCents,null);assert.deepEqual(r.state.cart,state.cart);});
test('repair request has no catalog product restrictions',()=>assert.equal(placeRepairOrder(makeState(),{...repairInput,itemName:'Farm wagon latch'},'R-2',repairDate).order.items[0].name,'Farm wagon latch'));
test('repair requires damage description',()=>assert.ok(placeRepairOrder(makeState(),{...repairInput,damage:'bent'},'R-2',repairDate).error));
test('repair rejects fractional, zero and oversized quantities',()=>{for(const qty of [0,1.5,100])assert.ok(placeRepairOrder(makeState(),{...repairInput,qty},'R-2',repairDate).error);});
test('repair rejects invalid email and absent item title',()=>{assert.ok(placeRepairOrder(makeState(),{...repairInput,email:'bad'},'R-2',repairDate).error);assert.ok(placeRepairOrder(makeState(),{...repairInput,itemName:''},'R-2',repairDate).error);});
test('repair stores optional safe photo and rejects unsafe photo',()=>{const data='data:image/png;base64,AA==';assert.equal(placeRepairOrder(makeState(),repairInput,'R-2',repairDate,data).order.referenceImage,data);assert.ok(placeRepairOrder(makeState(),repairInput,'R-2',repairDate,'data:text/html;base64,AAAA').error);});
test('repair persists through state restore',()=>{const r=repair().state;assert.equal(restoreState(r,catalog).orders[0].description,repairInput.damage);assert.equal(restoreState(r,catalog).orders[0].items[0].name,repairInput.itemName);});
test('repair work ticket is absent until Processing',()=>{const base=repair().state;for(const status of REPAIR_STATUSES){const state=updateStatus(base,'R-1',status).state;assert.equal(workTickets(state).length,status==='Processing'?1:0,status);}});
test('repair ticket contains work description, but no customer contact data',()=>{const state=updateStatus(repair().state,'R-1','Processing').state;const ticket=workTickets(state)[0];assert.ok(ticket.notes.includes('hinge is bent'));assert.ok(!('customer' in ticket));assert.ok(!('address' in ticket));assert.ok(!('email' in ticket));});
test('completing repair ticket advances to Delivering',()=>{const processing=updateStatus(repair().state,'R-1','Processing').state;const ticket=workTickets(processing)[0];const completed=toggleTicket(processing,ticket.id);assert.equal(completed.state.orders[0].status,'Delivering');assert.equal(workTickets(completed.state).length,0);});
test('normal purchase statuses cannot enter repair-only stage',()=>{const normal=place(withCart(),'O-1',repairDate).state;assert.ok(updateStatus(normal,'O-1','Assessing').error);});
test('repair rejects unsupported status and returns correct statistics',()=>{const r=repair().state;assert.ok(updateStatus(r,'R-1','Rejected').error);assert.equal(orderStats(r).repair,1);});
test('moving completed repair back to Processing restores ticket',()=>{const processing=updateStatus(repair().state,'R-1','Processing').state;const finished=toggleTicket(processing,workTickets(processing)[0].id).state;const reopened=updateStatus(finished,'R-1','Processing').state;assert.equal(workTickets(reopened).length,1);});

test('custom commission has an assessment stage without altering ordinary and repair flows',()=>{
  assert.deepEqual(COMMISSION_STATUSES,['Placed','Assessing','Processing','Delivering','Delivered']);
  assert.deepEqual(statusesFor('standard'),STATUSES);
  assert.deepEqual(statusesFor('bulk'),STATUSES);
  assert.deepEqual(statusesFor('repair'),REPAIR_STATUSES);
});
test('custom commissions support Assessing and save it on restore',()=>{
  const r=placeDirectOrder(catalog,makeState(),'armor-commission','custom',{...customer,qty:1,description:'Tailored ceremonial armor for an ambassador'},'CA-1','2026-10-18T15:00:00Z');
  const assessment=updateStatus(r.state,'CA-1','Assessing');
  assert.equal(assessment.state.orders[0].status,'Assessing');
  assert.equal(restoreState(assessment.state,catalog).orders[0].status,'Assessing');
});
test('bulk and standard orders cannot enter commission Assessing',()=>{
  const standard=place(withCart(),'O-33','2026-10-18T15:00:00Z');
  const bulk=placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:15,title:'Steward'},'B-33','2026-10-18T15:00:00Z');
  assert.ok(updateStatus(standard.state,'O-33','Assessing').error);
  assert.ok(updateStatus(bulk.state,'B-33','Assessing').error);
});
test('commission status menu and timeline have five stages',async()=>{
  const {adminPage}=await import('../src/ui/pages/admin.js');
  const {orderCard}=await import('../src/ui/components/order-card.js');
  const r=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'An ornate ceremonial commission for a delegate'},'C-77','2026-10-18T15:00:00Z');
  const html=adminPage(r.state,{adminTab:'orders',adminFilter:'All'});
  assert.match(html,/value="Assessing"/);
  assert.equal((orderCard(r.order).match(/<li /g)||[]).length,5);
});
test('repair form uses separate cards for object details and contact details',async()=>{
  const html=repairsPage();
  assert.match(html,/>Ironware Repair</);
  assert.equal((html.match(/class="surface repair-panel"/g)||[]).length,2);
  assert.ok(html.indexOf('Contact details')>html.indexOf('</section>'));
  assert.match(html,/id="repair-order"/);
});

test('bulk refuses iron collection and has no reduction',()=>{const r=placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,recycle:'yes',qty:10,title:'Steward'},'B-2','2026-10-17T12:00:00Z');assert.match(r.error,/Recycling is unavailable/);const ok=placeDirectOrder(catalog,makeState(),first.id,'bulk',{...customer,qty:10,title:'Steward'},'B-2','2026-10-17T12:00:00Z');assert.equal(ok.order.totalCents,10*first.priceCents);assert.equal(ok.order.recycle,'no');});
test('new product is available as a normal catalog item after restoration',()=>{const added=addProduct(makeState(),{name:'Test Iron Hook',group:'Cooking Pot',price:'12.35',size:'Small',short:'Test item',details:'Test details',specs:'Iron\nHandmade'});assert.ok(!added.error);const restored=restoreState(added.state,catalog);assert.equal(restored.addedProducts.length,1);const all=[...catalog,...restored.addedProducts];const product=restored.addedProducts[0];assert.equal(product.priceCents,1235);assert.equal(product.specs.length,2);assert.ok(shopPage(restored,{...shopUI,category:'Cooking Pot'},[],all).includes('Test Iron Hook'));const cart=changeQuantity(all,restored,product.id,2).state;const order=placeCartOrder(all,cart,customer,'GF-500','2026-10-17T12:00:00Z');assert.equal(order.order.totalCents,2470);assert.equal(restoreState(order.state,catalog).orders.length,1);});
test('invalid new product categories, prices and image data are rejected',()=>{const data={name:'Test Hook',group:'Cooking Pot',price:'10'};assert.ok(addProduct(makeState(),{...data,group:'Commission'}).error);assert.ok(addProduct(makeState(),{...data,price:'0'}).error);assert.ok(addProduct(makeState(),data,'data:text/html;base64,AAA').error);});
test('recycling notice does not offer a fixed discount',()=>{const html=shopPage(makeState(),shopUI);assert.ok(!html.includes('25%'));});

test('setting a commission quote moves Placed and Assessing into Processing',()=>{
  for (const status of ['Placed','Assessing']) {
    const created=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'Commission reference notes for a sword'},'CQ-'+status,'2026-10-18T15:00:00Z').state;
    const prior=updateStatus(created,'CQ-'+status,status).state;
    assert.equal(workTickets(prior).length,0);
    const result=setQuote(prior,'CQ-'+status,'420.50');
    assert.equal(result.state.orders[0].status,'Processing');
    assert.equal(result.state.orders[0].totalCents,42050);
    assert.equal(workTickets(result.state).length,1);
    assert.equal(restoreState(result.state,catalog).orders[0].status,'Processing');
  }
});
test('changing a commission quote never rolls back Delivering or Delivered',()=>{
  const created=placeDirectOrder(catalog,makeState(),'armor-commission','custom',{...customer,qty:1,description:'Commission reference notes for armor'},'CQ-2','2026-10-18T15:00:00Z').state;
  for (const status of ['Processing','Delivering','Delivered']) {
    const prior=updateStatus(created,'CQ-2',status).state;
    const updated=setQuote(prior,'CQ-2','320');
    assert.equal(updated.state.orders[0].status,status);
    assert.equal(updated.state.orders[0].totalCents,32000);
  }
});
test('ordinary orders cannot be quoted; repair quoting retains repair stage',()=>{
  const normal=place(withCart(),'O-N','2026-10-18T15:00:00Z').state;
  assert.ok(setQuote(normal,'O-N','150').error);
  const repairOrder=placeRepairOrder(makeState(),{...repairInput,itemName:'Kitchen hinge'},'R-C','2026-10-18T15:00:00Z').state;
  const assessing=updateStatus(repairOrder,'R-C','Assessing').state;
  const updated=setQuote(assessing,'R-C','45.50');
  assert.equal(updated.state.orders[0].status,'Assessing');
  assert.equal(updated.state.orders[0].totalCents,4550);
});
test('invalid commission quote does not change status or price',()=>{
  const created=placeDirectOrder(catalog,makeState(),'sword-commission','custom',{...customer,qty:1,description:'Commission reference notes for a sword'},'CQ-3','2026-10-18T15:00:00Z').state;
  assert.ok(setQuote(created,'CQ-3','abc').error);
  assert.equal(created.orders[0].status,'Placed');
  assert.equal(created.orders[0].totalCents,null);
});
