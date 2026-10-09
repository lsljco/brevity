import '../lib/native-runtime.mjs'
import {productionHouseholdArchive} from '../lib/household-archive.mjs'
export default async function handler(){const archive=productionHouseholdArchive();await archive.capture();await archive.prune()}
export const config={schedule:'55 * * * *'}
