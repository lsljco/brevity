import '../lib/native-runtime.mjs'
import {dispatchBankSync} from '../lib/bank-background-sync.mjs'
export default ()=>dispatchBankSync()
export const config={schedule:'*/30 * * * *'}
