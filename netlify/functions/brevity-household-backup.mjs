import {createHouseholdBackup} from '../lib/household-backup.mjs'
export default async()=>{const manifest=await createHouseholdBackup();if(manifest.state!=='complete')throw Error('Household backup incomplete. Review recovery logs.');console.info('[brevity-backup]',JSON.stringify({id:manifest.id,state:manifest.state,recordCount:manifest.records.length}))}
export const config={schedule:'10 8 * * *'}
