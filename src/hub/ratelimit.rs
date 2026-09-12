//! Rate limiting for `generateToken`.
//!
//! Every other mutation here is behind `AuthGuard`, so reaching it costs a valid JWT.
//! `generateToken` is what issues that JWT, which makes it the one endpoint that does real work
//! — secp256k1 signature recovery over a Keccak-256 hash — *before* it knows whether the caller
//! is anybody at all. An unauthenticated flood of malformed signatures is therefore a CPU
//! amplifier: cheap to send, expensive to reject.
//!
//! Two bounds, because one is not enough:
//!
//! - **Global.** The claimed `publicKey` is a caller-supplied string, so a per-key bound alone
//!   is bypassed by varying it. Only a global bound actually caps the recovery work this
//!   endpoint will do per minute. Under a flood it means logins fail, which is bad — but the
//!   rest of the schema keeps serving and the process stays up, which is better than the
//!   alternative.
//! - **Per claimed key.** Catches the ordinary case at a much lower threshold: one client stuck
//!   in a retry loop, or someone hammering a single identity. Cheap, and it keeps a single
//!   caller from eating the whole global allowance.
//!
//! Deliberately NOT keyed on client IP. Behind Cloudflare and nginx the peer address is a proxy,
//! so an IP bound would have to trust a forwarded header — and a spoofable one lets an attacker
//! both mint unlimited buckets for itself and lock a chosen victim out of logging in. Source
//! limiting belongs at the edge, where the hop is actually known. See `mainnet-readiness.md` E1.
//!
//! Standard library only: this is a counter and a timestamp, and the auth path is the last place
//! to take on a dependency for that.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Most distinct claimed keys tracked at once. Without a cap, a caller varying `publicKey` grows
/// this map without limit and turns the limiter into its own memory exhaustion.
const MAX_KEYS: usize = 10_000;

/// The bucket to charge a fixed-window request against.
const GLOBAL_BUCKET: &str = "";

struct Entry {
    window_start: Instant,
    count: u32,
}

/// Fixed window rather than a token bucket.
///
/// Measured against stage on 2026-09-13, and the window edge is NOT as uninteresting as this
/// comment used to claim: the counter resets at the boundary, so a burst spanning one gets up to
/// **twice** the configured limit in quick succession. 150 requests with varying keys were refused
/// 43 times on one run and 0 times on the next, purely on where they fell relative to the reset.
///
/// Kept anyway. The number that matters is the ceiling on signature-recovery work, and 2x a limit
/// chosen well below what hurts is still well below what hurts. A token bucket would smooth this
/// at the cost of carrying state per key between windows. Read the configured value as "about this
/// many per minute, up to twice that across a boundary", and set it with that in mind.
struct FixedWindow {
    window: Duration,
    max_per_window: u32,
    state: Mutex<HashMap<String, Entry>>,
}

impl FixedWindow {
    fn per_minute(max_per_window: u32) -> Self {
        Self {
            window: Duration::from_secs(60),
            max_per_window,
            state: Mutex::new(HashMap::new()),
        }
    }

    /// `true` to allow. A poisoned lock is recovered rather than propagated: the only state
    /// behind it is a request counter, so a panic elsewhere leaves nothing to treat as corrupt,
    /// and refusing every later login would be a worse outage than whatever poisoned it.
    fn allow(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut state = self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(entry) = state.get_mut(key) {
            if now.duration_since(entry.window_start) >= self.window {
                entry.window_start = now;
                entry.count = 1;
                return true;
            }
            if entry.count >= self.max_per_window {
                return false;
            }
            entry.count += 1;
            return true;
        }

        // A key not seen before. Make room first, so a flood of fresh keys cannot grow the map
        // without bound.
        if state.len() >= MAX_KEYS {
            state.retain(|_, e| now.duration_since(e.window_start) < self.window);
            if state.len() >= MAX_KEYS {
                // Every entry is still live. Evict the one closest to expiring rather than
                // refusing the newcomer: refusing would let a key-churning caller lock out
                // everyone arriving after it, and the global bound is what stops that caller
                // anyway.
                let oldest = state
                    .iter()
                    .min_by_key(|(_, e)| e.window_start)
                    .map(|(k, _)| k.clone());
                if let Some(k) = oldest {
                    state.remove(&k);
                }
            }
        }
        state.insert(key.to_string(), Entry { window_start: now, count: 1 });
        true
    }
}

