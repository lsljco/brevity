import '../lib/native-runtime.mjs'
import {randomUUID} from 'node:crypto'
import {createProductionActionResources} from '../lib/assistant-action-executor.mjs'
import {orchestrationJobStore,orchestrationJobKey} from '../lib/orchestration-job-repository.mjs'
import {createOrchestrationRunner} from '../lib/orchestration-runner.mjs'
export default async function handler(){await createOrchestrationRunner({store:orchestrationJobStore(),key:orchestrationJobKey(),resources:createProductionActionResources(),createId:randomUUID})()}
export const config={schedule:'*/15 * * * *'}
