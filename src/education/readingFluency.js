const WORD_RE=/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu

export function tokenizeReading(text=''){
  return String(text).toLowerCase().replace(/[’]/g,"'").match(WORD_RE)||[]
}

function alignPrefix(reference,spoken){
  const n=reference.length,m=spoken.length
  const dp=Array.from({length:n+1},()=>Array(m+1).fill(Infinity))
  const prev=Array.from({length:n+1},()=>Array(m+1).fill(null))
  dp[0][0]=0
  for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){
    const value=dp[i][j]
    if(!Number.isFinite(value))continue
    if(i<n&&j<m){
      const match=reference[i]===spoken[j]
      const cost=value+(match?0:1)
      if(cost<dp[i+1][j+1]){dp[i+1][j+1]=cost;prev[i+1][j+1]={i,j,type:match?'match':'substitution'}}
    }
    if(i<n&&value+1<dp[i+1][j]){dp[i+1][j]=value+1;prev[i+1][j]={i,j,type:'omission'}}
    if(j<m&&value+1<dp[i][j+1]){dp[i][j+1]=value+1;prev[i][j+1]={i,j,type:'insertion'}}
  }
  let bestI=0,best=Infinity
  for(let i=0;i<=n;i++){
    const cost=dp[i][m]
    if(cost<best||(cost===best&&i>bestI)){best=cost;bestI=i}
  }
  const operations=[]
  let i=bestI,j=m
  while(i||j){
    const step=prev[i][j]
    if(!step)break
    operations.push({type:step.type,reference:step.i<reference.length?reference[step.i]:null,spoken:step.j<spoken.length?spoken[step.j]:null,referenceIndex:step.i,spokenIndex:step.j})
    i=step.i;j=step.j
  }
  operations.reverse()
  return{operations,referenceWordsAssessed:bestI}
}

export function scoreReadingTranscript({referenceText='',transcript='',elapsedSeconds=60}={}){
  const reference=tokenizeReading(referenceText),spoken=tokenizeReading(transcript)
  const seconds=Math.max(1,Number(elapsedSeconds)||60)
  const {operations,referenceWordsAssessed}=alignPrefix(reference,spoken)
  const matches=operations.filter(op=>op.type==='match').length
  const substitutions=operations.filter(op=>op.type==='substitution')
  const omissions=operations.filter(op=>op.type==='omission')
  const insertions=operations.filter(op=>op.type==='insertion')
  const accuracy=referenceWordsAssessed?Math.round((matches/referenceWordsAssessed)*1000)/10:0
  const wcpm=Math.round((matches*60/seconds)*10)/10
  return{elapsedSeconds:seconds,spokenWords:spoken.length,referenceWordsAssessed,correctWords:matches,wcpm,accuracy,substitutions,omissions,insertions,errorCount:substitutions.length+omissions.length+insertions.length,operations}
}
