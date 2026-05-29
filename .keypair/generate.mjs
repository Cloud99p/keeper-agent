import { Keypair } from '@solana/web3.js';
import { writeFileSync } from 'fs';

const keypair = Keypair.generate();
const publicKey = keypair.publicKey.toString();
const secretKey = Array.from(keypair.secretKey);

writeFileSync('./.keypair/devnet.json', JSON.stringify(secretKey));

console.log('\n✅ Keypair generated!\n');
console.log('Public Key:', publicKey);
console.log('\n⚠️  Fund this address: https://faucet.solana.com/\n');
