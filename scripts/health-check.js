const http = require('http');

const host = process.env.HEALTH_HOST || 'localhost';
const port = process.env.HEALTH_PORT || 8000;
const path = process.env.HEALTH_PATH || '/health';

const options = {
  hostname: host,
  port,
  path,
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  console.log(`statusCode: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log('body:', chunk);
  });
});

req.on('error', (error) => {
  console.error('health-check error', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('health-check timeout');
  req.abort();
  process.exit(2);
});

req.end();
