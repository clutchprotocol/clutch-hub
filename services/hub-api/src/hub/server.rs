use crate::hub::clutch_node_client::{ChainInfo, ClutchNodeClient};
use crate::hub::configuration::AppConfig;
use crate::hub::eth_rpc::{eth_rpc_handler, WalletChainId};
use crate::hub::graphql::build_schema;
use crate::hub::graphql::handler::{graphql_handler, graphql_ws_handler};
use actix_cors::Cors;
use actix_web::{web, App, HttpResponse, HttpServer, Result};
use std::sync::Arc;

pub async fn connect_websocket(wss_url: &str) -> Arc<ClutchNodeClient> {
    let url = wss_url.to_string();
    ClutchNodeClient::new(url)
}

/// `"*"` allows any origin (local/dev default); otherwise a comma-separated allowlist.
/// Mirrors clutch-explorer's `app.rs` CORS pattern.
fn build_cors(allowed_origins: &str) -> Cors {
    let cors = if allowed_origins.trim() == "*" {
        Cors::default().allow_any_origin()
    } else {
        allowed_origins
            .split(',')
            .map(str::trim)
            .filter(|o| !o.is_empty())
            .fold(Cors::default(), |cors, origin| cors.allowed_origin(origin))
    };

    cors.allowed_methods(vec!["GET", "POST", "OPTIONS"])
        .allow_any_header()
}

/// `/rpc` answers any origin. It serves only public chain data, and a wallet calls it from its own
/// origin (a browser extension's, or any site that adds the network for its users), which no
/// allowlist could name. Two CORS layers on one route would fight over the headers, so each
/// resource carries its own CORS instead of the whole app.
fn rpc_cors() -> Cors {
    Cors::default()
        .allow_any_origin()
        .allowed_methods(vec!["POST", "OPTIONS"])
        .allow_any_header()
        .max_age(3600)
}

async fn health_check() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "clutch-hub-api",
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

pub async fn run_graphql_server(
    ws_addr: &str,
    ws_manager: Arc<ClutchNodeClient>,
    config: AppConfig,
    chain_info: Arc<ChainInfo>,
) -> std::io::Result<()> {
    let wallet_chain_id = WalletChainId(config.wallet_chain_id.unwrap_or(chain_info.chain_id));
    let schema = build_schema(ws_manager.clone(), config.clone(), chain_info);
    let allowed_origins = config.allowed_origins.clone();
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(schema.clone()))
            .app_data(web::Data::new(ws_manager.clone()))
            .app_data(web::Data::new(wallet_chain_id))
            .service(
                web::resource("/health")
                    .wrap(build_cors(&allowed_origins))
                    .route(web::get().to(health_check)),
            )
            .service(
                web::resource("/graphql")
                    .wrap(build_cors(&allowed_origins))
                    .route(web::post().to(graphql_handler)),
            )
            .service(
                web::resource("/graphql/ws")
                    .wrap(build_cors(&allowed_origins))
                    .route(web::get().to(graphql_ws_handler)),
            )
            .service(
                web::resource("/rpc")
                    .wrap(rpc_cors())
                    .route(web::post().to(eth_rpc_handler)),
            )
    })
    .bind(ws_addr)?
    .run()
    .await
}
