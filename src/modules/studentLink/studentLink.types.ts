// LINKED: account attached. ALREADY_LINKED: it was already on this student.
// MERGED: the account had its own student, now merged. REFUSED: needs a manual merge.
// INVALID_TOKEN: unknown, expired, already used, or meant for the other kind of account.
export type LinkOutcome = 'LINKED' | 'ALREADY_LINKED' | 'MERGED' | 'REFUSED' | 'INVALID_TOKEN'

export type LinkResult = { outcome: LinkOutcome; studentId: string | null }
