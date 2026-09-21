export function maybeClient() { return null }
export function getClient(): never { throw new Error('no client in tests') }
