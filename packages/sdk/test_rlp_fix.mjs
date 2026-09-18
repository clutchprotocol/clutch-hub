import { ClutchHubSdk } from './dist/sdk.js';
import fs from 'fs';

async function testRLPFix() {
    console.log('Testing RLP encoding fix...');
    
    // Create SDK instance
    const sdk = new ClutchHubSdk('http://localhost:3000', '0xdeb4cfb63db134698e1879ea24904df074726cc0');
    
    // Create test unsigned transaction
    const unsignedTx = {
        data: {
            function_call_type: 'RideRequest',
            arguments: {
                pickup_location: {
                    latitude: 27.18767371338689,
                    longitude: 56.29034313023669
                },
                dropoff_location: {
                    latitude: 27.209659671374624,
                    longitude: 56.336684997461475
                },
                fare: 1000
            }
        },
        from: '0xdeb4cfb63db134698e1879ea24904df074726cc0',
        nonce: 2
    };
    
    // Test private key (example - don't use in production)
    const privateKey = 'd2c446110cfcecbdf05b2be528e72483de5b6f7ef9c7856df2f81f48e9f2748f';
    
    try {
        const signedResult = await sdk.signTransaction(unsignedTx, privateKey);
        console.log('Successfully generated RLP transaction:');
        console.log('Raw transaction:', signedResult.rawTransaction);
        console.log('Signature r:', signedResult.r);
        console.log('Signature s:', signedResult.s);
        console.log('Signature v:', signedResult.v);
        
        // Save to file for Rust testing
        fs.writeFileSync('test_transaction.txt', signedResult.rawTransaction);
        console.log('Saved transaction to test_transaction.txt');
        
    } catch (error) {
        console.error('Error generating transaction:', error);
    }
}

testRLPFix(); 