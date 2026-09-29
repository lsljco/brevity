import '../lib/native-runtime.mjs'
import {dispatchMaintenance} from '../lib/maintenance-dispatch.mjs'
export default async()=>dispatchMaintenance('backup')
export const config={schedule:'10 8 * * *'}
