// Render a deliberately small Markdown subset as React text nodes. No HTML,
// remote images or executable links are accepted from assistant responses.
function inline(text){
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part,index)=>
    part.startsWith('**')&&part.endsWith('**')?<strong key={index}>{part.slice(2,-2)}</strong>:
    part.startsWith('`')&&part.endsWith('`')?<code key={index}>{part.slice(1,-1)}</code>:part)
}
export default function MessageBody({content}){
  const blocks=[]
  let list=null
  for(const line of String(content).split('\n')){
    if(!line.trim())continue
    const match=line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.*)$/)
    if(match){
      const type=match[2]?'ol':'ul'
      if(!list||list.type!==type){list={type,start:Number(match[2]||1),items:[]};blocks.push(list)}
      list.items.push(match[3])
    }else{list=null;blocks.push({type:'p',text:line.replace(/^#{1,6}\s+/,'')})}
  }
  return <div className="brevity-assistant-message-body">{blocks.map((block,index)=>block.type==='p'
    ?<p key={index}>{inline(block.text)}</p>
    :block.type==='ol'?<ol key={index} start={block.start}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ol>
    :<ul key={index}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ul>)}</div>
}
