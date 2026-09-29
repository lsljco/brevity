import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import * as plaid from 'plaid'
import legacy from '../legacy-functions/plaid-transactions.js'
legacy.setNativePlaid(plaid)
export default withLambda(legacy.handler)
