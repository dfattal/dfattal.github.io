#!/usr/bin/env node
// test_host.js - Test script for host.js using Chrome's native messaging protocol

const { spawn } = require('child_process');

function testHost() {
    console.log('🧪 Testing host.js with ping message...');

    const hostPath = '/Users/david.fattal/Documents/Coding/lif_ldi_mac_0.1/host.js';
    const host = spawn('node', [hostPath], {
        stdio: ['pipe', 'pipe', 'inherit']
    });

    // Create ping message in Chrome's native messaging format
    const message = JSON.stringify({ type: 'ping' });
    const messageBuffer = Buffer.from(message);
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

    console.log(`📤 Sending ping message (${messageBuffer.length} bytes): ${message}`);

    // Send length prefix + message
    host.stdin.write(lengthBuffer);
    host.stdin.write(messageBuffer);

    // Read response
    let responseData = Buffer.alloc(0);

    host.stdout.on('data', (data) => {
        responseData = Buffer.concat([responseData, data]);

        // Try to read complete response
        if (responseData.length >= 4) {
            const responseLength = responseData.readUInt32LE(0);
            if (responseData.length >= 4 + responseLength) {
                const responseMessage = responseData.slice(4, 4 + responseLength).toString();
                console.log(`📥 Received response (${responseLength} bytes): ${responseMessage}`);

                try {
                    const parsed = JSON.parse(responseMessage);
                    if (parsed.pong) {
                        console.log('✅ SUCCESS: Host responded with pong!');
                    } else if (parsed.error) {
                        console.log('⚠️ WARNING: Host responded with error:', parsed.error);
                    } else {
                        console.log('❓ UNEXPECTED: Host response:', parsed);
                    }
                } catch (e) {
                    console.log('❌ ERROR: Could not parse response JSON');
                }

                host.kill();
            }
        }
    });

    host.on('error', (error) => {
        console.log('❌ ERROR: Failed to spawn host:', error.message);
    });

    host.on('exit', (code) => {
        console.log(`🔚 Host exited with code: ${code}`);
    });

    // Timeout
    setTimeout(() => {
        console.log('⏰ TIMEOUT: No response after 5 seconds');
        host.kill();
    }, 5000);
}

testHost(); 