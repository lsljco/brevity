import {resolveCategory,storedCategoryCatalog} from './categoryCatalog.js'
import './TransactionRuleModal.css'
import RuleSuggestions from './RuleSuggestions.jsx'
import RuleCriteriaEditor from './RuleCriteriaEditor.jsx'
import VendorSelector from './VendorSelector.jsx'
import {useVendorDirectory} from './vendorApi.js'
import {normalizeRuleCriteria,describeRuleCriteria,criteriaForSavedRule} from './ruleCriteria.js'
import { useId, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_TRANSACTION_CATEGORIES, mergeCategoryOptions, transactionCategories } from './categoryData.js'
import { transactionMatchesRule } from './transactionRules.js'

const fieldStyle = {
  width:'100%', boxSizing:'border-box', padding:'11px 12px', borderRadius:10,
  border:'1px solid var(--glass-border)', background:'var(--slate-2)',
  color:'var(--white)', font:'inherit', fontSize:13,
}

function ruleDescription(rule, accounts, vendors) {
  const text = rule.criteria ? describeRuleCriteria(rule.criteria,accounts) : rule?.conditions?.originalStatement?.value || rule?.conditions?.merchantName?.value || 'matching text'
  const category = resolveCategory(rule?.actions?.updateCategory?.value || 'Uncategorized',storedCategoryCatalog())
  const accountId = rule?.conditions?.accounts?.on ? rule.conditions.accounts.value : ''
  const account = accounts.find(item => String(item.id) === String(accountId))
  const vendor=vendors.find(v=>v.id===rule.actions?.assignVendor?.value)?.name||''
  return { text, category, vendor, account:account?.name || '', applyToExisting:Boolean(rule?.applyToExisting) }
}

