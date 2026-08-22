import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateScenario, DEFAULT_SCENARIO_MODEL } from './scenarioModelingData.js'

const expense = DEFAULT_SCENARIO_MODEL.planningExpense

test('current scenario reproduces the supplied cash-flow model', () => {
  const result = calculateScenario(DEFAULT_SCENARIO_MODEL.scenarios[0], expense)
  assert.equal(result.monthlyNetIncome, 26552.94)
  assert.equal(result.annualGrossIncome, 431325.20)
  assert.equal(result.contribution, 36)
  assert.equal(result.monthlyCashFlow, 2740.83)
  assert.equal(result.annualCashFlow, 32889.96)
  assert.equal(result.projections[5], 164449.80)
})

test('new-role scenario reproduces the supplied model', () => {
  const result = calculateScenario(DEFAULT_SCENARIO_MODEL.scenarios[1], expense)
  assert.equal(result.monthlyNetIncome, 35088.93)
  assert.equal(result.annualGrossIncome, 576925.20)
  assert.equal(result.contribution, 48)
  assert.equal(result.monthlyCashFlow, 11276.82)
  assert.equal(result.projections[5], 676609.20)
})

test('all-cylinders scenario reproduces the supplied model', () => {
  const result = calculateScenario(DEFAULT_SCENARIO_MODEL.scenarios[2], expense)
  assert.equal(result.monthlyNetIncome, 64771.73)
  assert.equal(result.annualGrossIncome, 1010525.20)
  assert.equal(result.contribution, 84)
  assert.equal(result.monthlyCashFlow, 40959.62)
  assert.equal(result.projections[5], 2457577.20)
})

test('invalid values cannot poison calculations', () => {
  const result = calculateScenario({ incomes: [{ monthlyNet: 'bad', annualGross: null, contribution: undefined }] }, 'bad')
  assert.deepEqual(result, {
    monthlyNetIncome: 0,
    annualGrossIncome: 0,
    contribution: 0,
    monthlyExpense: 0,
    monthlyCashFlow: 0,
    annualCashFlow: 0,
    projections: { 2: 0, 3: 0, 4: 0, 5: 0 },
  })
})
