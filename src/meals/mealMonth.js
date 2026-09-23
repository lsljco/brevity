export function mealMonthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const [year, number] = month.split('-').map(Number)
  return { startDate:`${month}-01`, count:new Date(Date.UTC(year, number, 0)).getUTCDate() }
}
