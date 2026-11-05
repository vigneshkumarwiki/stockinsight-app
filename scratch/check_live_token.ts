import { UpstoxClient } from '../src/api/upstoxClient.ts';

async function checkToken() {
  const client = new UpstoxClient();
  const envToken = process.env.UPSTOX_TOKEN || process.env.UPSTOX_ACCESS_TOKEN || null;
  const hasToken = client.hasToken();
  const activeToken = client.getToken();

  console.log('--- TOKEN AVAILABILITY CHECK ---');
  console.log('Environment Token:', envToken ? `${envToken.slice(0, 10)}...` : 'NONE');
  console.log('Client hasToken():', hasToken);
  console.log('Client Active Token:', activeToken ? `${activeToken.slice(0, 10)}...` : 'NONE');

  if (hasToken && activeToken) {
    console.log('\nTesting live connection with token...');
    const result = await client.testConnection(activeToken);
    console.log('Connection Test Result:', result);
  } else {
    console.log('\nResult: No live OAuth token supplied in environment or local storage.');
  }
}

checkToken().catch(console.error);
