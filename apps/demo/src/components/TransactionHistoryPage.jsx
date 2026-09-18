import React from 'react';
import TransactionHistory from './TransactionHistory';
import { Section, EmptyState } from './layout';

const TransactionHistoryPage = ({ userPublicKey }) => {
  return (
    <Section
      title="Transaction history"
      icon="📋"
      description={userPublicKey ? 'Your latest signed and submitted transaction events.' : 'Connect your wallet to view your transaction history.'}
    >
      {!userPublicKey ? (
        <EmptyState message="Connect your wallet above to view transaction history." />
      ) : (
        <TransactionHistory userPublicKey={userPublicKey} contentOnly />
      )}
    </Section>
  );
};

export default TransactionHistoryPage;
