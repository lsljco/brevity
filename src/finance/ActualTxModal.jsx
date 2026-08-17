import { useId, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_TRANSACTION_CATEGORIES, loadStoredCategoryOptions, mergeCategoryOptions, saveStoredCategoryOptions, transactionCategories } from './categoryData.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const FAMILY = ['Larry', 'Lorenzo', 'Terica', 'Nyla', 'Javin']

const CAT_ICONS = {
  'Groceries': 'ti-shopping-cart', 'Food & Drink': 'ti-salad', 'Restaurants': 'ti-tools-kitchen-2',
  'Housing': 'ti-home', 'Mortgage': 'ti-home', 'Rent': 'ti-home',
  'Utilities': 'ti-bolt', 'Electric': 'ti-bolt', 'Phone': 'ti-phone',
  'Transport': 'ti-car', 'Gas/Fuel': 'ti-gas-station', 'Rideshare': 'ti-car',
  'Insurance': 'ti-shield', 'Healthcare': 'ti-heart-rate-monitor',
  'Entertainment': 'ti-device-tv', 'Streaming': 'ti-device-tv',
  'Education': 'ti-school', 'Savings': 'ti-piggy-bank', 'Investment': 'ti-trending-up',
  'Shopping': 'ti-shopping-bag', 'Travel': 'ti-plane', 'Transfer': 'ti-arrows-left-right',
  'Income': 'ti-coin', 'Fees': 'ti-receipt', 'Other': 'ti-dots',
}

function catIcon(cat) { return CAT_ICONS[cat] || 'ti-tag' }

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#F7F6F2', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#888884', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }
const sectionStyle = { display: 'flex', flexDirection: 'column', gap: 4 }

function CategoryInput({ value, onChange, onBlur, options, ariaLabel = 'Category', placeholder = 'Type or select a category…', style }) {
  const listId = useId()
  const categoryOptions = mergeCategoryOptions(DEFAULT_TRANSACTION_CATEGORIES, options, value)

  return (
    <>
      <input
        aria-label={ariaLabel}
        list={listId}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        style={style}
      />
      <datalist id={listId}>
        {categoryOptions.map(category => <option key={category} value={category} />)}
      </datalist>
    </>
  )
}

