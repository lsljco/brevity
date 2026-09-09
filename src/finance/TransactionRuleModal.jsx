import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_TRANSACTION_CATEGORIES, mergeCategoryOptions, transactionCategories } from './categoryData.js'
import { transactionMatchesRule } from './transactionRules.js'

const fieldStyle = {
  width:'100%', boxSizing:'border-box', padding:'11px 12px', borderRadius:10,
  border:'1px solid rgba(255,255,255,.14)', background:'rgba(255,255,255,.05)',
  color:'var(--white)', font:'inherit', fontSize:13,
}

function ruleDescription(rule, accounts) {
  const text = rule?.conditions?.originalStatement?.value || rule?.conditions?.merchantName?.value || 'matching text'
  const category = rule?.actions?.updateCategory?.value || 'Uncategorized'
  const accountId = rule?.conditions?.accounts?.on ? rule.conditions.accounts.value : ''
  const account = accounts.find(item => String(item.id) === String(accountId))
  return { text, category, account:account?.name || '' }
}

export default function TransactionRuleModal({ accounts = [], transactions = [], rules = [], today, onReviewCreate, onReviewDelete, onClose }) {
  const titleId = useId()
  const categoryListId = useId()
  const [matchText, setMatchText] = useState('')
  const [category, setCategory] = useState('')
  const [accountId, setAccountId] = useState('')
  const [preparing, setPreparing] = useState('')
  const [error, setError] = useState('')

  const categories = useMemo(
    () => mergeCategoryOptions(DEFAULT_TRANSACTION_CATEGORIES, transactions.map(transactionCategories), rules.map(rule => rule?.actions?.updateCategory?.value)),
    [rules, transactions],
  )
  const previewRule = useMemo(() => ({
    applyToExisting:true,
    conditions:{
      originalStatement:{ on:true, value:matchText },
      accounts:{ on:Boolean(accountId), value:accountId },
    },
    actions:{ updateCategory:{ on:true, value:category } },
  }), [accountId, category, matchText])
  const matches = useMemo(() => {
    if (!matchText.trim()) return []
    return transactions.filter(transaction => !transaction.pending && transactionMatchesRule(transaction, previewRule, accounts))
  }, [accounts, matchText, previewRule, transactions])

  const reviewCreate = async () => {
    if (!matchText.trim() || !category.trim()) {
      setError('Enter bank statement text and the category Brevity should apply.')
      return
    }
    setPreparing('create')
    setError('')
    try {
      const prepared = await onReviewCreate({ matchText:matchText.trim(), category:category.trim(), accountId, createdDate:today })
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
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} style={{width:'min(720px,100%)',maxHeight:'90vh',overflowY:'auto',padding:24,borderRadius:18,border:'1px solid rgba(197,164,109,.3)',background:'var(--card-bg,#181818)',boxShadow:'0 24px 80px rgba(0,0,0,.65)'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start'}}>
          <div>
            <p style={{margin:'0 0 5px',fontSize:10,textTransform:'uppercase',letterSpacing:'.14em',color:'var(--gold)'}}>Posted bank activity</p>
            <h2 id={titleId} style={{margin:0,fontSize:24,color:'var(--white)'}}>Categorization rules</h2>
            <p style={{margin:'8px 0 0',fontSize:12,lineHeight:1.5,color:'var(--muted)'}}>When a transaction posts, Brevity can match its original bank statement text and display your chosen category. Bank amounts, dates, and source descriptions stay unchanged.</p>
          </div>
          <button type="button" aria-label="Close categorization rules" onClick={onClose} style={{border:0,background:'transparent',color:'var(--muted)',fontSize:22,cursor:'pointer'}}>×</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12,marginTop:22}}>
          <label style={{fontSize:11,color:'var(--muted)'}}>Original statement contains
            <input autoFocus value={matchText} onChange={event => setMatchText(event.target.value)} placeholder="e.g. PUBLIX" style={{...fieldStyle,marginTop:6}} />
          </label>
          <label style={{fontSize:11,color:'var(--muted)'}}>Apply category
            <input list={categoryListId} value={category} onChange={event => setCategory(event.target.value)} placeholder="Type or select…" style={{...fieldStyle,marginTop:6}} />
            <datalist id={categoryListId}>{categories.map(option => <option key={option} value={option} />)}</datalist>
          </label>
          <label style={{fontSize:11,color:'var(--muted)'}}>Account scope
            <select value={accountId} onChange={event => setAccountId(event.target.value)} style={{...fieldStyle,marginTop:6}}>
              <option value="">All linked accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.mask ? ` ••••${account.mask}` : ''}</option>)}
            </select>
          </label>
        </div>

        <div style={{marginTop:14,padding:'12px 14px',borderRadius:11,background:'rgba(197,164,109,.07)',border:'1px solid rgba(197,164,109,.18)',fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
          <strong style={{color:'var(--soft-white)'}}>{matches.length} posted sample{matches.length === 1 ? '' : 's'} found.</strong>{' '}
          The preview checks current history so you can verify the wording. The rule starts {today} and will not rewrite earlier transactions.
          {matches.slice(0, 3).map(transaction => <div key={transaction.id} style={{marginTop:5,color:'var(--soft-white)'}}>• {transaction.originalStatement || transaction.original_description || transaction.name}</div>)}
        </div>

        {error ? <p role="alert" style={{margin:'12px 0 0',color:'var(--expense-color)',fontSize:12}}>{error}</p> : null}
        <button type="button" onClick={reviewCreate} disabled={Boolean(preparing)} style={{width:'100%',marginTop:14,padding:12,border:0,borderRadius:11,background:'var(--gold)',color:'#17130d',font:'inherit',fontSize:13,fontWeight:700,cursor:preparing?'wait':'pointer'}}>{preparing === 'create' ? 'Preparing review…' : 'Review new rule'}</button>

        <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid rgba(255,255,255,.08)'}}>
          <p style={{margin:'0 0 10px',fontSize:10,textTransform:'uppercase',letterSpacing:'.12em',color:'var(--muted)'}}>Active rules · {rules.length}</p>
          {rules.length === 0 ? <p style={{margin:0,fontSize:12,color:'var(--muted)'}}>No automatic categorization rules are active.</p> : rules.map(rule => {
            const description = ruleDescription(rule, accounts)
            return <div key={rule.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 0',borderTop:'1px solid rgba(255,255,255,.06)'}}>
              <div style={{minWidth:0}}><strong style={{display:'block',fontSize:13,color:'var(--soft-white)'}}>{description.text} → {description.category}</strong><span style={{fontSize:11,color:'var(--muted)'}}>{description.account || 'All linked accounts'} · posts on or after {rule.createdDate || 'rule creation'}</span></div>
              <button type="button" onClick={() => reviewDelete(rule)} disabled={Boolean(preparing)} style={{flexShrink:0,padding:'7px 10px',borderRadius:8,border:'1px solid rgba(232,150,122,.3)',background:'transparent',color:'var(--expense-color)',font:'inherit',fontSize:11,cursor:preparing?'wait':'pointer'}}>{preparing === rule.id ? 'Preparing…' : 'Review removal'}</button>
            </div>
          })}
        </div>
      </section>
    </div>,
    document.body,
  )
}
