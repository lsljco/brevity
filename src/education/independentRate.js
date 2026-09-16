export function independentRate(responses=[]){if(!responses.length)return 0;return Number((responses.filter(r=>r.result==='independent').length/responses.length*100).toFixed(1))}
