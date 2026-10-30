import {useMemo,useState} from 'react'
import CategoryBudgetEditor from './CategoryBudgetEditor.jsx'
import {getHouseholdDateKey} from './financeTime.js'
import {mergeCategoryOptions} from './categoryData.js'
const defaultCategories=['Housing','Utilities','Transportation','Insurance','Health','Debt','Food','Household','Family','Subscriptions','Discretionary','Other']
export default function BudgetAssignment({row,scheduled=[],budget={},accounts=[],onReview}){
 const categories=useMemo(()=>mergeCategoryOptions(defaultCategories,
  scheduled.filter(tx=>tx.type==='expense').map(tx=>tx.cat||tx.category),
  Object.values(budget.lines||{}).filter(line=>line.direction==='expense').map(line=>line.category),
  Object.values(budget.categoryLimits||{}).map(e=>e.category),row.category),[scheduled,budget,row.category])
 const [adding,setAdding]=useState(false),[scope,setScope]=useState('once')
 const [choice,setChoice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function assign(){setBusy(true);setError('');try{
  if(!categories.includes(choice))throw Error('Select a category.')
  const operations=[{type:'transaction.categorize',targetId:row.id,description:`Categorize ${row.name} as ${choice}. The bank posting date determines the month.`,payload:{category:choice}}]
  if(scope!=='once')operations.push({type:'transaction.rule.create',description:`Categorize ${scope==='past'?'past and future':'future'} exact merchant matches as ${choice}.`,payload:{title:`Categorize ${row.name} as ${choice}`,matchText:row.name,matchField:'merchantName',matchMode:'exactly',category:choice,accountId:row.accountId||'',applyToExisting:scope==='past',createdDate:getHouseholdDateKey()}})
  await onReview({summary:`Assign ${row.name} to ${choice}${scope==='once'?'':' and save a merchant rule'}`,storageKey:'lslj_tx_overrides_v1',...(operations.length===1?{operation:operations[0]}:{operations})})
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <section aria-label="Assign category"><h3>Assign category</h3><p>Choose the category for this charge. Its bank date automatically determines the spending month. You do not need to select a dated budget entry.</p><label>Category<select value={choice} disabled={busy} onChange={e=>setChoice(e.target.value)}><option value="">Choose a category…</option>{categories.map(category=><option key={category} value={category}>{category}</option>)}</select></label><button type="button" onClick={()=>setAdding(!adding)}>Add category</button>{adding&&<CategoryBudgetEditor accounts={accounts} month={row.date.slice(0,7)} onReview={onReview} onCancel={()=>setAdding(false)}/>}<label>Apply category to<select value={scope} onChange={e=>setScope(e.target.value)}><option value="once">This transaction only</option><option value="future">This transaction and future merchant matches</option><option value="past">Matching past and future transactions</option></select></label><button type="button" disabled={busy||!choice} onClick={assign}>{busy?'Preparing…':'Review category assignment'}</button>{error&&<p role="alert">{error}</p>}</section>
}
