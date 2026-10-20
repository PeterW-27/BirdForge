export const REPAIR_STATUSES=Object.freeze(['Placed','Awaiting Drop-off','Assessing','Processing','Delivering','Delivered']);
export const REPAIR_TICKET_STATUSES=Object.freeze(['Processing']);
export const MAX_REPAIR_QUANTITY=99;
// check repair order name, return null if ok. 
export function repairItemIssue(input){
  const item=String(input.itemName??'').trim();
  const damage=String(input.damage??'').trim();
  const qty=Number(input.qty);
  if(item.length<2||item.length>120)return 'Enter an item name (2–120 characters).';
  if(!Number.isSafeInteger(qty)||qty<1||qty>MAX_REPAIR_QUANTITY)return 'Quantity must be between 1 and 99.';
  if(damage.length<10||damage.length>1600)return 'Describe the repair needed (10–1600 characters).';
  return '';
}
