import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import legacy from '../legacy-functions/plaid-debug.js'
export default withLambda(legacy.handler)
