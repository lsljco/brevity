import {execFileSync} from 'node:child_process'
const allowed=value=>/^(src|netlify\/(lib|functions))\/[a-zA-Z0-9_/-]+\.(js|jsx|mjs|cjs|css|json|test\.js)$/.test(value)&&!value.split('/').some(part=>part.startsWith('.'))&&!/household-auth\.|(?:^|\/)package(?:-lock)?\.json$/.test(value)
const files=execFileSync('git',['diff','--cached','--name-only','-z']).toString().split('\0').filter(Boolean)
if(!files.length||files.length>20||files.some(file=>!allowed(file)))throw Error('Prototype modifies excluded paths or exceeds the file limit.')
const entries=execFileSync('git',['diff','--cached','--raw']).toString().trim().split('\n')
if(entries.some(line=>!/^:100644 100644 |^:000000 100644 |^:100644 000000 /.test(line)))throw Error('Only ordinary source files are allowed.')
if(execFileSync('git',['diff','--cached','--binary']).length>1000000)throw Error('Prototype patch is too large.')
console.info('Prototype patch stays within the approved source scope.')
