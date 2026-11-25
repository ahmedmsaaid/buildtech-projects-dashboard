/**
 * A small in-memory limiter for public forms. It slows down a script hammering
 * one server instance; it is not a guarantee across instances.
 */
export function createLimiter(maxAttempts: number, windowMs: number) {
  const attempts = new Map<string, number[]>();

  return {
    /** Records an attempt and says whether this caller is now over the limit. */
    isLimited(key: string): boolean {
      const now = Date.now();
      const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
      recent.push(now);
      attempts.set(key, recent);

      // Forget idle callers so the map cannot grow without bound.
      if (attempts.size > 5000) {
        for (const [other, times] of attempts) if (times.every((time) => now - time >= windowMs)) attempts.delete(other);
      }
      return recent.length > maxAttempts;
    },
  };
}

/** Ten bookings from one address in ten minutes is more than any family needs. */
export const bookingLimiter = createLimiter(10, 10 * 60 * 1000);

/** Slows down password guessing. */
export const signInLimiter = createLimiter(8, 10 * 60 * 1000);