export default function TransactionRuleModal({ accounts = [], transactions = [], rules = [], overrides = {}, establishedCategories = [], planned = [], onReviewSuggestions, onReviewTransaction, today, initial = null, onReviewCreate, onReviewDelete, onClose }) {
  const editorRef=useRef(null)
  const [editingRule,setEditingRule]=useState(null)
  const [showSuggestions,setShowSuggestions]=useState(false)
  const [ruleTitle,setRuleTitle]=useState('')
  const [startDate,setStartDate]=useState(today)
  const titleId = useId()
  const categoryListId = useId()
  const [criteria,setCriteria]=useState([{field:initial?.matchField||'originalStatement',operator:initial?.matchMode||'contains',value:initial?.matchText||'',join:'and'}])
  const [vendorId,setVendorId]=useState('')
  const {directory}=useVendorDirectory()
  const [category, setCategory] = useState(initial?.category || '')
  const [accountId, setAccountId] = useState(initial?.accountId || '')
  const [applyToExisting, setApplyToExisting] = useState(true)
  const [preparing, setPreparing] = useState('')
  const [error, setError] = useState('')

  const categories = useMemo(
    () => mergeCategoryOptions(DEFAULT_TRANSACTION_CATEGORIES, transactions.map(transactionCategories), rules.map(rule => rule?.actions?.updateCategory?.value)),
    [rules, transactions],
  )
  const previewRule = useMemo(() => ({applyToExisting:true,criteria,conditions:{accounts:{on:Boolean(accountId),value:accountId}}}),[criteria,accountId])
  const matches = useMemo(() => transactions.filter(transaction => transactionMatchesRule(transaction,previewRule,accounts)),[accounts,previewRule,transactions])

  const editRule = rule => {
    try{
      const loaded=criteriaForSavedRule(rule)
      setCriteria(loaded);setEditingRule(rule);setRuleTitle(rule.name||'');setStartDate(rule.createdDate||today)
      setVendorId(rule.actions?.assignVendor?.on?rule.actions.assignVendor.value:'')
      setCategory(resolveCategory(rule.actions?.updateCategory?.value||'',storedCategoryCatalog()));setAccountId(rule.conditions?.accounts?.on?rule.conditions.accounts.value:'')
      setApplyToExisting(Boolean(rule.applyToExisting||!rule.createdDate));setError('')
      editorRef.current?.scrollTo({top:0})
    }catch(cause){setError(cause.message)}
  }
  const backToRules = () => {
    setEditingRule(null);setRuleTitle('');setStartDate(today);setVendorId('');setCategory(initial?.category||'');setAccountId(initial?.accountId||'');setApplyToExisting(true);setError('')
    setCriteria([{field:initial?.matchField||'originalStatement',operator:initial?.matchMode||'contains',value:initial?.matchText||'',join:'and'}])
    editorRef.current?.scrollTo({top:0})
  }
  const reviewCreate = async () => {
    let normalized
    try{normalized=normalizeRuleCriteria(criteria);if(editingRule&&!ruleTitle.trim())throw Error('Enter a rule name.');if(!category.trim())throw Error('Choose the category Brevity should apply.')}catch(cause){setError(cause.message);return}
    setPreparing('create')
    setError('')
    try {
      const prepared = await onReviewCreate({ ...(editingRule?{ruleId:editingRule.id,title:ruleTitle}:{}), criteria:normalized, vendorId, vendorName:directory?.vendors?.find(v=>v.id===vendorId)?.name||'', category:category.trim(), accountId, applyToExisting, createdDate:startDate })
      if (prepared !== false) onClose()
    } catch (cause) {
      setError(cause?.message || 'This rule could not be prepared for review.')
    } finally {
      setPreparing('')
    }
  }

  const reviewDelete = async rule => {
    setPreparing(rule.id)
    setError('')
    try {
      const prepared = await onReviewDelete(rule)
      if (prepared !== false) onClose()
    } catch (cause) {
      setError(cause?.message || 'This rule removal could not be prepared for review.')
    } finally {
      setPreparing('')
    }
  }

  return createPortal(
    <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }} style={{position:'fixed',inset:0,zIndex:9300,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(0,0,0,.75)'}}>
      <section ref={editorRef} className="transaction-rule-editor" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{boxSizing:'border-box',minWidth:0,overflowWrap:'anywhere',width:'min(720px,100%)',maxHeight:'90vh',overflowY:'auto',padding:24,borderRadius:18,border:'1px solid rgba(197,164,109,.3)',background:'var(--slate)',color:'var(--white)',boxShadow:'0 24px 80px rgba(0,0,0,.65)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start'}}>
          <div>
            <p style={{margin:'0 0 5px',fontSize:10,textTransform:'uppercase',letterSpacing:'.14em',color:'var(--gold)'}}>Posted bank activity</p>
            <h2 id={titleId} style={{margin:0,fontSize:24,color:'var(--white)'}}>{editingRule?'Edit rule':'Categorization rules'}</h2>
            <p style={{margin:'8px 0 0',fontSize:12,lineHeight:1.5,color:'var(--muted)'}}>When a transaction posts, Brevity can match your criteria and apply your chosen category and vendor or payer. Bank amounts, dates, and source descriptions stay unchanged.</p>
          </div>
          <button type="button" aria-label="Close categorization rules" onClick={onClose} style={{border:0,background:'transparent',color:'var(--muted)',fontSize:22,cursor:'pointer'}}>×</button>
        </div>

        {initial && !editingRule ? <div role="status" style={{marginTop:18,padding:'10px 12px',borderRadius:10,background:'rgba(197,164,109,.08)',border:'1px solid rgba(197,164,109,.2)',fontSize:11,lineHeight:1.5,color:'var(--muted)'}}>Started from <strong style={{color:'var(--soft-white)'}}>{initial.matchText}</strong>. Adjust the rule below, then return to the transaction editor to review the individual category change.</div> : null}

        {editingRule&&<div style={{display:'grid',gap:12,marginTop:16}}>
          <button type="button" className="rule-back" disabled={Boolean(preparing)} onClick={backToRules}>Back to rules</button>
          <label>Rule name<input style={fieldStyle} value={ruleTitle} onChange={event=>setRuleTitle(event.target.value)} maxLength={300}/></label>
          <label>Rule start date<input type="date" style={fieldStyle} value={startDate} onChange={event=>setStartDate(event.target.value)}/></label>
          <small>Changes keep this rule’s identity and priority. The start date applies when past matches are not included.</small>
        </div>}

        {!editingRule&&onReviewSuggestions&&<div style={{marginTop:18}}><button type="button" className="rule-back" onClick={()=>setShowSuggestions(v=>!v)}>{showSuggestions?'Hide suggested changes':'Find suggested categories and vendors'}</button>
          {showSuggestions&&<RuleSuggestions planned={planned} transactions={transactions} rules={rules} overrides={overrides} establishedCategories={establishedCategories} accounts={accounts} directory={directory} onReview={onReviewSuggestions} onClose={onClose} onReviewTransaction={tx=>{onClose();onReviewTransaction?.(tx)}}/>}
        </div>}

        <RuleCriteriaEditor criteria={criteria} onChange={setCriteria} accounts={accounts} fieldStyle={fieldStyle}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:12,marginTop:22}}>
          <label style={{fontSize:11,color:'var(--muted)'}}>Apply category
            <input list={categoryListId} value={category} onChange={event => setCategory(event.target.value)} placeholder="Type or select…" style={{...fieldStyle,marginTop:6}} />
            <datalist id={categoryListId}>{categories.map(option => <option key={option} value={option} />)}</datalist>
          </label>
          <label style={{fontSize:11,color:'var(--muted)'}}>Account scope
            <select value={accountId} onChange={event => setAccountId(event.target.value)} style={{...fieldStyle,marginTop:6}}>
              <option value="">All bank accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.mask ? ` ••••${account.mask}` : ''}</option>)}
            </select>
          </label>
        </div>

        <div style={{marginTop:16}}><VendorSelector value={vendorId} onChange={setVendorId} label="Rule vendor or payer" fieldLabel="Vendor / payer"/></div>

        <label style={{display:'flex',alignItems:'flex-start',gap:10,marginTop:14,padding:'12px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.1)',color:'var(--soft-white)',fontSize:12,cursor:'pointer'}}>
          <input type="checkbox" checked={applyToExisting} onChange={event => setApplyToExisting(event.target.checked)} style={{width:18,height:18,margin:0,accentColor:'var(--gold)'}} />
          <span><strong>Apply this rule to all past matching transactions</strong><small style={{display:'block',marginTop:3,color:'var(--muted)',lineHeight:1.4}}>If selected, existing posted transactions that match these criteria will display the new category and selected vendor or payer after approval. Pending bank activity remains unchanged.</small></span>
        </label>

        <div style={{marginTop:14,padding:'12px 14px',borderRadius:11,background:'rgba(197,164,109,.07)',border:'1px solid rgba(197,164,109,.18)',fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
          <strong style={{color:'var(--soft-white)'}}>{matches.length} posted sample{matches.length === 1 ? '' : 's'} found.</strong>{' '}
          {applyToExisting ? `These ${matches.length} existing posted matches will be updated after approval.` : `The preview checks current history only; these past matches will not be changed. The rule starts ${startDate}.`}
          {matches.slice(0, 3).map(transaction => <div key={transaction.id} style={{marginTop:5,color:'var(--soft-white)'}}>• {transaction.originalStatement || transaction.original_description || transaction.name}</div>)}
        </div>

        {error ? <p role="alert" style={{margin:'12px 0 0',color:'var(--expense-color)',fontSize:12}}>{error}</p> : null}
        <button type="button" onClick={reviewCreate} disabled={Boolean(preparing)} style={{width:'100%',marginTop:14,padding:12,border:0,borderRadius:11,background:'var(--gold)',color:'var(--black)',font:'inherit',fontSize:13,fontWeight:700,cursor:preparing?'wait':'pointer'}}>{preparing === 'create' ? 'Preparing review…' : editingRule?'Review rule changes':'Review new rule'}</button>
        {editingRule&&<button type="button" className="rule-delete" disabled={Boolean(preparing)} onClick={()=>reviewDelete(editingRule)}>Delete rule</button>}

        {!editingRule&&<div style={{marginTop:24,paddingTop:18,borderTop:'1px solid rgba(255,255,255,.08)'}}>
          <p style={{margin:'0 0 10px',fontSize:10,textTransform:'uppercase',letterSpacing:'.12em',color:'var(--muted)'}}>Active rules · {rules.length}</p>
          {rules.length === 0 ? <p style={{margin:0,fontSize:12,color:'var(--muted)'}}>No automatic categorization rules are active.</p> : rules.map(rule => {
            const description = ruleDescription(rule, accounts, directory?.vendors||[])
            return <div key={rule.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 0',borderTop:'1px solid rgba(255,255,255,.06)'}}>
              <div style={{minWidth:0}}><strong style={{display:'block',fontSize:13,color:'var(--soft-white)'}}>{rule.name||description.text}</strong><span style={{display:'block',fontSize:12,color:'var(--soft-white)'}}>{description.text} → {description.category}{description.vendor ? ` · ${description.vendor}` : ''}</span><span style={{fontSize:11,color:'var(--muted)'}}>{description.account || 'All bank accounts'} · {description.applyToExisting ? 'includes past posted matches' : `posts on or after ${rule.createdDate || 'rule creation'}`}</span></div>
              <button type="button" onClick={() => editRule(rule)} disabled={Boolean(preparing)} style={{flexShrink:0,padding:'7px 10px',borderRadius:8,border:'1px solid rgba(232,150,122,.3)',background:'transparent',color:'var(--gold)',font:'inherit',fontSize:11,cursor:preparing?'wait':'pointer'}}>Edit rule</button>
            </div>
          })}
        </div>}
      </section>
    </div>,
    document.body,
  )
}
