// Recover only preparation, never execution of an approved proposal. The
// reviewed record must be identical before a newer shared version is used.
export async function prepareFinanceReview({input, original, prepare, refresh}) {
  try { return await prepare(input) }
  catch (error) {
    if (error?.code !== 'VERSION_CONFLICT' || !original || input.operation?.type !== 'recurring.update') throw error
    const fresh = await refresh()
    const target = fresh.transactions.find(row => row.id === input.operation.targetId)
    if (!target || JSON.stringify(target) !== JSON.stringify(original)) {
      throw new Error('This transaction changed on another device or during sync. Your draft is still open. Close and reopen the editor to review the latest transaction before changing it.')
    }
    // Exactly one retry. A second concurrent update still fails closed.
    return prepare({...input,expectedVersion:fresh.version})
  }
}
