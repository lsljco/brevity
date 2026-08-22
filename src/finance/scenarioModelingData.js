export const SCENARIO_STORAGE_KEY = 'brevity_finance_scenarios_v1'

export const DEFAULT_SCENARIO_MODEL = {
  expenseMode: 'scenario',
  planningExpense: 23812.11,
  scenarios: [
    {
      id: 'current',
      title: 'Current',
      description: 'What household cash flow looks like today.',
      incomes: [
        { id: 'current-ls-genesco', description: 'LS Genesco Inc.', monthlyNet: 8164, annualGross: 134000, contribution: 11, remote: true, employment: 'Perm', notes: '' },
        { id: 'current-lj-genesco', description: 'LJ Genesco Inc.', monthlyNet: 2870.60, annualGross: 49275.20, contribution: 4, remote: true, employment: 'Perm', notes: '' },
        { id: 'current-ts-globe', description: 'TS Globe Life', monthlyNet: 5614.46, annualGross: 87050, contribution: 7, remote: true, employment: 'Perm', notes: '' },
        { id: 'current-ts-transamerica', description: 'TS TransAmerica', monthlyNet: 6374.32, annualGross: 104000, contribution: 9, remote: false, employment: '', notes: '' },
        { id: 'current-js-old-castle', description: 'JS Old Castle (CRH)', monthlyNet: 3529.56, annualGross: 57000, contribution: 5, remote: false, employment: 'Perm', notes: 'Ends 9/18' },
      ],
    },
    {
      id: 'larry-new-role',
      title: 'Addition of LJ and Replacement of JS Income',
      description: 'If Larry lands the modeled new role and JS income is replaced.',
      incomes: [
        { id: 'role-ls-genesco', description: 'LS Genesco Inc.', monthlyNet: 8164, annualGross: 134000, contribution: 11, remote: true, employment: 'Perm', notes: '' },
        { id: 'role-lj-genesco', description: 'LJ Genesco Inc.', monthlyNet: 2870.60, annualGross: 49275.20, contribution: 4, remote: true, employment: 'Perm', notes: '' },
        { id: 'role-lj-phoenix', description: 'LJ Phoenix Health', monthlyNet: 8535.99, annualGross: 145600, contribution: 12, remote: false, employment: '', notes: '12% contribution inferred from the supplied 48% total.' },
        { id: 'role-ts-globe', description: 'TS Globe Life', monthlyNet: 5614.46, annualGross: 87050, contribution: 7, remote: true, employment: 'Perm', notes: '' },
        { id: 'role-ts-transamerica', description: 'TS TransAmerica', monthlyNet: 6374.32, annualGross: 104000, contribution: 9, remote: false, employment: '', notes: '' },
        { id: 'role-js-opportunity', description: 'JS Opportunity', monthlyNet: 3529.56, annualGross: 57000, contribution: 5, remote: false, employment: '', notes: '' },
      ],
    },
    {
      id: 'all-cylinders',
      title: 'All Cylinders Firing',
      description: 'If all adults and Nyla obtain the modeled roles.',
      incomes: [
        { id: 'all-ls-genesco-a', description: 'LS Genesco Inc.', monthlyNet: 8164, annualGross: 134000, contribution: 11, remote: true, employment: 'Perm', notes: '' },
        { id: 'all-ls-genesco-b', description: 'LS Genesco Inc.', monthlyNet: 8164, annualGross: 134000, contribution: 11, remote: true, employment: 'Perm', notes: 'Second LS Genesco line retained exactly as supplied.' },
        { id: 'all-lj-phoenix', description: 'LJ Phoenix Health', monthlyNet: 8535.99, annualGross: 145600, contribution: 12, remote: false, employment: '', notes: '12% contribution inferred from the supplied 84% total.' },
        { id: 'all-lj-genesco', description: 'LJ Genesco Inc.', monthlyNet: 2740.56, annualGross: 49275.20, contribution: 4, remote: true, employment: 'Perm', notes: '' },
        { id: 'all-lj-shriners', description: "LJ Shriners' Hospital", monthlyNet: 9053.42, annualGross: 166400, contribution: 14, remote: true, employment: 'Contract', notes: '6/30/2026' },
        { id: 'all-ts-morgan-stanley', description: 'TS Morgan Stanley', monthlyNet: 8409.34, annualGross: 135200, contribution: 11, remote: true, employment: 'Perm', notes: '' },
        { id: 'all-ts-globe', description: 'TS Globe Life', monthlyNet: 5614.46, annualGross: 87050, contribution: 7, remote: true, employment: 'Perm', notes: '' },
        { id: 'all-ts-transamerica', description: 'TS TransAmerica', monthlyNet: 6374.32, annualGross: 104000, contribution: 9, remote: false, employment: '', notes: '' },
        { id: 'all-ns-opportunity', description: 'NS Opportunity', monthlyNet: 3857.82, annualGross: 0, contribution: 0, remote: false, employment: '', notes: '' },
        { id: 'all-js-opportunity', description: 'JS Opportunity', monthlyNet: 3857.82, annualGross: 55000, contribution: 5, remote: false, employment: '', notes: '' },
      ],
    },
  ],
}

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => Math.round((value + Number.EPSILON) * 100) / 100

export function calculateScenario(scenario, monthlyExpense) {
  const incomes = Array.isArray(scenario?.incomes) ? scenario.incomes : []
  const monthlyNetIncome = money(incomes.reduce((sum, row) => sum + number(row.monthlyNet), 0))
  const annualGrossIncome = money(incomes.reduce((sum, row) => sum + number(row.annualGross), 0))
  const contribution = money(incomes.reduce((sum, row) => sum + number(row.contribution), 0))
  const expenses = money(Math.max(0, number(monthlyExpense)))
  const monthlyCashFlow = money(monthlyNetIncome - expenses)
  const annualCashFlow = money(monthlyCashFlow * 12)
  return {
    monthlyNetIncome,
    annualGrossIncome,
    contribution,
    monthlyExpense: expenses,
    monthlyCashFlow,
    annualCashFlow,
    projections: Object.fromEntries([2, 3, 4, 5].map(year => [year, money(annualCashFlow * year)])),
  }
}

export function cloneDefaultScenarioModel() {
  return JSON.parse(JSON.stringify(DEFAULT_SCENARIO_MODEL))
}
