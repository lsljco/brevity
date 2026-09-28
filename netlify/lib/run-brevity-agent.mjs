import { agentTools } from './brevity-agent-tools.mjs'

export async function runBrevityAgent({prompt,model,apiKey,schema,fetcher=fetch,executeTool,maxSteps=4}) {
  const input=[{role:'user',content:prompt}]
  for(let step=0;step<maxSteps;step++){
    const response=await fetcher('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
      body:JSON.stringify({model,store:false,input,tools:agentTools,parallel_tool_calls:false,max_output_tokens:3500,text:{format:{type:'json_schema',name:'brevity_action_response',strict:true,schema}}}),
    })
    const payload=await response.json().catch(()=>({}))
    if(!response.ok)return {response,payload}
    const calls=(payload.output||[]).filter(item=>item.type==='function_call')
    if(!calls.length)return {response,payload}
    if(step===maxSteps-1)return {limitReached:true}
    input.push(...payload.output)
    for(const call of calls){
      let result
      try{result=await executeTool(call)}
      catch(error){result={error:error.message||'This Brevity tool is temporarily unavailable.'}}
      input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result).slice(0,250000)})
    }
  }
  return {limitReached:true}
}
