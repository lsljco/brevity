const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
const monthIndex = date => Number(date.slice(0,4)) * 12 + Number(date.slice(5,7)) - 1
const monthDate = n => `${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}-01`

// Imported results remain provenance only. Read monetary assumptions from the
// importer’s explicit source notes, never from cached payoff balances or dates.
export function calculatePayoffProjection(source, monthlyCashFlow) {
  if (!source) return null
  const notes = source.notes || []
  const amount = pattern => {
    const note = notes.find(n => pattern.test(n))
    const match = note?.match(/:\s*\$([\d,.]+)/)
    return match ? Number(match[1].replaceAll(',', '')) : null
  }
  const reserve = amount(/^Minimum cash (reserve|balance)/i)
  const aprilTax = amount(/^Annual .*income tax/i)
  const octoberTax = amount(/^Annual .*property tax/i)
  const liabilities = notes.flatMap(note => {
    const match = note.match(/^(.*):\s*\$([\d,.]+); monthly cashflow released after payoff:\s*\$([\d,.]+)/i)
    return match ? [{name:match[1], balance:Number(match[2].replaceAll(',','')), release:Number(match[3].replaceAll(',',''))}] : []
  })
  const original = source.schedule || []
  if ([reserve, aprilTax, octoberTax].some(n => n == null) || !liabilities.length || !original.length || !Number.isFinite(monthlyCashFlow)) {
    return {error:'The imported scenario is missing reserve, annual tax, or liability assumptions needed to calculate a payoff plan. Import a workbook containing those assumptions.'}
  }
  const openingMonth = monthIndex(original[0][0])
  const endMonth = Math.max(...original.map(row => monthIndex(row[0])))
  if (!Number.isFinite(openingMonth) || endMonth <= openingMonth || endMonth - openingMonth > 600) return {error:'A valid modeled date range is required.'}
  const taxStartYear = Math.floor(openingMonth / 12) + 1
  const taxFor = month => Math.floor(month/12) < taxStartYear ? 0 : month%12===3 ? aprilTax : month%12===9 ? octoberTax : 0
  const schedule = []
  let balance=0, minimumCash=Infinity, totalPaid=0, release=0, nextDebt=0, payoff='Not within modeled period'
  const append = (date, name, amount, reason) => {
    balance=cents(balance+amount)
    minimumCash=Math.min(minimumCash,balance)
    schedule.push([date,name,cents(amount),balance,reason])
  }
  // Opening month is explicitly fixed in the workbook, including initial savings.
  for (const row of original.filter(row => monthIndex(row[0]) === openingMonth)) append(row[0],row[1],row[2],'Opening assumption')
  minimumCash=Math.min(minimumCash,balance)
  for (let month=openingMonth+1; month<=endMonth; month++) {
    const date=monthDate(month)
    append(date,'Monthly cashflow',monthlyCashFlow+release,'Net income less recurring expenses, plus previously released payments')
    const tax=taxFor(month)
    if(tax) { append(date,month%12===3?'Annual income tax':'Annual property tax',-tax,'Annual tax assumption'); totalPaid=cents(totalPaid+tax) }
    let newRelease=0
    while(nextDebt<liabilities.length) {
      const debt=liabilities[nextDebt]
      let projected=cents(balance-debt.balance), floor=projected
      // Preserve future tax coverage without presuming any later payoff releases.
      for(let future=month+1;future<=endMonth;future++) {
        projected=cents(projected+monthlyCashFlow+release+newRelease+debt.release-taxFor(future))
        floor=Math.min(floor,projected)
      }
      if(floor<reserve) break
      append(date,debt.name,-debt.balance,'Paid in listed order; monthly payment released next month')
      totalPaid=cents(totalPaid+debt.balance)
      newRelease=cents(newRelease+debt.release)
      nextDebt++
      if(nextDebt===liabilities.length) payoff=date.slice(0,7)
    }
    release=cents(release+newRelease)
    minimumCash=Math.min(minimumCash,balance)
  }
  return {schedule,payoff,minimumCash,totalPaid,endingCash:balance,unpaid:cents(liabilities.slice(nextDebt).reduce((sum,d)=>sum+d.balance,0)),reserve}
}
