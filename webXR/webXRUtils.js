// webXrUtils.js

import * as THREE from 'three';

export function computeVirtualDisplay(xrCam, referenceSpace) {
    const leftCam = xrCam.cameras[0];  // Left eye
    const rightCam = xrCam.cameras[1]; // Right eye

    // Extract position & FOV values
    const x0 = leftCam.position.x, y0 = leftCam.position.y, z0 = leftCam.position.z;
    const x1 = rightCam.position.x, y1 = rightCam.position.y, z1 = rightCam.position.z;

    // Left camera FOV handling
    let u0, d0, r0, l0;
    if (typeof leftCam.fov === 'object' && 'upDegrees' in leftCam.fov) {
        // Real XR device (asymmetric FOV)
        u0 = Math.tan(leftCam.fov.upDegrees * Math.PI / 180);
        d0 = Math.tan(leftCam.fov.downDegrees * Math.PI / 180);
        r0 = Math.tan(leftCam.fov.rightDegrees * Math.PI / 180);
        l0 = Math.tan(leftCam.fov.leftDegrees * Math.PI / 180);
    } else if (typeof leftCam.fov === 'number') {
        // Polyfill (symmetric FOV)
        const fov0 = leftCam.fov;
        u0 = Math.tan((fov0 / 2) * Math.PI / 180);
        d0 = Math.tan((fov0 / 2) * Math.PI / 180);
        r0 = Math.tan((fov0 / 2) * Math.PI / 180);
        l0 = Math.tan((fov0 / 2) * Math.PI / 180);
    }

    // Right camera FOV handling
    let u1, d1, r1, l1;
    if (typeof rightCam.fov === 'object' && 'upDegrees' in rightCam.fov) {
        // Real XR device (asymmetric FOV)
        u1 = Math.tan(rightCam.fov.upDegrees * Math.PI / 180);
        d1 = Math.tan(rightCam.fov.downDegrees * Math.PI / 180);
        r1 = Math.tan(rightCam.fov.rightDegrees * Math.PI / 180);
        l1 = Math.tan(rightCam.fov.leftDegrees * Math.PI / 180);
    } else if (typeof rightCam.fov === 'number') {
        // Polyfill (symmetric FOV)
        const fov1 = rightCam.fov;
        u1 = Math.tan((fov1 / 2) * Math.PI / 180);
        d1 = Math.tan((fov1 / 2) * Math.PI / 180);
        r1 = Math.tan((fov1 / 2) * Math.PI / 180);
        l1 = Math.tan((fov1 / 2) * Math.PI / 180);
    }

    // Compute frustum differences
    const deltaL = r0 - l0;
    const deltaR = r1 - l1;
    const deltaU = u0 - d0;
    const deltaD = u1 - d1;

    // Check for infinite display case
    let zd_local;
    const isInfinite = Math.abs(deltaL - deltaR) < 1e-6;

    if (isInfinite) {
        zd_local = 1e6;  // Place the display at a very large distance
    } else {
        zd_local = (x1 + z1 * deltaR - x0 - z0 * deltaL) / (deltaR - deltaL);
    }

    // Compute Display Pose (xd, yd) in XrCam local space
    const xd_local = isInfinite ? (x0 + x1) / 2 - zd_local * (deltaL + deltaR) / 2 :
        ((deltaR * (x0 + z0 * deltaL)) - (deltaL * (x1 + z1 * deltaR))) / (deltaR - deltaL);

    const yd_local = isInfinite ? (y0 + y1) / 2 - zd_local * (deltaU + deltaD) / 2 :
        ((deltaD * (y0 + z0 * deltaU)) - (deltaU * (y1 + z1 * deltaD))) / (deltaD - deltaU);

    // Compute Display Size (W, H)
    const W = Math.abs(((z0 - zd_local) * (l0 + r0) + (z1 - zd_local) * (l1 + r1)) / 2);
    const H = Math.abs(((z0 - zd_local) * (u0 + d0) + (z1 - zd_local) * (u1 + d1)) / 2);

    // Transform the display pose into world space
    const displayPosition = new THREE.Vector3(xd_local, yd_local, zd_local);
    displayPosition.applyMatrix4(xrCam.matrixWorld); // Convert to world space

    // Extract camera orientation
    const displayRotation = new THREE.Quaternion();
    displayRotation.setFromRotationMatrix(xrCam.matrixWorld);

    // Convert to XRRigidTransform
    const displayTransform = new XRRigidTransform(
        { x: displayPosition.x, y: displayPosition.y, z: displayPosition.z },
        { x: displayRotation.x, y: displayRotation.y, z: displayRotation.z, w: displayRotation.w }
    );

    // Return display pose and size in the reference space
    return {
        pose: referenceSpace.getOffsetReferenceSpace(displayTransform),
        size: { width: W, height: H },
        isInfinite: isInfinite
    };
}