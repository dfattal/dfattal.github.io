precision highp float;

varying highp vec2 v_texcoord;

uniform vec2 iResOriginal;
uniform float uTime;

// info views
uniform sampler2D uRGBD; // Single texture with quad layout: TL=L1 RGB, TR=L1 disp, BL=L2 RGB, BR=L2 disp
uniform float invZmin[4], invZmax[4]; // used to get invZ
uniform vec3 uViewPosition; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1, sl1; // common to all layers
uniform float roll1; // common to all layers, f1 in px
uniform float f1[4]; // f per layer
uniform vec2 iRes[4];
uniform int uNumLayers;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px
uniform float feathering; // Feathering factor for smooth transitions at the edges

uniform vec4 background; // background color
uniform float uThreshold; // Threshold for layer 0 alpha (disparity < threshold = transparent)

#define texture texture2D

float taper(vec2 uv) {
    return smoothstep(0.0, feathering, uv.x) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.x)) * smoothstep(0.0, feathering, uv.y) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.y));
}

vec3 readColor(sampler2D iChannel, vec2 uv, int layer) {
    vec2 color_uv;
    if (layer == 0) {
        // Layer 0: top-left quadrant
        color_uv = vec2(uv.x * 0.5, uv.y * 0.5 +0.5);
    } else {
        // Layer 1: bottom-left quadrant
        color_uv = vec2(uv.x * 0.5,  uv.y * 0.5);
    }
    return texture(iChannel, color_uv).rgb;
}

float readDisp(sampler2D iChannel, vec2 uv, float vMin, float vMax, vec2 iRes, int layer) {
    vec2 disp_uv;
    if (layer == 0) {
        // Layer 0: top-right quadrant
        disp_uv = vec2(0.5 + uv.x * 0.5, uv.y * 0.5 +0.5);
        disp_uv = clamp(disp_uv, vec2(0.5, 0.5), vec2(1.0, 1.0));
    } else {
        // Layer 1: bottom-right quadrant
        disp_uv = vec2(0.5 + uv.x * 0.5, uv.y * 0.5);
        disp_uv = clamp(disp_uv, vec2(0.5, 0.0), vec2(1.0, 0.5));
    }
    return texture(iChannel, disp_uv).x * (vMin - vMax) + vMax;
}

float readMask(sampler2D iChannel, vec2 uv, int layer, float threshold) {
    vec2 mask_uv;
    if (layer == 0) {
        // Layer 0: top-right quadrant
        mask_uv = vec2(0.5 + uv.x * 0.5, uv.y * 0.5 + 0.5);
    } else {
        // Layer 1: bottom-right quadrant
        mask_uv = vec2(0.5 + uv.x * 0.5, uv.y * 0.5);
    }
    return texture(iChannel, mask_uv).x > threshold ? 1.0 : 0.0;
}

mat3 matFromSlant(vec2 sl) {
    float invsqx = 1.0 / sqrt(1.0 + sl.x * sl.x);
    float invsqy = 1.0 / sqrt(1.0 + sl.y * sl.y);
    float invsq = 1.0 / sqrt(1.0 + sl.x * sl.x + sl.y * sl.y);
    return mat3(invsqx, 0.0, sl.x * invsq, 0.0, invsqy, sl.y * invsq, -sl.x * invsqx, -sl.y * invsqy, invsq);
}

mat3 matFromRoll(float th) {
    float PI = 3.141593;
    float c = cos(th * PI / 180.0);
    float s = sin(th * PI / 180.0);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

mat3 matFromSkew(vec2 sk) {
    return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -sk.x, -sk.y, 1.0);
}

mat3 matFromFocal(vec2 fxy) {
    return mat3(fxy.x, 0.0, 0.0, 0.0, fxy.y, 0.0, 0.0, 0.0, 1.0);
}

float det(mat2 matrix) {
    return matrix[0].x * matrix[1].y - matrix[0].y * matrix[1].x;
}

mat3 transpose_m(mat3 matrix) {
    return mat3(vec3(matrix[0].x, matrix[1].x, matrix[2].x), vec3(matrix[0].y, matrix[1].y, matrix[2].y), vec3(matrix[0].z, matrix[1].z, matrix[2].z));
}

