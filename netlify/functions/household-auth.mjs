import {withLambda} from '@netlify/aws-lambda-compat'
import {getStore} from '@netlify/blobs'
import householdAuth from '../lib/household-auth.cjs'

// The modern runtime supplies a site-bound Blobs context, including strong reads.
// Keep authentication logic shared with internal callers; preserve the public URL.
householdAuth.setNativeStoreFactory(getStore)
export default withLambda(householdAuth.handler)
