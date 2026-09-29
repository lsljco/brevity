import {dispatchMaintenance} from '../lib/maintenance-dispatch.mjs'
export default async()=>dispatchMaintenance('retention')
export const config={schedule:'35 8 * * *'}