/// Which bound refused a request. Separate variants so the client learns whether backing off
/// will help (its own limit) or whether the whole endpoint is saturated.
#[derive(Debug, PartialEq, Eq)]
pub enum TokenLimit {
    /// This endpoint has issued as many tokens this minute as it will.
    Global,
    /// This claimed public key has asked too often this minute.
    PerKey,
}

impl TokenLimit {
    pub fn message(&self) -> &'static str {
        match self {
            TokenLimit::Global => {
                "Too many token requests against this endpoint — retry shortly"
            }
            TokenLimit::PerKey => "Too many token requests for this public key — retry shortly",
        }
    }
}

pub struct TokenRateLimiter {
    global: FixedWindow,
    per_key: FixedWindow,
}

impl TokenRateLimiter {
    pub fn new(per_key_per_minute: u32, global_per_minute: u32) -> Self {
        Self {
            global: FixedWindow::per_minute(global_per_minute),
            per_key: FixedWindow::per_minute(per_key_per_minute),
        }
    }

    /// `Ok(())` to proceed with signature recovery. Call this BEFORE verifying anything: the
    /// point is that a refusal costs no cryptography.
    ///
    /// The global bound is checked first so that a request refused globally does not also
    /// consume its key's allowance — the reverse order would charge a key for work that never
    /// happened.
    pub fn check(&self, public_key: &str) -> Result<(), TokenLimit> {
        if !self.global.allow(GLOBAL_BUCKET) {
            return Err(TokenLimit::Global);
        }
        if !self.per_key.allow(public_key) {
            return Err(TokenLimit::PerKey);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn per_key_limit_refuses_the_same_key() {
        let limiter = TokenRateLimiter::new(2, 1_000);
        assert!(limiter.check("0xaaa").is_ok());
        assert!(limiter.check("0xaaa").is_ok());
        assert_eq!(limiter.check("0xaaa"), Err(TokenLimit::PerKey));
    }

    #[test]
    fn a_different_key_has_its_own_allowance() {
        let limiter = TokenRateLimiter::new(1, 1_000);
        assert!(limiter.check("0xaaa").is_ok());
        assert_eq!(limiter.check("0xaaa"), Err(TokenLimit::PerKey));
        assert!(limiter.check("0xbbb").is_ok());
    }

    /// The reason the global bound exists: the claimed key is caller-supplied, so a per-key
    /// bound on its own is bypassed by varying it.
    #[test]
    fn varying_the_key_still_hits_the_global_limit() {
        let limiter = TokenRateLimiter::new(1, 3);
        for i in 0..3 {
            assert!(limiter.check(&format!("0x{i}")).is_ok(), "request {i} is within the global bound");
        }
        assert_eq!(
            limiter.check("0xnever-seen"),
            Err(TokenLimit::Global),
            "a fresh key must not buy a fresh global allowance"
        );
    }

    #[test]
    fn the_window_resets() {
        let limiter = TokenRateLimiter {
            global: FixedWindow { window: Duration::from_millis(50), max_per_window: 1, state: Mutex::new(HashMap::new()) },
            per_key: FixedWindow { window: Duration::from_millis(50), max_per_window: 1, state: Mutex::new(HashMap::new()) },
        };
        assert!(limiter.check("0xaaa").is_ok());
        assert!(limiter.check("0xaaa").is_err());
        std::thread::sleep(Duration::from_millis(60));
        assert!(limiter.check("0xaaa").is_ok(), "a new window starts with a fresh count");
    }

    #[test]
    fn tracked_keys_stay_bounded() {
        let limiter = TokenRateLimiter::new(1, u32::MAX);
        for i in 0..(MAX_KEYS + 500) {
            assert!(limiter.check(&format!("0x{i}")).is_ok(), "a fresh key is never refused");
        }
        let held = limiter.per_key.state.lock().unwrap().len();
        assert!(held <= MAX_KEYS, "map grew past its cap: {held}");
    }
}
