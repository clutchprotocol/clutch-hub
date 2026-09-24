// src/hub/clutch_node_client/connection.rs

use super::types::JSONRPCResponse;
use futures_util::stream::SplitSink;
use futures_util::StreamExt;
use serde_json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::{Mutex, oneshot};
use tokio::time::Duration;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{error, info};

pub async fn start_connection_loop(
    url: String,
    ws_sink: Arc<Mutex<Option<SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>>>>,
    pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
) {
    loop {
        match connect_async(&url).await {
            Ok((ws_stream, _)) => {
                info!("Connected to clutch-node at {}", url);
                let (sink, mut stream) = ws_stream.split();

                // Update the shared ws_sink
                {
                    let mut ws_sink_lock = ws_sink.lock().await;
                    *ws_sink_lock = Some(sink);
                }

                // Process incoming messages until the connection is closed
                let pending_requests_clone = pending_requests.clone();
                let ws_sink_clone = ws_sink.clone();

                while let Some(msg) = stream.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            handle_incoming_message(text, pending_requests_clone.clone()).await;
                        }
                        Ok(_) => {
                            // Handle other message types if needed
                        }
                        Err(e) => {
                            error!("WebSocket error: {}", e);
                            break;
                        }
                    }
                }

                // Connection lost, clear ws_sink
                {
                    let mut ws_sink_lock = ws_sink_clone.lock().await;
                    *ws_sink_lock = None;
                }

                // Notify pending requests about the disconnection
                let mut pending = pending_requests.lock().await;
                for (_, sender) in pending.drain() {
                    let _ = sender.send("".to_string());
                }

                info!("Connection to clutch-node lost");
            }
            Err(e) => {
                error!("Failed to connect to clutch-node at {}: {}", url, e);
            }
        }

        // Wait before attempting to reconnect
        let retry_seconds = 5;
        error!("Reconnecting to clutch-node in {} seconds...", retry_seconds);
        tokio::time::sleep(Duration::from_secs(retry_seconds)).await;
    }
}

async fn handle_incoming_message(
    text: String,
    pending_requests: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
) {
    match serde_json::from_str::<JSONRPCResponse>(&text) {
        Ok(response) => {
            let mut pending = pending_requests.lock().await;
            if let Some(resp_tx) = pending.remove(&response.id) {
                let _ = resp_tx.send(text);
            } else {
                // Handle unexpected responses or notifications
                info!("Received unexpected message: {}", text);
            }
        }
        Err(e) => {
            error!("Failed to parse response: {}. Error: {}", text, e);
            // Optionally handle invalid messages
        }
    }
}
