import {useState} from 'react'
import './FinanceExport.css'
export default function FinanceExport({report,buildReport,disabled=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[format,setFormat]=useState('xlsx')
 const download=async()=>{setBusy(true);setError('');try{const data=buildReport?buildReport():report;if(!data?.sections)throw Error('The report is not ready yet.');const {downloadFinanceReport}=await import('./financeExportFiles.js');await downloadFinanceReport({...data,notes:[...(data.notes||[]),`Exported ${new Date().toLocaleString('en-US',{timeZone:'America/New_York'})} America/New_York`]},format)}catch(e){setError(e.message||'Export failed. Please try again.')}finally{setBusy(false)}}
 return <div className="finance-export" aria-label={`Export ${report?.title||'financial report'}`}><label>Format<select aria-label="Export format" value={format} onChange={e=>setFormat(e.target.value)} disabled={busy}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option><option value="pdf">PDF (.pdf)</option></select></label><button type="button" onClick={download} disabled={disabled||busy}>{busy?'Preparing export…':'Export'}</button>{error&&<p role="alert">{error}</p>}</div>
}
