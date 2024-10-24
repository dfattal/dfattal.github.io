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
const axios = require('axios');
const sharp = require('sharp');

let progressCache = {};

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
//const port = process.env.PORT ?? 8080;

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

// Path to the cache file
const cacheFilePath = path.join(__dirname, 'cache.json');

// Load the cache from file
let processedAnimations = loadCacheFromFile();

// Function to load cache from file
function loadCacheFromFile() {
  if (fs.existsSync(cacheFilePath)) {
    const cacheData = fs.readFileSync(cacheFilePath);
    return JSON.parse(cacheData);
  }
  return {};
}

// Function to save cache to file
function saveCacheToFile() {
  fs.writeFileSync(cacheFilePath, JSON.stringify(processedAnimations, null, 2));
}

async function convertHeicToJpg(imageUrl, filename) {
  const imagePath = await downloadImage(imageUrl, filename);

  const jpgPath = path.join(__dirname, 'frames', `${path.parse(filename).name}.jpg`);

  // Convert HEIC to JPG using sharp
  await sharp(imagePath)
    .toFormat('jpeg')
    .toFile(jpgPath);

  return jpgPath;
}

// Helper function to extract a single frame from a video or GIF
async function extractSingleFrame(animationUrl, isGif = false) {
  const framesDir = path.join(__dirname, 'frames');

  // Ensure the frames directory exists
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir);
  }

  const frameFile = isGif ? 'gif-frame-001.jpg' : 'frame-001.jpg';
  const framePath = path.join(framesDir, frameFile);

  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(animationUrl)
      .output(framePath) // Save the frame as a jpg image
      .outputOptions(['-frames:v 1', '-q:v 2']); // Extract the first frame

    // If it’s a GIF, we pass additional options to treat it properly
    if (isGif) {
      ffmpegCommand.inputOptions('-f gif'); // Specify GIF as input format
    }

    ffmpegCommand
      .on('end', () => resolve(framePath)) // Return the path to the frame
      .on('error', reject)
      .run();
  });
}

// Helper function to download an image from a URL and save it locally
async function downloadImage(imageUrl, filename) {
  const framesDir = path.join(__dirname, 'frames');

  // Ensure the frames directory exists
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir);
  }

  const imagePath = path.join(framesDir, filename);

  const writer = fs.createWriteStream(imagePath);

  const response = await axios({
    url: imageUrl,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(imagePath));
    writer.on('error', reject);
  });
}

// Helper function to classify a single frame (image)
async function classifySingleFrame(framePath) {
  const model = await nsfwjs.load("MobileNetV2");
  const imageBuffer = fs.readFileSync(framePath);
  const imageTensor = tf.node.decodeImage(imageBuffer, 3);

  // Classify the frame
  const predictions = await model.classify(imageTensor);

  // Print the predictions to the terminal
  process.stdout.write(`Predictions for frame: ${framePath}\n`);
  process.stdout.write(JSON.stringify(predictions, null, 2) + '\n');

  const indecentContent = predictions.some(
    prediction => (prediction.className === 'Porn' || prediction.className === 'Hentai') && prediction.probability > 0.8
  );

  return indecentContent;
}

// Modify the classifyImage function
async function classifyImage(imageUrl) {
  const filename = path.basename(imageUrl).split('?')[0];
  const isHeic = /\.heic$/i.test(filename);

  let imagePath;

  if (isHeic) {
    imagePath = await convertHeicToJpg(imageUrl, filename);
  } else {
    imagePath = await downloadImage(imageUrl, filename);
  }

  const model = await nsfwjs.load("MobileNetV2");
  const imageBuffer = fs.readFileSync(imagePath);
  const imageTensor = tf.node.decodeImage(imageBuffer, 3);

  const predictions = await model.classify(imageTensor);

  process.stdout.write(`Predictions for image: ${imageUrl}\n`);
  process.stdout.write(JSON.stringify(predictions, null, 2) + '\n');

  const indecentContent = predictions.some(
    prediction => (prediction.className === 'Porn' || prediction.className === 'Hentai') && prediction.probability > 0.8
  );

  // Clean up the downloaded or converted image after classification
  fs.unlinkSync(imagePath);

  return indecentContent;
}

app.get('/latest-animations', async (req, res) => {
  reqCounter.inc({ path: '/latest-animations', status: 'total' });

  const checkDecency = req.query.checkDecency === 'true';

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

    let processedCount = 0;
    let totalItems = sortedItems.length;
    progressCache = { processed: 0, total: totalItems };

    for (let animation of sortedItems) {
      console.log('Processing animation:', animation.filename);

      if (!checkDecency) {
        console.log(`Skipping decency check for: ${animation.filename}, not requested by client.`);
        animation.isIndecent = null;
        processedCount++;
        progressCache.processed = processedCount;
        continue;

      }

      // Check if animation was previously processed
      if (processedAnimations[animation.filename]) {
        console.log(`Skipping decency check for: ${animation.filename}, already processed: ${processedAnimations[animation.filename].isIndecent}`);
        animation.isIndecent = processedAnimations[animation.filename].isIndecent;
        processedCount++;
        progressCache.processed = processedCount;
        continue;
      }

      const isGif = /\.gif$/i.test(animation.filename);
      const isImage = /\.(jpg|jpeg|png|heic)$/i.test(animation.filename);

      if (isImage) {
        // Classify an image directly
        animation.isIndecent = await classifyImage(animation.resultDownloadUrl);
      } else {
        // Extract a single frame and classify it (from GIF or video)
        const framePath = await extractSingleFrame(animation.resultDownloadUrl, isGif);

        animation.isIndecent = await classifySingleFrame(framePath);

        // Store the result in cache
        processedAnimations[animation.filename] = { isIndecent: animation.isIndecent };
        saveCacheToFile();

        // Clean up the frame after classification
        //fs.unlinkSync(framePath);

      }
      processedCount++;
      progressCache.processed = processedCount;
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

app.get('/filtering-progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const intervalId = setInterval(() => {
    const progress = (progressCache.processed / progressCache.total) * 100;

    res.write(`data: ${JSON.stringify({ progress })}\n\n`);

    if (progress >= 100) {
      // Stop the interval once progress is complete
      clearInterval(intervalId);

      // Close the connection by sending a 'completed' message
      res.write('event: close\n');
      res.write('data: done\n\n');

      // End the response to close the connection
      res.end();
    }
  }, 1000); // Send progress updates every second

  req.on('close', () => {
    clearInterval(intervalId); // Clean up when connection closes
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});