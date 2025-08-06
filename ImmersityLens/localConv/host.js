#!/opt/homebrew/bin/node
// host.js — sits next to lif_converter & models/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Add logging for debugging
function log(message) {
  fs.appendFileSync('/tmp/lif_host.log', new Date().toISOString() + ': ' + message + '\n');
}

log('Host.js starting...');

// Handle process exit
process.on('exit', (code) => {
  log(`Process exiting with code: ${code}`);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  log(`Stack: ${error.stack}`);
  process.exit(1);
});

// helper to read Chrome's length-prefixed stdin message
function readMsg() {
  try {
    const lenBuf = Buffer.alloc(4);
    const bytesRead = fs.readSync(0, lenBuf, 0, 4);
    if (bytesRead === 0) {
      log('No more input, exiting normally');
      process.exit(0);
    }
    if (bytesRead < 4) {
      log(`WARNING: Incomplete length header, got ${bytesRead} bytes`);
      return null;
    }

    const len = lenBuf.readUInt32LE(0);
    log(`Message length: ${len} bytes`);

    // Bounds checking - prevent huge allocations
    if (len > 50 * 1024 * 1024) { // 50MB max
      log(`ERROR: Message too large: ${len} bytes`);
      sendMsg({ error: 'Message too large' });
      return null;
    }

    if (len <= 0) {
      log(`ERROR: Invalid message length: ${len}`);
      sendMsg({ error: 'Invalid message length' });
      return null;
    }

    const buf = Buffer.alloc(len);
    let totalBytesRead = 0;

    // Read in chunks until we have the complete message
    while (totalBytesRead < len) {
      const bytesRead = fs.readSync(0, buf, totalBytesRead, len - totalBytesRead);
      if (bytesRead === 0) {
        log(`ERROR: Unexpected end of input after ${totalBytesRead} bytes (expected ${len})`);
        sendMsg({ error: 'Incomplete message - unexpected end of input' });
        return null;
      }
      totalBytesRead += bytesRead;
      log(`Read ${bytesRead} bytes, total: ${totalBytesRead}/${len}`);
    }

    const jsonStr = buf.toString();
    log(`Received JSON: ${jsonStr.substring(0, 100)}...`);

    return JSON.parse(jsonStr);
  } catch (error) {
    log(`ERROR in readMsg: ${error.message}`);
    sendMsg({ error: `Read error: ${error.message}` });
    return null;
  }
}

// helper to write back
function sendMsg(msg) {
  try {
    const data = Buffer.from(JSON.stringify(msg));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(data.length, 0);
    fs.writeSync(1, header);
    fs.writeSync(1, data);
    log(`Sent response: ${JSON.stringify(msg).substring(0, 100)}...`);
  } catch (error) {
    log(`ERROR in sendMsg: ${error.message}`);
  }
}

