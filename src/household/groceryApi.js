export async function groceryRequest(body){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000)
 try{
  const response=await fetch('/.netlify/functions/grocery-list',{credentials:'include',cache:'no-store',signal:controller.signal,...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})})
  const result=await response.json()
  if(!response.ok)throw Error(result.error||'Could not load the Grocery List.')
  return result
 }finally{clearTimeout(timeout)}
}