// ── Rule Modal ────────────────────────────────────────────────────────────────
function RuleModal({ initial, accounts, allTxNames, categoryOptions, txCount, onSave, onClose }) {
  const [tab, setTab] = useState('settings')
  const [cond, setCond] = useState({
    originalStatement: { on: false, value: initial?.originalStatement || '' },
    merchantName:      { on: true,  match: 'exactly', value: initial?.merchant || '' },
    amount:            { on: false, min: '', max: '' },
    categories:        { on: false, value: '' },
    accounts:          { on: false, value: '' },
  })
  const [act, setAct] = useState({
    renameMerchant:    { on: false, value: '' },
    updateCategory:    { on: true,  value: initial?.category || '' },
    addTags:           { on: false, value: '' },
    hideTransaction:   { on: false },
    reviewStatus:      { on: false },
    linkGoal:          { on: false, value: '' },
  })
  const [splits, setSplits] = useState([])

  const setCond1 = (key, patch) => setCond(c => ({ ...c, [key]: { ...c[key], ...patch } }))
  const setAct1  = (key, patch) => setAct(a => ({ ...a, [key]: { ...a[key], ...patch } }))

  const matchCount = txCount ?? 0

  const handleSave = () => {
    onSave({ id: `rule_${Date.now()}`, conditions: cond, actions: act, splits })
    onClose()
  }

  const Row = ({ label, k, src, set1, children }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#F7F6F2' }}>{label}</span>
          {/* toggle */}
          <button onClick={() => set1(k, { on: !src[k].on })} style={{
            width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
            background: src[k].on ? '#FF5500' : 'rgba(255,255,255,0.12)',
            position: 'relative', transition: 'background .2s', flexShrink: 0,
          }}>
            <span style={{
              position: 'absolute', top: 3, left: src[k].on ? 20 : 3,
              width: 16, height: 16, borderRadius: 8, background: 'white',
              transition: 'left .2s',
            }} />
          </button>
        </div>
        {src[k].on && children}
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 9300,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#FFFFFF', borderRadius: 16, width: '92%', maxWidth: 820,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px 0', borderBottom: '1px solid #eee' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#111' }}>New rule</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#666', lineHeight: 1 }}>✕</button>
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid #eee' }}>
          {[['settings','Settings'], ['preview',`Preview changes ${matchCount}`]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} style={{
              padding: '12px 16px', fontSize: 14, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
              color: tab === v ? '#FF5500' : '#666',
              borderBottom: tab === v ? '2px solid #FF5500' : '2px solid transparent',
            }}>{l}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'settings' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Left: Conditions */}
              <div style={{ padding: '16px 24px', borderRight: '1px solid #eee' }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#999', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  If transaction matches criteria...
                </p>

                <Row label="Original statement" k="originalStatement" src={cond} set1={setCond1}>
                  <input value={cond.originalStatement.value} onChange={e => setCond1('originalStatement', { value: e.target.value })}
                    placeholder="Contains text..." style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </Row>

                <Row label="Merchant name" k="merchantName" src={cond} set1={setCond1}>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <select value={cond.merchantName.match} onChange={e => setCond1('merchantName', { match: e.target.value })}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: 'white', cursor: 'pointer' }}>
                      <option value="exactly">Exactly matches</option>
                      <option value="contains">Contains</option>
                      <option value="starts">Starts with</option>
                    </select>
                    <input value={cond.merchantName.value} onChange={e => setCond1('merchantName', { value: e.target.value })}
                      list="merchant-list" placeholder="Merchant name..."
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13 }} />
                    <datalist id="merchant-list">
                      {(allTxNames || []).map(n => <option key={n} value={n} />)}
                    </datalist>
                  </div>
                </Row>

                <Row label="Amount" k="amount" src={cond} set1={setCond1}>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input type="number" value={cond.amount.min} onChange={e => setCond1('amount', { min: e.target.value })}
                      placeholder="Min $" style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13 }} />
                    <input type="number" value={cond.amount.max} onChange={e => setCond1('amount', { max: e.target.value })}
                      placeholder="Max $" style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13 }} />
                  </div>
                </Row>

                <Row label="Categories" k="categories" src={cond} set1={setCond1}>
                  <CategoryInput value={cond.categories.value} onChange={e => setCond1('categories', { value: e.target.value })}
                    options={categoryOptions} ariaLabel="Rule matching category"
                    style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: 'white', boxSizing: 'border-box' }} />
                </Row>

                <Row label="Accounts" k="accounts" src={cond} set1={setCond1}>
                  <select value={cond.accounts.value} onChange={e => setCond1('accounts', { value: e.target.value })}
                    style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: 'white', cursor: 'pointer' }}>
                    <option value="">Select account...</option>
                    {(accounts || []).map(a => (
                      <option key={a.id || a.accountId} value={a.id || a.accountId}>
                        {a.name}{a.mask ? ` (...${a.mask})` : ''}
                      </option>
                    ))}
                  </select>
                </Row>
              </div>

              {/* Right: Actions */}
              <div style={{ padding: '16px 24px' }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#999', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                  Then apply these updates...
                </p>

                <Row label="Rename merchant" k="renameMerchant" src={act} set1={setAct1}>
                  <input value={act.renameMerchant.value} onChange={e => setAct1('renameMerchant', { value: e.target.value })}
                    placeholder="New merchant name..." style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </Row>

                <Row label="Update category" k="updateCategory" src={act} set1={setAct1}>
                  <CategoryInput value={act.updateCategory.value} onChange={e => setAct1('updateCategory', { value: e.target.value })}
                    options={categoryOptions} ariaLabel="Rule update category"
                    style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: 'white', boxSizing: 'border-box' }} />
                </Row>

                <Row label="Add tags" k="addTags" src={act} set1={setAct1}>
                  <input value={act.addTags.value} onChange={e => setAct1('addTags', { value: e.target.value })}
                    placeholder="Tag name..." style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </Row>

                <Row label="Hide transaction" k="hideTransaction" src={act} set1={setAct1}>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#999' }}>Matching transactions will be hidden from views.</p>
                </Row>

                <Row label="Review status" k="reviewStatus" src={act} set1={setAct1}>
                  <select onChange={e => setAct1('reviewStatus', { value: e.target.value })}
                    style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, background: 'white', cursor: 'pointer' }}>
                    <option value="">Select reviewer...</option>
                    {FAMILY.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Row>

                <Row label="Link to goal" k="linkGoal" src={act} set1={setAct1}>
                  <input value={act.linkGoal.value} onChange={e => setAct1('linkGoal', { value: e.target.value })}
                    placeholder="Goal name..." style={{ marginTop: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </Row>

                {/* Split transaction */}
                <div style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
                  <button onClick={() => setSplits([...splits, { cat: '', amount: '' }])}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                      fontSize: 13, color: '#333', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Split transaction
                    <span style={{ fontSize: 16, color: '#999' }}>›</span>
                  </button>
                  {splits.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <CategoryInput value={s.cat} onChange={e => setSplits(sp => sp.map((x,j)=> j===i ? {...x,cat:e.target.value} : x))}
                        options={categoryOptions} ariaLabel={`Rule split ${i + 1} category`}
                        placeholder="Type category…"
                        style={{ flex: 2, minWidth: 0, padding: '6px 8px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13 }} />
                      <input type="number" value={s.amount} placeholder="$0.00"
                        onChange={e => setSplits(sp => sp.map((x,j)=> j===i ? {...x,amount:e.target.value} : x))}
                        style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13 }} />
                      <button onClick={() => setSplits(sp => sp.filter((_,j)=>j!==i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 16 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === 'preview' && (
            <div style={{ padding: 24, color: '#555', fontSize: 14 }}>
              <p>Preview of transactions that would be affected by this rule.</p>
              <p style={{ color: '#999' }}>{matchCount} matching transaction{matchCount !== 1 ? 's' : ''} found.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 24px', borderTop: '1px solid #eee', background: '#fafafa' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 16, height: 16 }} />
            Update existing transactions
          </label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#999' }}>{matchCount} matching transactions</span>
            <button onClick={handleSave} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none', background: '#FF5500', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Category Toast ────────────────────────────────────────────────────────────
function CategoryToast({ category, merchant, originalStatement, onCreateRule, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1E1E1E', borderRadius: 12, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 20,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 9200,
      border: '1px solid rgba(255,255,255,0.12)', minWidth: 320, maxWidth: 480,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <i className={`ti ${catIcon(category)}`} style={{ fontSize: 16, color: '#ccc' }} aria-hidden="true" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#F7F6F2' }}>Updated to {category}</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#888884' }}>
          Create a rule to do this automatically in the future.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <button onClick={onCreateRule} style={{
          padding: '6px 14px', borderRadius: 7, border: 'none', background: 'none',
          color: '#C5A46D', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>CREATE RULE</button>
        <button onClick={onDismiss} style={{
          padding: '6px 14px', borderRadius: 7, border: 'none', background: 'none',
          color: '#888884', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '.06em', textTransform: 'uppercase',
        }}>DISMISS</button>
      </div>
    </div>
  )
}

// ── Main ActualTxModal ────────────────────────────────────────────────────────
export default function ActualTxModal({ tx, accounts, allTxNames, goals = [], txRules = [], onSave, onDelete, onSaveRule, onMakeRecurring, onClose }) {
  const [form, setForm] = useState({
    name:              tx.name || '',
    amount:            String(Math.abs(tx.amount || 0)),
    date:              tx.date || '',
    category:          tx.category || '',
    originalStatement: tx.originalStatement || tx.name || '',
    notes:             tx.notes || '',
    needsReview:       tx.needsReview || '',
    goal:              tx.goal || '',
    splits:            tx.splits || [],
  })
  const [attachments, setAttachments]         = useState(tx.attachments || [])
  const [catToast, setCatToast]               = useState(null)   // {category, merchant}
  const [showRuleModal, setShowRuleModal]      = useState(false)
  const [showSplits, setShowSplits]           = useState((tx.splits?.length || 0) > 0)
  const [storedCategories, setStoredCategories] = useState(() => loadStoredCategoryOptions(localStorage))
  const fileRef = useRef()
  const committedCategoryRef = useRef(form.category)
  const categoryOptions = mergeCategoryOptions(DEFAULT_TRANSACTION_CATEGORIES, storedCategories, transactionCategories(tx))

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const rememberCategories = (...transactions) => {
    const next = mergeCategoryOptions(storedCategories, transactions.map(transactionCategories))
    if (saveStoredCategoryOptions(localStorage, next)) setStoredCategories(next)
  }

  const commitCategory = (rawCategory) => {
    const newCat = rawCategory.trim()
    const old = committedCategoryRef.current
    set('category', newCat)
    committedCategoryRef.current = newCat
    if (newCat !== old && newCat) {
      setCatToast({ category: newCat, merchant: form.name, originalStatement: form.originalStatement })
    }
  }

  const handleSave = () => {
    const updated = {
      ...tx,
      ...form,
      category: form.category.trim(),
      splits: form.splits.map(split => ({ ...split, cat: (split.cat || split.category || '').trim() })),
      amount: parseFloat(form.amount) * (tx.amount < 0 ? -1 : 1),
      attachments,
    }
    rememberCategories(updated)
    onSave(updated)
    onClose()
  }

  const handleDelete = () => {
    if (window.confirm('Remove this transaction from your records?')) {
      onDelete(tx.id)
      onClose()
    }
  }

  const handleFile = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setAttachments(a => [...a, { name: file.name, data: ev.target.result }])
      reader.readAsDataURL(file)
    })
  }

  const addSplit = () => {
    setShowSplits(true)
    set('splits', [...form.splits, { cat: form.category, amount: '' }])
  }

  // Find local account for this Plaid transaction
  const localAcct = accounts?.find(a => a.plaidAccountId === tx.accountId)

  // Count how many existing transactions would match a rule for this merchant
  const matchCount = (allTxNames || []).filter(n =>
    n.toLowerCase() === form.name.toLowerCase()
  ).length

  const isIncome = tx.amount < 0

  return createPortal(
    <>
      {/* Overlay — portaled to document.body to escape any parent stacking context */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 9100,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--card-bg, #1a1a1a)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18, width: '92%', maxWidth: 440, maxHeight: '92vh',
          overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header row: close */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px 0' }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22, lineHeight: 1 }}>✕</button>
          </div>

          {/* Amount + account */}
          <div style={{ padding: '0 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 2px', fontSize: 26, fontWeight: 700,
                  color: isIncome ? '#7DCBA4' : '#F7F6F2' }}>
                  {isIncome ? '+' : ''}{parseFloat(form.amount) > 0 ? `$${parseFloat(form.amount).toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}` : '$0.00'}
                </p>
                {localAcct && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <i className="ti ti-building-bank" style={{ fontSize: 13, color: '#888884' }} aria-hidden="true" />
                    <span style={{ fontSize: 12, color: '#888884' }}>
                      {localAcct.institution || localAcct.name}
                      {localAcct.mask ? ` (...${localAcct.mask})` : ''}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: tx.pending ? 'rgba(197,164,109,0.15)' : 'rgba(100,140,220,0.15)',
                  color: tx.pending ? '#C5A46D' : '#90AADE', fontWeight: 600 }}>
                  {tx.pending ? 'Pending' : 'Posted'}
                </span>
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Name */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Name</label>
              <input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                list="vendor-list"
                style={inputStyle}
                placeholder="Merchant / payee name"
              />
              <datalist id="vendor-list">
                {(allTxNames || []).map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Original Statement */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Original Statement</label>
              <textarea
                value={form.originalStatement}
                onChange={e => set('originalStatement', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Bank transaction description"
              />
            </div>

            {/* Date */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                style={inputStyle} />
            </div>

            {/* Category */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Category</label>
              <div style={{ position: 'relative' }}>
                {form.category && (
                  <i className={`ti ${catIcon(form.category)}`} style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 15, color: '#888884', pointerEvents: 'none',
                  }} aria-hidden="true" />
                )}
                <CategoryInput value={form.category} onChange={e => set('category', e.target.value)}
                  onBlur={e => commitCategory(e.target.value)} options={categoryOptions}
                  ariaLabel="Transaction category"
                  style={{ ...inputStyle, paddingLeft: form.category ? 34 : 12 }} />
              </div>
              <span style={{ fontSize: 10, color: '#888884' }}>Type a new category or choose a saved one.</span>
            </div>

            {/* Amount (editable) */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Amount</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#888884', fontSize: 13, pointerEvents: 'none' }}>$</span>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 24 }} />
              </div>
            </div>

            {/* Goal */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Goal</label>
              <select value={form.goal} onChange={e => set('goal', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Select goal...</option>
                {goals.map(g => <option key={g.id || g} value={g.id || g}>{g.name || g}</option>)}
              </select>
            </div>

            {/* Split Transaction */}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={labelStyle}>Split Transaction</label>
                <button onClick={addSplit} style={{ fontSize: 12, color: '#90AADE', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  + Add split
                </button>
              </div>
              {showSplits && form.splits.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                  {form.splits.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <CategoryInput value={s.cat || s.category || ''} onChange={e => set('splits', form.splits.map((x,j)=> j===i?{...x,cat:e.target.value}:x))}
                        options={categoryOptions} ariaLabel={`Split ${i + 1} category`} placeholder="Type category…"
                        style={{ flex: 2, minWidth: 0, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F7F6F2', fontSize: 13 }} />
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#888884', fontSize: 12 }}>$</span>
                        <input type="number" step="0.01" value={s.amount} placeholder="0.00"
                          onChange={e => set('splits', form.splits.map((x,j)=> j===i?{...x,amount:e.target.value}:x))}
                          style={{ width: '100%', padding: '6px 8px 6px 20px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F7F6F2', fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                      <button onClick={() => set('splits', form.splits.filter((_,j)=>j!==i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4785A', fontSize: 16, padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                placeholder="Add notes to this transaction..."
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            {/* Needs Review By */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Needs Review By</label>
              <select value={form.needsReview} onChange={e => set('needsReview', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Assign to...</option>
                {FAMILY.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            {/* Attachments */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Attachments</label>
              <div style={{ border: '1px dashed rgba(255,255,255,0.18)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleFile} />
                {attachments.length === 0 ? (
                  <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888884', fontFamily: 'inherit', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, margin: '0 auto' }}>
                    <i className="ti ti-paperclip" style={{ fontSize: 16 }} aria-hidden="true" />
                    Add an attachment
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {attachments.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                        <span style={{ fontSize: 12, color: '#C5A46D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.name}</span>
                        <button onClick={() => setAttachments(ats => ats.filter((_,j)=>j!==i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4785A', fontSize: 14, marginLeft: 8 }}>✕</button>
                      </div>
                    ))}
                    <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, color: '#888884', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                      + Add another
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Footer actions */}
          <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSave} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: '#C5A46D', color: '#1a1a1a', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Save Changes</button>
              {onMakeRecurring && (
                <button onClick={() => { onMakeRecurring(form); onClose() }} style={{
                  flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(197,164,109,0.12)', border: '1px solid rgba(197,164,109,0.3)',
                  color: '#C5A46D', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                }}>Make Recurring</button>
              )}
            </div>
            <button onClick={handleDelete} style={{
              width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(196,120,90,0.3)',
              background: 'none', color: '#C4785A', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Delete Transaction</button>
          </div>
        </div>
      </div>

      {/* Category toast */}
      {catToast && (
        <CategoryToast
          category={catToast.category}
          merchant={catToast.merchant}
          originalStatement={catToast.originalStatement}
          onCreateRule={() => { setCatToast(null); setShowRuleModal(true) }}
          onDismiss={() => setCatToast(null)}
        />
      )}

      {/* Rule modal */}
      {showRuleModal && (
        <RuleModal
          initial={{ merchant: form.name, category: form.category, originalStatement: form.originalStatement }}
          accounts={accounts}
          allTxNames={allTxNames}
          categoryOptions={categoryOptions}
          txCount={matchCount}
          onSave={rule => {
            rememberCategories({ category: rule.actions?.updateCategory?.value, splits: rule.splits })
            onSaveRule?.(rule)
          }}
          onClose={() => setShowRuleModal(false)}
        />
      )}
    </>,
    document.body
  )
}
