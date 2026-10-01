// Independent Plaid items may wait on different institutions. Start them together
// so their timeouts do not accumulate past the browser request deadline. Repeated
// exact item/token identities remain serial to protect each cursor/outbox.
async function forEachPlaidConnection(tokens, operation) {
  const pendingByIdentity = new Map()
  const jobs = tokens.map((token, index) => {
    const keys = [token.item_id && `item:${token.item_id}`, token.access_token && `token:${token.access_token}`].filter(Boolean)
    const prior = [...new Set(keys.map(key => pendingByIdentity.get(key)).filter(Boolean))]
    const job = Promise.all(prior).then(() => operation(token, index))
    keys.forEach(key => pendingByIdentity.set(key, job))
    return job
  })
  await Promise.all(jobs)
}
module.exports = { forEachPlaidConnection }
