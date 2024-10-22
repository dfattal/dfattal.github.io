const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const { RateLimiterMemory } = require("rate-limiter-flexible");
const promClient = require('prom-client');
const nsfwjs = require('nsfwjs');
const tf = require('@tensorflow/tfjs-node');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

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

// Enable CORS for all routes
app.use(cors());

const rateLimiter = new RateLimiterMemory({
  points: 10, // 10 points
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

// Helper function to extract a single frame from a video
async function extractSingleFrame(videoUrl) {
  const framesDir = path.join(__dirname, 'frames');

  // Ensure the frames directory exists
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoUrl)
      .output(`${framesDir}/frame-001.jpg`) // Save one frame as a jpg image
      .outputOptions(['-frames:v 1', '-vf scale=-1:180', '-q:v 2']) // Extract the first frame (-frames:v 1) with quality (-q:v 2)
      .on('end', () => resolve(`${framesDir}/frame-001.jpg`)) // Return the path to the frame
      .on('error', reject)
      .run();
  });
}

// Helper function to classify a single frame from the video
async function classifySingleFrame(framePath) {
  const model = await nsfwjs.load();
  const imageBuffer = fs.readFileSync(framePath);
  const imageTensor = tf.node.decodeImage(imageBuffer, 3);

  // Classify the frame
  const predictions = await model.classify(imageTensor);
  const indecentContent = predictions.some(
    prediction => prediction.className === 'Porn' && prediction.probability > 0.8
  );

  return indecentContent;
}

// Helper function to classify images directly
async function classifyImage(imageUrl) {
  const model = await nsfwjs.load();
  const imageBuffer = fs.readFileSync(imageUrl);
  const imageTensor = tf.node.decodeImage(imageBuffer, 3);

  const predictions = await model.classify(imageTensor);
  const indecentContent = predictions.some(
    prediction => prediction.className === 'Porn' && prediction.probability > 0.8
  );

  return indecentContent;
}

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

    const currentTime = Date.now();

    // Sort the items by endedAt in descending order and calculate relative time
    const sortedItems = data.Items
      .filter(item => item.endedAt) // Ensure endedAt exists
      .sort((a, b) => b.endedAt - a.endedAt) // Sort by endedAt descending
      .slice(0, 10); // Get the latest 10

    for (let animation of sortedItems) {
      const isImage = /\.(gif|jpg|jpeg|png)$/i.test(animation.filename);

      if (isImage) {
        // Classify an image directly
        animation.isIndecent = await classifyImage(animation.resultDownloadUrl);
      }
      else {
        // Extract a single frame and classify it
        const framePath = await extractSingleFrame(animation.resultDownloadUrl);

        animation.isIndecent = await classifySingleFrame(framePath);

        // Clean up the frame after classification
        //fs.unlinkSync(framePath);
        // animation.isIndecent = false;
      }
    }

    if (sortedItems.length > 0) {
      return res.json({ animations: sortedItems });
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