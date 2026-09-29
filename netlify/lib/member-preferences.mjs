export const PREFERENCE_CATEGORIES=['food','communication','routine','accessibility']
export function normalizeMemberPreference(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['category','value'].includes(key)))throw Error('A preference requires only category and value.')
 if(!PREFERENCE_CATEGORIES.includes(payload.category)||typeof payload.value!=='string'||payload.value.length>2000)throw Error('Choose a supported preference category and text of at most 2000 characters.')
 return {category:payload.category,value:payload.value.trim()}
}
export function applyMemberPreference(value,operation){
 const payload=normalizeMemberPreference(operation.payload),preferences={...(value?.preferences||{})}
 if(payload.value)preferences[payload.category]=payload.value
 else delete preferences[payload.category]
 return {...(value||{}),member:operation.targetId,preferences}
}
