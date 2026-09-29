// Static imports keep the Blobs client in native function bundles.
// Native Netlify context supplies site-bound credentials and strong reads.
import * as blobs from '@netlify/blobs'
import auth from './household-auth.cjs'
import scopedStore from './scoped-store.cjs'
auth.setNativeStoreFactory(blobs.getStore)
scopedStore.setNativeBlobs(blobs)
