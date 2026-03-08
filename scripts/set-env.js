const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { GoogleAuth } = require('google-auth-library');

async function getSecret() {
    try {
        const auth = new GoogleAuth();
        await auth.getApplicationDefault(); // Gracefully fails if no auth

        const client = new SecretManagerServiceClient();
        const projectId = 'austin-test-450819';
        const name = `projects/${projectId}/secrets/firebase-api-key/versions/latest`;
        const [version] = await client.accessSecretVersion({ name });
        const payload = version.payload.data.toString('utf8');
        return payload;
    } catch (err) {
        console.warn('Skipping Secret Manager. Google Cloud Auth missing or failed:', err.message);
        return 'AIzaSyBQ7uGtdC1VW4pGmj-qCflWvLMCLuqN8XA'; // Fallback for local dev if auth fails
    }
}

async function writeEnvironments() {
    const apiKey = await getSecret();

    const envContent = `export const environment = {
  production: false,
  firebase: {
    apiKey: "${apiKey}",
    authDomain: "austin-test-450819.firebaseapp.com",
    projectId: "austin-test-450819",
    storageBucket: "austin-test-450819.firebasestorage.app",
    messagingSenderId: "579215986794",
    appId: "1:579215986794:web:0f0389b9264e1d6271ba13"
  },
};
`;

    const envProdContent = `export const environment = {
  production: true,
  firebase: {
    apiKey: "${apiKey}",
    authDomain: "austin-test-450819.firebaseapp.com",
    projectId: "austin-test-450819",
    storageBucket: "austin-test-450819.firebasestorage.app",
    messagingSenderId: "579215986794",
    appId: "1:579215986794:web:0f0389b9264e1d6271ba13"
  },
};
`;

    fs.writeFileSync(path.join(__dirname, '../src/environments/environment.ts'), envContent);
    fs.writeFileSync(path.join(__dirname, '../src/environments/environment.prod.ts'), envProdContent);
    console.log('Successfully generated Angular environment files with Firebase API key.');
}

writeEnvironments();
