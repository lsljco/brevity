import {withLambda} from '@netlify/aws-lambda-compat'
import householdAuth from '../lib/household-auth.cjs'

// The modern runtime supplies a site-bound Blobs context, including strong reads.
// Keep authentication logic shared with internal callers; preserve the public URL.
export default withLambda(householdAuth.handler)
