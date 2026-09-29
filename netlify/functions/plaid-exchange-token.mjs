import '../lib/native-runtime.mjs'
import {withLambda} from '@netlify/aws-lambda-compat'
import legacy from '../legacy-functions/plaid-exchange-token.js'
export default withLambda(legacy.handler)
