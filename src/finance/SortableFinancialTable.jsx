import {Children, Fragment, cloneElement, isValidElement, useState} from 'react'
import {sortFinancialSections} from './financialSort.js'
import './SortableFinancialTable.css'
const flatten = children => Children.toArray(children).flatMap(child => isValidElement(child) && child.type === Fragment ? flatten(child.props.children) : [child])
function textOf(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!isValidElement(node)) return String(node)
  if (node.props['data-sort-value'] != null) return node.props['data-sort-value']
  if (['input','select','textarea'].includes(node.type)) return node.props.value ?? node.props.defaultValue ?? ''
  if (node.type === 'button' && node.props['aria-label'] && !node.props.children) return ''
  return textOf(node.props.children)
}
const cells = row => flatten(row?.props?.children).filter(isValidElement)
const pinned = row => {
  const columns = cells(row)
  return !isValidElement(row) || row.type !== 'tr' || columns.some(cell => Number(cell.props.colSpan) > 1)
    || /^\s*(?:grand total|total|subtotal)\b/i.test(textOf(columns[0]))
    || /milestone|divider|all-paid/.test(row.props.className || '')
}
export default function SortableFinancialTable({children, onSortChange, ...props}) {
  const [sort,setSort] = useState(null)
  const sections = flatten(children)
  const head = sections.find(child => child?.type === 'thead')
  const headers = cells(flatten(head?.props.children).find(child=>child?.type==='tr'))
  const label = index => textOf(headers[index]).trim()
  const changeSort = next => {setSort(next);onSortChange?.(Boolean(next))}
  const toggle = column => changeSort(sort?.column === column ? sort.direction === 'asc' ? {column,direction:'desc'} : null : {column,direction:'asc'})
  const notice = sort && <span className="financial-sort-notice">Sorted by {label(sort.column)} · {sort.direction==='asc'?'ascending':'descending'} <button type="button" onClick={()=>changeSort(null)}>Restore original order</button></span>
  return <table {...props} className={`financial-sort-table ${props.className||''}`}>
    {notice&&!sections.some(section=>section?.type==='caption')&&<caption>{notice}</caption>}
    {sections.map((section,index) => {
      if (!isValidElement(section)) return section
      if(section.type==='caption'&&notice)return cloneElement(section,{},section.props.children,notice)
      if (section.type === 'thead') return cloneElement(section,{key:section.key||index},flatten(section.props.children).map(row => row?.type !== 'tr' ? row : cloneElement(row,{},cells(row).map((cell,column) => {
        const title = label(column)
        if (!title || /^(?:actions?|review|edit|include|select)$/i.test(title) || Number(cell.props.colSpan)>1) return cell
        return cloneElement(cell,{scope:'col','aria-label':title,'aria-sort':sort?.column===column ? (sort.direction==='asc'?'ascending':'descending') : 'none'},<button type="button" className="financial-column-sort" onClick={()=>toggle(column)} aria-label={`Sort by ${title}`} title="Sort ascending, descending, then restore original order">{cell.props.children}<span aria-hidden="true">{sort?.column===column?(sort.direction==='asc'?' ↑':' ↓'):' ↕'}</span></button>)
      }))))
      if (section.type === 'tbody' && sort) return cloneElement(section,{key:section.key||index},sortFinancialSections(flatten(section.props.children),row=>textOf(cells(row)[sort.column]),pinned,sort.direction).map(row=>row?.props?.draggable?cloneElement(row,{draggable:false,title:'Restore original order to drag payoff priorities.'}):row))
      return section
    })}
  </table>
}
