use axum::{routing::get, Router};
use prometheus_client::metrics::family::Family;
use prometheus_client::registry::Registry;
use prometheus_client::{encoding::text::encode as prometheus_encode, metrics::gauge::Gauge};
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug, Hash, PartialEq, Eq, prometheus_client::encoding::EncodeLabelSet)]
pub struct BlockLabels {
    pub block_hash: String,
}

lazy_static::lazy_static! {
    pub static ref LATEST_BLOCK_INDEX: Gauge = Gauge::default();
    pub static ref LATEST_BLOCK: Family<BlockLabels, Gauge> = Family::default();

    static ref REGISTRY: Arc<Mutex<Registry>> = {
        let mut registry = Registry::default();
        registry.register(
            "latest_block_index",
            "Current block index of the clutch node",
            LATEST_BLOCK_INDEX.clone(),
        );
        registry.register(
            "latest_block",
            "Current block of the clutch node",
            LATEST_BLOCK.clone(),
        );
        Arc::new(Mutex::new(registry))
    };
}

pub fn serve_metrics(addr: &str) {
    let addr = addr.to_string();
    tokio::spawn(async move {
        let app = Router::new()
            .route("/", get(track_and_respond))
            .route("/metrics", get(metrics_handler));

        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    });
}

async fn track_and_respond() -> &'static str {
    "Hello, World!"
}

async fn metrics_handler() -> String {
    let mut buffer = String::new();
    let registry = REGISTRY.lock().unwrap();
    prometheus_encode(&mut buffer, &*registry).unwrap();
    buffer
}
