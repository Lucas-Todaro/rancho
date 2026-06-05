export const DEFAULT_READ_TIMEOUT_MS = 15000;

export function withAsyncTimeout<T>(
  promise: PromiseLike<T>,
  message = "A consulta demorou para responder. Tente novamente.",
  timeoutMs = DEFAULT_READ_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
