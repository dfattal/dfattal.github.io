//import * as tf from '@tensorflow/tfjs';
//import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

function calculateAverageKeypoint(filteredKeypoints) {
      if (filteredKeypoints.length === 0) {
        return { x: 0, y: 0, z: 0 }; // or handle the empty case as needed
      }
      const sum = filteredKeypoints.reduce((acc, keypoint) => {
        return {
          x: acc.x + keypoint.x,
          y: acc.y + keypoint.y,
          z: acc.z + keypoint.z
        };
      }, { x: 0, y: 0, z: 0 });

      return {
        x: sum.x / filteredKeypoints.length,
        y: sum.y / filteredKeypoints.length,
        z: sum.z / filteredKeypoints.length
      };
    }

async function setupCamera() {
  const video = document.getElementById('video');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function estimatePose() {
  const video = await setupCamera();
  video.play();

  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'tfjs',
  };
  const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');

  async function detect() {

    const estimationConfig = {flipHorizontal: false};
    const predictions = await detector.estimateFaces(video, estimationConfig);
    // Mirror the canvas horizontally
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (predictions.length > 0) {
      console.log(predictions);
      predictions.forEach((prediction) => {
        const keypoints = prediction.keypoints;

        // Calculate the center of the face
        const leftEyePts = keypoints.filter(keypoint => keypoint.name && keypoint.name === "leftEye");
        const rightEyePts = keypoints.filter(keypoint => keypoint.name && keypoint.name === "rightEye");
        const leftEye = calculateAverageKeypoint(leftEyePts);
        const rightEye = calculateAverageKeypoint(rightEyePts);

        // Calculate distances (Assuming average interocular distance is 63mm)
        const interocularDistance = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) +
          Math.pow(rightEye.y - leftEye.y, 2) +
          Math.pow(rightEye.z - leftEye.z, 2)
        );
        const focalLength = 640*1.0; // Focal length in pixels (estimated)
        const realInterocularDistance = 63; // Real interocular distance in mm

        const depth = (focalLength * realInterocularDistance) / interocularDistance;

        const faceCenterX = (leftEye.x + rightEye.x) / 2;
        const faceCenterY = (leftEye.y + rightEye.y) / 2;

        // Convert face center to world coordinates
        const x = -(faceCenterX - video.width / 2) * depth / focalLength;
        const y = -(faceCenterY - video.height / 2) * depth / focalLength;

        // Draw landmarks and pose
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'green';
        keypoints.forEach((keypoint) => {
          //console.log(keypoint.name);
          const [x, y] = [keypoint.x, keypoint.y];
          ctx.moveTo(x, y);
          ctx.arc(x, y, 1, 0, 2 * Math.PI);
        });
        ctx.stroke();
        ctx.beginPath();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'red';
        ctx.moveTo(leftEye.x, leftEye.y);
        ctx.arc(leftEye.x, leftEye.y, 1, 0, 2 * Math.PI);
        ctx.moveTo(rightEye.x, rightEye.y);
        ctx.arc(rightEye.x, rightEye.y, 1, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.restore();
        // Display the XYZ coordinates
        ctx.fillStyle = 'red';
        ctx.font = '12px Arial';
        ctx.fillText(`X: ${x.toFixed(2)} mm`, 10, 20);
        ctx.fillText(`Y: ${y.toFixed(2)} mm`, 10, 40);
        ctx.fillText(`Z: ${depth.toFixed(2)} mm`, 10, 60);
      });
    } else {
       ctx.restore();
    }


    requestAnimationFrame(detect);
  }

  detect();
}

estimatePose();