mat3 inverseMat(mat3 matrix) {
    vec3 row0 = matrix[0];
    vec3 row1 = matrix[1];
    vec3 row2 = matrix[2];
    vec3 minors0 = vec3(det(mat2(row1.y, row1.z, row2.y, row2.z)), det(mat2(row1.z, row1.x, row2.z, row2.x)), det(mat2(row1.x, row1.y, row2.x, row2.y)));
    vec3 minors1 = vec3(det(mat2(row2.y, row2.z, row0.y, row0.z)), det(mat2(row2.z, row2.x, row0.z, row0.x)), det(mat2(row2.x, row2.y, row0.x, row0.y)));
    vec3 minors2 = vec3(det(mat2(row0.y, row0.z, row1.y, row1.z)), det(mat2(row0.z, row0.x, row1.z, row1.x)), det(mat2(row0.x, row0.y, row1.x, row1.y)));
    mat3 adj = transpose_m(mat3(minors0, minors1, minors2));
    return (1.0 / dot(row0, minors0)) * adj;
}
#define inverse inverseMat

vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t, int layer, out float invZ2, out float confidence) {
    const int numsteps = 40;
    float numsteps_float = float(numsteps);
    float invZ = invZmin;
    float dinvZ = (invZmin - invZmax) / numsteps_float;
    float invZminT = invZ * (1.0 - t);
    invZ += dinvZ;
    invZ2 = 0.0;
    float disp = 0.0;
    float oldDisp = 0.0;
    float gradDisp = 0.0;
    float gradThr = 0.02 * (invZmin - invZmax) * 140.0 / numsteps_float;
    mat3 P = FSKR1 * inverse(FSKR2);
    vec3 C = FSKR1 * (C2 - C1);
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;
    vec2 s1 = C.xy * invZ + (1.0 - C.z * invZ) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz);
    vec2 ds1 = (C.xy - C.z * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz)) * dinvZ;
    confidence = 1.0;
    for(int i = 0; i < numsteps; i++) {
        invZ -= dinvZ;
        s1 -= ds1;
        disp = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes, layer);
        gradDisp = disp - oldDisp;
        oldDisp = disp;
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);
        if((disp > invZ) && (invZ2 > 0.0)) {
            if(abs(gradDisp) > gradThr)
                confidence = 0.0;
            invZ += dinvZ;
            s1 += ds1;
            dinvZ /= 2.0;
            ds1 /= 2.0;
        }
    }
    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 > 0.0) && (invZ > invZminT)) {
        float finalConfidence = taper(s1 + .5);

        // For layer 0, apply threshold-based alpha
        if(layer == 0) {
            float dispValue = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes, layer);
            float thresholdAlpha = readMask(iChannelDisp, s1 + .5, layer, uThreshold);
            finalConfidence *= thresholdAlpha;
        }
        // return vec4(vec3(texture(iChannelDisp, 0.5*(s1 + .5)+vec2(0.5,0.5)).x>0.22 ? 1.0 : 0.1), 1.0);
        // return vec4(vec3(finalConfidence), 1.0);
        return vec4(readColor(iChannelCol, s1 + .5, layer), finalConfidence);
    } else {
        invZ2 = 0.0;
        confidence = 0.0;
        return vec4(background.rgb, 0.0);
    }
}

void main(void) {
    vec2 uv = v_texcoord;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginal.x, iResOriginal.y);
    vec2 newDim = iResOriginal * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {
        vec3 C1 = uViewPosition;
        mat3 SKR1 = matFromSkew(sk1) * matFromRoll(roll1) * matFromSlant(sl1);
        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);
        float invZ, confidence;

        // Layer 0 (front layer with threshold-based alpha)
        vec4 layer0 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[0] / iRes[0].x, f1[0] / iRes[0].y)) * SKR1, C1, uRGBD, uRGBD, invZmin[0], invZmax[0], iRes[0], 1.0, 0, invZ, confidence);

        vec4 result = layer0;
        result.rgb *= result.a; // Premultiply alpha for proper compositing

        // Layer 1 (back layer) - only composite if layer 0 is not fully opaque
        if(!(result.a == 1.0 || uNumLayers == 1)) {
            vec4 layer1 = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1[1] / iRes[1].x, f1[1] / iRes[1].y)) * SKR1, C1, uRGBD, uRGBD, invZmin[1], invZmax[1], iRes[1], 1.0, 1, invZ, confidence);
            // vec4 layer1 = vec4(1.0, 0.0, 0.0, 1.0);
            // Composite layer 1 behind layer 0
            result.rgb = result.rgb + (1.0 - result.a) * layer1.a * layer1.rgb;
            result.a = layer1.a + result.a * (1.0 - layer1.a);
        }

        // Blend with the background
        result.rgb = background.rgb * background.a * (1.0 - result.a) + result.rgb;
        result.a = background.a + result.a * (1.0 - background.a);

        gl_FragColor = result;
    } else {
        gl_FragColor = background;
    }
}
