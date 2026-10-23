/**
 * BEP-20 USDT top-ups on BNB Smart Chain (clutch-treasury `payment-orchestrator/src/bsc_watch.rs`): a
 * person signed in with an Ethereum wallet pays USDT on BSC from their own address straight to the
 * treasury's pay-in address. On BSC that address is their Clutch address itself (same key, same 20
 * bytes), so the orchestrator credits the transfer by sender. No deposit address, no sweep and no
 * relay fee; the wallet charges BSC's network fee in BNB, a few cents.
 *
 * Pure helpers only, no SDK and no wallet, so `node --test` can load this file.
 */

import { usdt } from './directTopUp.js';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** What a wallet needs to add BNB Smart Chain, mainnet (56) or testnet (97), if it does not have it. */
export const BSC_NETWORKS = {
  56: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  97: {
    chainId: '0x61',
    chainName: 'BNB Smart Chain Testnet',
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
};

/**
 * The orchestrator's `POST /api/v1/bsc-topups` answer, checked. `null` when it is missing a field the
 * payment needs, so the caller refuses to pay rather than paying somewhere half-known.
 *
 * @returns {{ chainId: number, payTo: string, from: string, contract: string, decimals: number, minimum: bigint } | null}
 */
export function bscPlan(body) {
  const chainId = Number(body?.chain_id);
  const decimals = Number(body?.usdt_decimals);
  if (
    body?.network !== 'bsc' ||
    !BSC_NETWORKS[chainId] ||
    !HEX_ADDRESS.test(body?.pay_to ?? '') ||
    !HEX_ADDRESS.test(body?.from ?? '') ||
    !HEX_ADDRESS.test(body?.usdt_contract ?? '') ||
    !Number.isInteger(decimals) ||
    decimals < 6 ||
    decimals > 30
  ) {
    return null;
  }
  return {
    chainId,
    payTo: body.pay_to.toLowerCase(),
    from: body.from.toLowerCase(),
    contract: body.usdt_contract.toLowerCase(),
    decimals,
    minimum: BigInt(body.min_deposit_usdt ?? 0),
  };
}

/**
 * A typed USDT amount in the token's base units, or the reason it cannot be sent. At most 6 decimals,
 * because 6 is what a Clutch dollar has: anything finer would not be credited. Integer maths only.
 *
 * @returns {{ micro: bigint, units: bigint } | { error: string }}
 */
export function bscAmount(input, minimum, decimals) {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(String(input ?? '').trim());
  if (!m) return { error: 'Enter an amount in USDT, with at most 6 decimals.' };
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro <= 0n) return { error: 'Enter an amount above zero.' };
  if (micro < minimum) return { error: `The smallest top-up is ${usdt(minimum)} USDT.` };
  return { micro, units: micro * 10n ** BigInt(decimals - 6) };
}

/** The call data of ERC-20 `transfer(to, units)`. */
export function transferData(to, units) {
  const word = (hex) => hex.padStart(64, '0');
  return `0xa9059cbb${word(to.toLowerCase().replace(/^0x/, ''))}${word(units.toString(16))}`;
}

/** A transaction's page on BscScan. */
export function bscTxUrl(chainId, hash) {
  const base = BSC_NETWORKS[chainId]?.blockExplorerUrls[0];
  return base ? `${base}/tx/${hash}` : '';
}

/**
 * Put the wallet on BSC: switch to it, and add it first if the wallet does not know it (4902, or
 * MetaMask Mobile's -32603 that wraps it). The wallet shows its own prompt either way.
 */
export async function switchToBsc(provider, chainId) {
  const network = BSC_NETWORKS[chainId];
  const current = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (typeof current === 'string' && current.toLowerCase() === network.chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainId }] });
  } catch (err) {
    const unknown = err?.code === 4902 || err?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(err?.message ?? '');
    if (!unknown) throw err;
    await provider.request({ method: 'wallet_addEthereumChain', params: [network] });
  }
}