async function mainLoop() {
  while (true) {
    try {
      log('Waiting for next message...');
      const msg = readMsg();
      if (!msg) {
        log('readMsg returned null, continuing...');
        continue; // Skip if readMsg failed
      }

      log(`Processing message with keys: ${Object.keys(msg).join(', ')}`);

      // Handle ping for availability testing
      if (msg.type === 'ping') {
        log('Handling ping request');
        sendMsg({ pong: true });
        log('Ping response sent, waiting for next message...');
        continue;
      }

      // Validate image data
      if (!msg.image) {
        log('ERROR: No image property in message');
        sendMsg({ error: 'No image data provided' });
        continue;
      }

      if (typeof msg.image !== 'string') {
        log('ERROR: Image is not a string');
        sendMsg({ error: 'Image must be a string' });
        continue;
      }

      // Validate base64 data URL format
      if (!msg.image.startsWith('data:image/')) {
        log('ERROR: Invalid image data URL format');
        sendMsg({ error: 'Invalid image data URL format' });
        continue;
      }

      const raw = msg.image.replace(/^data:.+;base64,/, '');
      if (raw.length === 0) {
        log('ERROR: No base64 data found');
        sendMsg({ error: 'No base64 image data found' });
        continue;
      }

      log(`Processing image with ${raw.length} base64 characters`);

      const tmp = os.tmpdir();
      const inP = path.join(tmp, `in_${Date.now()}.jpg`);
      const outP = path.join(tmp, `out_${Date.now()}.lif.jpg`);

      // Write input file
      try {
        fs.writeFileSync(inP, Buffer.from(raw, 'base64'));
        log(`Wrote input file: ${inP}`);
      } catch (error) {
        log(`ERROR writing input file: ${error.message}`);
        sendMsg({ error: `Failed to write input file: ${error.message}` });
        continue;
      }

      // Check if lif_converter exists
      const lifConverterPath = path.join(__dirname, 'lif_converter');
      if (!fs.existsSync(lifConverterPath)) {
        log(`ERROR: lif_converter not found at ${lifConverterPath}`);
        sendMsg({ error: 'LIF converter not found' });
        // Cleanup
        try { fs.unlinkSync(inP); } catch (e) { }
        continue;
      }

      log(`Starting lif_converter: ${lifConverterPath}`);

      // Wait for the conversion to complete before continuing
      await new Promise((resolve) => {
        const proc = spawn(lifConverterPath, ['--input', inP, '--output', outP]);
        let stdout = '';
        let stderr = '';
        let resolved = false;
        let conversionStarted = false;
        let lastProgressUpdate = Date.now();

        // Track conversion progress phases
        let currentPhase = 'starting';
        const phases = {
          'starting': 'Starting conversion...',
          'loading': 'Loading models...',
          'disparity': 'Estimating depth...',
          'ldi': 'Generating LDI layers...',
          'saving': 'Saving LIF file...',
          'completed': 'Conversion completed!'
        };

        const handleCompletion = (success, errorMsg = null) => {
          if (resolved) return;
          resolved = true;

          if (success) {
            try {
              if (!fs.existsSync(outP)) {
                log(`ERROR: Output file not created: ${outP}`);
                sendMsg({ error: 'Output file not created' });
              } else {
                const stats = fs.statSync(outP);
                if (stats.size === 0) {
                  log(`ERROR: Output file is empty: ${outP}`);
                  sendMsg({ error: 'Output file is empty' });
                } else {
                  const lif64 = fs.readFileSync(outP).toString('base64');
                  log(`✅ Conversion successful! Output size: ${lif64.length} base64 characters`);
                  sendMsg({ lif: `data:image/jpeg;base64,${lif64}` });
                }
              }
            } catch (error) {
              log(`ERROR reading output file: ${error.message}`);
              sendMsg({ error: `Failed to read output: ${error.message}` });
            }
          } else {
            log(`❌ Conversion failed: ${errorMsg}`);
            sendMsg({ error: errorMsg || 'Conversion failed' });
          }

          // Cleanup files
          setTimeout(() => {
            try { fs.unlinkSync(inP); } catch (e) { log(`Warning: Could not delete ${inP}`); }
            try { fs.unlinkSync(outP); } catch (e) { log(`Warning: Could not delete ${outP}`); }
          }, 100);

          resolve();
        };

        // Parse stdout for progress information
        proc.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;

          // Check for key progress indicators
          if (output.includes('Starting LIF conversion')) {
            conversionStarted = true;
            currentPhase = 'starting';
            log(`🚀 ${phases[currentPhase]}`);
          } else if (output.includes('Loading engine:') || output.includes('Compile model')) {
            currentPhase = 'loading';
            log(`📚 ${phases[currentPhase]}`);
          } else if (output.includes('Estimating disparity map') || output.includes('Populating disparity')) {
            currentPhase = 'disparity';
            log(`🧠 ${phases[currentPhase]}`);
          } else if (output.includes('Starting LDI generation') || output.includes('Generated') && output.includes('layers')) {
            currentPhase = 'ldi';
            log(`🏗️ ${phases[currentPhase]}`);
          } else if (output.includes('Saving LDI LIF file')) {
            currentPhase = 'saving';
            log(`💾 ${phases[currentPhase]}`);
          } else if (output.includes('LIF conversion completed successfully')) {
            currentPhase = 'completed';
            log(`🎉 ${phases[currentPhase]}`);
            handleCompletion(true);
            return;
          }

          // Update progress periodically (every 5 seconds max)
          const now = Date.now();
          if (now - lastProgressUpdate > 5000) {
            log(`⏳ Conversion in progress: ${phases[currentPhase]}`);
            lastProgressUpdate = now;
          }
        });

        proc.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;

          // Log important stderr messages
          if (output.includes('error') || output.includes('Error') || output.includes('ERROR')) {
            log(`⚠️ Converter stderr: ${output.trim()}`);
          }
        });

        proc.on('close', (code) => {
          if (resolved) return;

          log(`lif_converter process exited with code: ${code}`);

          if (code === 0) {
            // Success exit - check if we missed the completion message
            if (stdout.includes('LIF conversion completed successfully') || fs.existsSync(outP)) {
              handleCompletion(true);
            } else {
              handleCompletion(false, 'Process completed but no success message found');
            }
          } else {
            // Error exit
            const errorMsg = stderr || `Process exited with code ${code}`;
            handleCompletion(false, errorMsg);
          }
        });

        proc.on('error', (error) => {
          if (!resolved) {
            log(`ERROR spawning lif_converter: ${error.message}`);
            handleCompletion(false, `Failed to start converter: ${error.message}`);
          }
        });

        // Fallback timeout (should rarely be needed now)
        const fallbackTimeout = setTimeout(() => {
          if (!resolved && conversionStarted) {
            log(`⏰ Conversion taking longer than expected, checking for output file...`);
            if (fs.existsSync(outP)) {
              const stats = fs.statSync(outP);
              if (stats.size > 0) {
                log(`📁 Found output file despite timeout, assuming success`);
                handleCompletion(true);
              }
            }
          }
        }, 60000); // 60 second fallback

        // Clear fallback timeout when resolved
        const originalResolve = resolve;
        resolve = () => {
          clearTimeout(fallbackTimeout);
          originalResolve();
        };
      });

      log('Conversion completed, ready for next message');

    } catch (error) {
      log(`ERROR in main loop: ${error.message}`);
      sendMsg({ error: `Host error: ${error.message}` });
    }
  }
}

// Start the main loop
mainLoop();
