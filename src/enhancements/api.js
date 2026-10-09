export async function enhancementRequest(input,signal){
 const response=await fetch('/.netlify/functions/enhancement-requests',{credentials:'include',signal,...(input?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}:{})})
 const payload=await response.json().catch(()=>({}));if(!response.ok)throw Error(payload.error||'Enhancements could not be loaded. Please retry.');return payload
}
export async function enhancementDetail(id){const response=await fetch(`/.netlify/functions/enhancement-requests?id=${encodeURIComponent(id)}`,{credentials:'include'});const data=await response.json();if(!response.ok)throw Error(data.error||'Request could not be loaded.');return data.row}
export async function prepareScreenshot(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12000000)throw Error('Choose a PNG, JPEG, or WebP image smaller than 12 MB.')
 const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
 const data=canvas.toDataURL('image/jpeg',.8);if(data.length>1500000)throw Error('This screenshot is too large. Crop it and try again.');return data
}
