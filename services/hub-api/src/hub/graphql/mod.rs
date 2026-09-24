pub mod handler;
pub mod lists;
pub mod mutation;
pub mod query;
pub mod subscription;
pub mod types;

use std::sync::Arc;

pub use mutation::Mutation;
pub use query::Query;
pub use subscription::Subscription;

use async_graphql::Schema;

use super::clutch_node_client::{ChainInfo, ClutchNodeClient};
use super::configuration::AppConfig;

pub fn build_schema(
    ws_manager: Arc<ClutchNodeClient>,
    config: AppConfig,
    chain_info: Arc<ChainInfo>,
) -> Schema<Query, Mutation, Subscription> {
    // Built here rather than passed in so every caller of build_schema gets the bound, and so
    // the windows are shared across requests: the schema is cloned per request, a limiter held
    // by value would hand each one an empty map and enforce nothing.
    let token_limiter = Arc::new(crate::hub::ratelimit::TokenRateLimiter::new(
        config.token_rate_limit_per_minute,
        config.token_rate_limit_global_per_minute,
    ));
    Schema::build(
        Query::default(),
        Mutation::default(),
        Subscription::default(),
    )
    .data(ws_manager)
    .data(config)
    .data(chain_info)
    .data(token_limiter)
    // Bound query cost so a single aliased request can't fan out into hundreds of
    // concurrent node RPCs contending on the one shared WebSocket mutex (a cheap DoS).
    // Every field is weight 1 by default; normal client queries are well under this.
    .limit_complexity(200)
    .limit_depth(12)
    .finish()
}
