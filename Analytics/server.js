// server.js
const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors'); // To handle CORS if the client will call from another domain
const { RateLimiterMemory } = require("rate-limiter-flexible");
const promClient = require('prom-client');

// Set up metrics collection
promClient.collectDefaultMetrics();

const reqCounter = new promClient.Counter({
    name: 'uploads_dashboard_requests_total',
    help: 'Total number of requests to Uploads Dashboard API',
    labelNames: ['path', 'status'],
});

const dynDbGauge = new promClient.Gauge({
    name: 'uploads_dashboard_dynamodb_duration',
    help: 'Duration of calls to DynamoDB for Uploads Dashboard API',
});

const app = express();
const port = 3000;

// Enable CORS for all routes (you can specify the allowed origin as needed)
app.use(cors());

const rateLimiter = new RateLimiterMemory({
    points: 10, // 10 point
    duration: 60, // Per 1 minute
});

// Configure AWS DynamoDB
AWS.config.update({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN, // Optional
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = 'leiapix-converter-user-exports';

app.get('/latest-animations', async (req, res) => {
    reqCounter.inc({ path: '/latest-animations', status: 'total' });
    try {
        await rateLimiter.consume(req.ip);
    } catch (rateError) {
        reqCounter.inc({ path: '/latest-animations', status: 'blocked_too_many' });
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        // Scan DynamoDB for the completed MP4 downloads
        const params = {
          TableName: tableName,
          FilterExpression: '#status = :status AND #expiresAtSec > :currentTime', // Filter by status and expiration
          ExpressionAttributeNames: {
            '#status': 'status',
            '#expiresAtSec': 'expiresAtSec',
          },
          ExpressionAttributeValues: {
            ':status': 'FINISHED', // Fetch only completed animations
            ':currentTime': Math.floor(Date.now() / 1000), // Current time in seconds
          },
        };
      
        dynDbGauge.setToCurrentTime();
        const dynDbEnd = dynDbGauge.startTimer();
      
        const data = await dynamoDb.scan(params).promise(); // Use scan to fetch multiple items
      
        dynDbEnd();
      
        // Sort the items by endedAt in descending order (latest first)
        const sortedItems = data.Items
          .filter(item => item.endedAt) // Ensure endedAt exists
          .sort((a, b) => b.endedAt - a.endedAt) // Sort by endedAt descending
          .slice(0, 10); // Get the latest 10 results
      
        if (sortedItems.length > 0) {
          const latestExports = sortedItems.map(item => ({
            resultDownloadUrl: item.resultDownloadUrl,
            startedAt: item.startedAt,
            endedAt: item.endedAt,
          }));
          return res.json({ animations: latestExports });
        } else {
          return res.json({ message: 'No recent animations found' });
        }
      } catch (error) {
        console.error('Error fetching animations:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});