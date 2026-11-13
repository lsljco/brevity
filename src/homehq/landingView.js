// Notification links retain their explicit destination; ordinary entry opens Home.
export function landingView(search='') {
 const params=new URLSearchParams(search)
 if(params.has('enhancements'))return 'enhancements'
 if(['briefing','priorities','checkin'].some(key=>params.has(key))||params.get('view')==='today')return 'today'
 return 'home'
}
