// Notifications only. Do not cache authenticated pages, API responses or assets.
self.addEventListener('push',event=>{
 let message={title:'Brevity',body:'Open Today to review your responsibilities.'}
 try{message={...message,...event.data.json()}}catch{}
 event.waitUntil(self.registration.showNotification(message.title,{body:message.body,icon:'/icons/icon-192x192.png',badge:'/icons/icon-192x192.png',tag:message.tag||'brevity-reminder',data:{url:'/?reminder=1#daily-rhythm'}}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 event.waitUntil(clients.openWindow(new URL('/?reminder=1#daily-rhythm',self.location.origin).href))
})
