import React from 'react';
import Icon from './Icon';
import {
  HUB_API_BASE_URL,
  HUB_GRAPHQL_HTTP_URL,
  HUB_GRAPHQL_WS_URL,
  HUB_HEALTH_URL,
  PUBLIC_NODE_ENDPOINTS,
} from '../config';

const REPOS = [
  { name: 'Clutch Node', desc: 'Blockchain core with Aura consensus.', url: 'https://github.com/clutchprotocol/clutch-node', icon: 'hub' },
  { name: 'Clutch Hub API', desc: 'Bridge between apps and the node. GraphQL and REST.', url: 'https://github.com/clutchprotocol/clutch-hub-api', icon: 'api' },
  { name: 'Clutch Hub SDK', desc: 'Client-side transaction signing and encoding.', url: 'https://github.com/clutchprotocol/clutch-hub-sdk-js', icon: 'code' },
  { name: 'Demo App', desc: 'Passenger, driver, and explorer views.', url: 'https://github.com/clutchprotocol/clutch-hub-demo-app', icon: 'apps' },
];

const DEFAULT_STAGE_NODE_ENDPOINTS = [
  'wss://node1-stage.clutchprotocol.io/ws',
  'wss://node2-stage.clutchprotocol.io/ws',
  'wss://node3-stage.clutchprotocol.io/ws',
];

const EndpointRow = ({ label, value, href }) => (
  <div className="general-endpoint-row">
    <span className="general-endpoint-label">{label}</span>
    <code className="general-endpoint-value">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {value}
        </a>
      ) : (
        value
      )}
    </code>
  </div>
);

const GeneralView = () => {
  return (
    <div className="general-view">
      <h2 className="general-view-title">About</h2>
      <p className="general-view-lead">Hub API endpoints for this session, optional public node URLs, and repositories.</p>

      <section className="general-section" aria-labelledby="general-endpoints-heading">
        <h3 id="general-endpoints-heading" className="general-section-title">
          <Icon name="link" size={20} aria-hidden />
          API &amp; realtime
        </h3>
        <div className="general-endpoint-card card">
          <EndpointRow label="Hub base" value={HUB_API_BASE_URL} />
          <EndpointRow label="Health" value={HUB_HEALTH_URL} href={HUB_HEALTH_URL} />
          <EndpointRow label="GraphQL (HTTP)" value={HUB_GRAPHQL_HTTP_URL} href={HUB_GRAPHQL_HTTP_URL} />
          {HUB_GRAPHQL_WS_URL ? (
            <EndpointRow label="GraphQL (WebSocket)" value={HUB_GRAPHQL_WS_URL} />
          ) : null}
        </div>
      </section>

      <section className="general-section" aria-labelledby="general-nodes-heading">
        <h3 id="general-nodes-heading" className="general-section-title">
          <Icon name="hub" size={20} aria-hidden />
          Node addresses
        </h3>
        {PUBLIC_NODE_ENDPOINTS.length > 0 ? (
          <ul className="general-node-list">
            {PUBLIC_NODE_ENDPOINTS.map((url) => (
              <li key={url}>
                <code className="general-endpoint-value">
                  {/^https?:\/\//i.test(url) ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                    </a>
                  ) : (
                    url
                  )}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="general-node-list">
              {DEFAULT_STAGE_NODE_ENDPOINTS.map((url) => (
                <li key={url}>
                  <code className="general-endpoint-value">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                    </a>
                  </code>
                </li>
              ))}
            </ul>
            <p className="general-node-hint">
              The browser only talks to the Hub API above. Clutch nodes are reached by the Hub over WebSocket.
              Set <code className="general-inline-code">VITE_PUBLIC_NODE_ENDPOINTS</code> at build time to override these defaults.
            </p>
          </>
        )}
      </section>

      <section className="general-section" aria-labelledby="general-github-heading">
        <h3 id="general-github-heading" className="general-section-title">
          <Icon name="code" size={20} aria-hidden />
          GitHub
        </h3>
        <h1 className="about-hero">
          Clutch <span className="about-hero-accent">Protocol.</span>
        </h1>
        <div className="about-bento">
          {REPOS.map((project, idx) => (
            <div key={project.name} className={`about-bento-card ${idx === 1 || idx === 3 ? 'about-bento-card--offset' : ''}`}>
              <div className="about-bento-icon">
                <Icon name={project.icon} size={28} />
              </div>
              <h3 className="about-bento-title">{project.name}</h3>
              <p className="about-bento-desc">{project.desc}</p>
              <a href={project.url} target="_blank" rel="noopener noreferrer" className="about-bento-link">
                {project.url.replace('https://github.com/', '')}
                <Icon name="arrow_forward" size={18} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default GeneralView;
