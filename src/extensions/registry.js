const features=[];

// get features needed on the current page. 
export function registerFeature(feature) {
  if(!feature || !/^[-a-z0-9]{2,32}$/.test(feature.id) || typeof feature.title!=='string' || typeof feature.render!=='function') throw Error('Invalid extension');
  if(features.some(item=>item.id===feature.id)) throw Error('Duplicate extension ID');
  if(!['shop','admin'].includes(feature.placement)) throw Error('Invalid extension placement');
  features.push({...feature});
  return feature.id;
}

export function getFeature(id) {
  return features.find(item=>item.id===id) || null;
}

// find needed feature list.
export function featuresFor(placement) {
  return features.filter(item=>item.placement===placement);
}
