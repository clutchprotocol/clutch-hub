/**
 * Round-trip and refusal checks for the wallet backup envelope.
 *
 *   npm test
 *
 * Node's own test runner and WebCrypto, no framework. The reason this file exists rather than
 * trusting the browser: three of the four cases below are failures, and a failure that silently
 * does not happen looks exactly like success. A keystore that decrypted anything under any
 * passphrase, or accepted a file whose address had been edited, would look fine in the UI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateWallet, addressFromPrivateKey } from './wallet.js';
import { encryptWallet, decryptWallet, KEYSTORE_FORMAT } from './keystore.js';

const PASSPHRASE = 'correct horse battery staple';

test('a backup opens with its passphrase and yields the same key', async () => {
  const wallet = generateWallet();
  const keystore = await encryptWallet(wallet, PASSPHRASE);

  assert.equal(keystore.format, KEYSTORE_FORMAT);
  assert.equal(keystore.address, wallet.address);
  assert.ok(!JSON.stringify(keystore).includes(wallet.privateKey.slice(2)),
    'the private key must not appear anywhere in the file');

  const restored = await decryptWallet(keystore, PASSPHRASE);
  assert.equal(restored.privateKey, wallet.privateKey);
  assert.equal(restored.address, wallet.address);
});

test('two backups of the same wallet differ', async () => {
  // Salt and IV are random per export. Identical ciphertext would mean one or both was fixed,
  // which makes every backup ever taken attackable together.
  const wallet = generateWallet();
  const a = await encryptWallet(wallet, PASSPHRASE);
  const b = await encryptWallet(wallet, PASSPHRASE);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('the wrong passphrase is refused', async () => {
  const keystore = await encryptWallet(generateWallet(), PASSPHRASE);
  await assert.rejects(
    () => decryptWallet(keystore, PASSPHRASE + '!'),
    /Wrong passphrase/,
  );
});

test('an altered ciphertext is refused', async () => {
  const keystore = await encryptWallet(generateWallet(), PASSPHRASE);
  const flipped = keystore.ciphertext[0] === 'A' ? 'B' : 'A';
  const tampered = { ...keystore, ciphertext: flipped + keystore.ciphertext.slice(1) };
  await assert.rejects(() => decryptWallet(tampered, PASSPHRASE), /Wrong passphrase|altered/);
});

test('a backup that names an address it does not hold is refused', async () => {
  // `address` sits outside the sealed envelope, so anyone can edit it. Without this check a file
  // could claim an address whose key it does not contain, and the user would only find out when
  // the chain rejected everything they signed.
  const keystore = await encryptWallet(generateWallet(), PASSPHRASE);
  const someoneElse = generateWallet().address;
  const lying = { ...keystore, address: someoneElse };

  await assert.rejects(() => decryptWallet(lying, PASSPHRASE), (err) => {
    assert.match(err.message, /Refusing to restore/);
    assert.ok(err.message.includes(someoneElse), 'the error should name the address claimed');
    return true;
  });
});

test('a file that is not a Clutch backup is refused', async () => {
  await assert.rejects(() => decryptWallet({ format: 'ethereum-keystore-v3' }, PASSPHRASE),
    /Unrecognised backup format/);
  await assert.rejects(() => decryptWallet(null, PASSPHRASE), /not a Clutch backup/);
});

test('the two derivation paths agree, with and without the 0x prefix', () => {
  // generateWallet and a restore both have to produce the same address for the same key, and they
  // reach it by different routes. No hardcoded vector here on purpose: the value that would make
  // this a cross-implementation check has to come from clutch-hub-api's signature_keys.rs, and one
  // copied from memory would either fail or, worse, be "corrected" to whatever this code happens
  // to emit -- which asserts nothing at all.
  const wallet = generateWallet();
  assert.equal(addressFromPrivateKey(wallet.privateKey), wallet.address);
  assert.equal(addressFromPrivateKey(wallet.privateKey.slice(2)), wallet.address);
});
