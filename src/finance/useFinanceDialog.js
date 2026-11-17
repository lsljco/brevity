import {useEffect,useRef} from 'react'
export function useFinanceDialog(open,onClose){
 const ref=useRef(null),close=useRef(onClose);close.current=onClose
 useEffect(()=>{if(!open)return;const previous=document.activeElement,dialog=ref.current;dialog?.querySelector('input,button,select')?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();close.current()}if(e.key==='Tab'){const nodes=[...(dialog?.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[])];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.isConnected&&previous.focus()}},[open]);return ref
}
