import {messageBlocks,safeSourceUrl} from './messageFormatting.js'
// Render a small Markdown subset as React nodes, never HTML or remote images.
function inline(text){
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<!!)\[[^\]\n]+\]\([^\s)]+\))/g).map((part,index)=>{
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{inline(part.slice(2,-2))}</strong>
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index}>{part.slice(1,-1)}</code>
    const link=part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/),href=link&&safeSourceUrl(link[2])
    return href?<a key={index} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>:part
  })
}
export default function MessageBody({content}){
  const blocks=messageBlocks(content)
  return <div className="brevity-assistant-message-body">{blocks.map((block,index)=>block.type==='p'
    ?<p key={index}>{inline(block.text)}</p>
    :block.type==='table'?<div key={index} className="brevity-assistant-table" role="region" aria-label="Comparison table" tabIndex={0}><table><thead><tr>{block.header.map((cell,i)=><th key={i} scope="col" style={{textAlign:block.align[i]}}>{inline(cell)}</th>)}</tr></thead><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((cell,i)=><td key={i} style={{textAlign:block.align[i]}}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>
    :block.type==='ol'?<ol key={index} start={block.start}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ol>
    :<ul key={index}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ul>)}</div>
}
