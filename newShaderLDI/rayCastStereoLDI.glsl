precision highp float;

#ifdef GL_ES
varying highp vec2 UV;
#else
in vec2 UV;
#endif

// info view L
uniform sampler2D uImageL[4]; // for LDI this is an array
uniform sampler2D uDisparityMapL[4]; // for LDI this is an array
uniform float invZminL[4], invZmaxL[4]; // used to get invZ
uniform vec3 uViewPositionL; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1L, sl1L; // common to all layers
uniform float roll1L; // common to all layers, f1 in px
uniform float f1L[4]; // f per layer
uniform vec2 iResL[4];
uniform vec2 iResOriginalL;
// add originalF
uniform int uNumLayersL;

// info view R
uniform sampler2D uImageR[4]; // for LDI this is an array
uniform sampler2D uDisparityMapR[4]; // for LDI this is an array
uniform float invZminR[4], invZmaxR[4]; // used to get invZ
uniform vec3 uViewPositionR; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1R, sl1R; // common to all layers
uniform float roll1R; // common to all layers, f1 in px
uniform float f1R[4]; // f per layer
uniform vec2 iResR[4];
uniform vec2 iResOriginalR;
// add originalF
uniform int uNumLayersR;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px

/*vec4 texture2(sampler2D iChannel, vec2 coord) {
    ivec2 ivec = ivec2(int(coord.x * iRes.x),  // asssuming all input textures are of same size
                       int(coord.y * iRes.y));
    return texelFetch(iChannel, ivec, 0);
}*/
#define texture texture2D

float taper(vec2 uv) {
    //return smoothstep(0.0, 0.1, uv.x) * (1.0 - smoothstep(0.9, 1.0, uv.x)) * smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
    return smoothstep(0.0, 0.1, uv.y) * (1.0 - smoothstep(0.9, 1.0, uv.y));
    //float r2 = pow(2.0*uv.x-1.0,2.0)+pow(2.0*uv.y-1.0,2.0);
    //return 1.0-smoothstep(0.64,1.0,r2);
}

vec3 readColor(sampler2D iChannel, vec2 uv) {
    return texture(iChannel, uv).rgb * taper(uv) + 0.1 * (1.0 - taper(uv));
}
// vec3 readColor(sampler2D iChannel, vec2 uv) {
//     return texture(iChannel, uv).rgb;
// }
float readDisp(sampler2D iChannel, vec2 uv, float vMin, float vMax, vec2 iRes) {
    return texture(iChannel, vec2(clamp(uv.x, 2.0 / iRes.x, 1.0 - 2.0 / iRes.x), clamp(uv.y, 2.0 / iRes.y, 1.0 - 2.0 / iRes.y))).x * (vMin - vMax) + vMax;
}

mat3 matFromSlant(vec2 sl) {

    // builds rotation matrix from slant (tangent space) info
    float invsqx = 1.0 / sqrt(1.0 + sl.x * sl.x);
    float invsqy = 1.0 / sqrt(1.0 + sl.y * sl.y);
    float invsq = 1.0 / sqrt(1.0 + sl.x * sl.x + sl.y * sl.y);

    return mat3(invsqx, 0.0, sl.x * invsq, 0.0, invsqy, sl.y * invsq, -sl.x * invsqx, -sl.y * invsqy, invsq);
}

mat3 matFromRoll(float th) {

    // builds rotation matrix from roll angle
    float PI = 3.141593;
    float c = cos(th * PI / 180.0);
    float s = sin(th * PI / 180.0);

    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

mat3 matFromSkew(vec2 sk) {

    // builds frustum skew matrix from tangent angles
    return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, -sk.x, -sk.y, 1.0);

}

mat3 matFromFocal(vec2 fxy) {

    // builds focal matrix
    // includes correction for aspect ratio since f expressed in fraction image width
    return mat3(fxy.x, 0.0, 0.0, 0.0, fxy.y, 0.0, 0.0, 0.0, 1.0);
}

#ifdef GL_ES
// Matrix Math
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
#endif

bool isMaskAround(vec2 xy, sampler2D tex, vec2 iRes) {
    for(float x = -1.0; x <= 1.0; x += 1.0) {
        for(float y = -1.0; y <= 1.0; y += 1.0) {
            const float maskDilation = 1.5; // prevents some edge artifacts, especially helpful for resized textures
            vec2 offset_xy = xy + maskDilation * vec2(x, y) / iRes;
            if(texture(tex, offset_xy).a < 0.5) {
                return true;
            }
        }
    }
    return false;
}

// Multiview weighting
float weight2(vec3 C, vec3 C1, vec3 C2) {

    // generalizes weightR for arbitrary 2 views blending
    return smoothstep(0.0, 1.0, dot(C2 - C1, C - C1) / dot(C2 - C1, C2 - C1));

}

// Action !
vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t, out float invZ2) {

    // s2 is normalized xy coordinate for synthesized view, centered at 0 so values in -0.5..0.5

    const int numsteps = 40;
    float numsteps_float = float(numsteps);

    float invZ = invZmin; // starting point for invZ search
    float dinvZ = (invZmin - invZmax) / numsteps_float; // dividing the step into 40 steps
    float invZminT = invZ * (1.0 - t); // for animation
    invZ += dinvZ; // step back once before start

    //vec2 s1 = s2; // inititalize s1
    //float invZ2 = 0.0; // initialize invZ2
    float disp = 0.0; //initialize disp
    float oldDisp = 0.0;
    float gradDisp = 0.0;
    float gradThr = 0.02 * (invZmin - invZmax) * 140.0 / numsteps_float;

    vec3 nor = vec3(0.0);

    mat3 P = FSKR1 * inverse(FSKR2);
    vec3 C = FSKR1 * (C2 - C1);

    // extract matrix blocks
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;

    vec2 s1 = C.xy * invZ + (1.0 - C.z * invZ) * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz); // starting point for s1
    vec2 ds1 = (C.xy - C.z * (Pxyxy * s2 + Pxyz) / (dot(Pzxy, s2) + Pzz)) * dinvZ; // initial s1 step size

    float alpha = 0.0;
    // 40 steps
    for(int i = 0; i < numsteps; i++) {

        invZ -= dinvZ; // step forward
        s1 -= ds1;

        //s1 = C.xy*invZ + (1.0 - C.z*invZ)*(Pxyxy*s2 + Pxyz)/(dot(Pzxy,s2) + Pzz);

        disp = readDisp(iChannelDisp, s1 + .5, invZmin, invZmax, iRes);
        gradDisp = disp - oldDisp;
        oldDisp = disp;
        invZ2 = invZ * (dot(Pzxy, s2) + Pzz) / (1.0 - C.z * invZ);
        if((disp > invZ) && (invZ2 > 0.0)) { // if ray is below the "virtual surface"...
            if(abs(gradDisp) > gradThr)
                alpha = -100.0;
            invZ += dinvZ; // step back
            s1 += ds1;
            dinvZ /= 2.0; // increase precision
            ds1 /= 2.0;
        }

    }
    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 > 0.0) && (invZ > invZminT)) {
    //if ((abs(s1.x*adjustAr(iChannelResolution[0].xy,iResolution.xy).x)<0.495)&&(abs(s1.y*adjustAr(iChannelResolution[0].xy,iResolution.xy).y)<0.495)&&(invZ2>0.0)) {
        // if(uNumLayers == 0) { // non-ldi
        //     return vec4(readColor(iChannelCol, s1 + .5), alpha * invZ2);
        // }
        invZ2 += alpha;
        if(isMaskAround(s1 + .5, iChannelDisp, iRes))
            return vec4(vec3(0.1), 0.0); // option b) original. 0.0 - masked pixel
        return vec4(readColor(iChannelCol, s1 + .5), 1.0); // 1.0 - non masked pixel
    } else {
        return vec4(vec3(0.1), 0.0);
        invZ2 = -100.0;
    }
}

void main(void) {

    // gl_FragColor = vec4(1.0,0.0,0.0,1.0);
    // return;

    vec2 uv = UV;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginalL.x, iResOriginalL.y);
    vec2 newDim = iResOriginalL * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {

        vec3 C1L = uViewPositionL;
        mat3 SKR1L = matFromSkew(sk1L) * matFromRoll(roll1L) * matFromSlant(sl1L); // Notice the focal part is missing, changes per layer

        vec3 C1R = uViewPositionR;
        mat3 SKR1R = matFromSkew(sk1R) * matFromRoll(roll1R) * matFromSlant(sl1R); // Notice the focal part is missing, changes per layer

        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);

        // LDI
        vec4 resultL, resultR;
        float invZL, invZR = 0.0;

        vec4 layer1L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[0] / iResL[0].x, f1L[0] / iResL[0].y)) * SKR1L, C1L, uImageL[0], uDisparityMapL[0], invZminL[0], invZmaxL[0], iResL[0], 1.0, invZL);
        //fragColor = vec4(layer1.a); return; // to debug alpha of top layer
        if(layer1L.a == 1.0 || uNumLayersL == 1) {
            resultL = layer1L;
            invZL += 100.0;
        } else {
            vec4 layer2L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[1] / iResL[1].x, f1L[1] / iResL[1].y)) * SKR1L, C1L, uImageL[1], uDisparityMapL[1], invZminL[1], invZmaxL[1], iResL[1], 1.0, invZL) * (1.0 - layer1L.w) + layer1L * layer1L.w;
            if(layer2L.a == 1.0 || uNumLayersL == 2) {
                resultL = layer2L;
            } else {
                vec4 layer3L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[2] / iResL[2].x, f1L[2] / iResL[2].y)) * SKR1L, C1L, uImageL[2], uDisparityMapL[2], invZminL[2], invZmaxL[2], iResL[2], 1.0, invZL) * (1.0 - layer2L.w) + layer2L * layer2L.w;
                if(layer3L.a == 1.0 || uNumLayersL == 3) {
                    resultL = layer3L;
                } else {
                    vec4 layer4L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[3] / iResL[3].x, f1L[3] / iResL[3].y)) * SKR1L, C1L, uImageL[3], uDisparityMapL[3], invZminL[3], invZmaxL[3], iResL[3], 1.0, invZL) * (1.0 - layer3L.w) + layer3L * layer3L.w;
                    if(uNumLayersL == 4) {
                        resultL = layer4L;
                    }
                }
            }
        }

        vec4 layer1R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[0] / iResR[0].x, f1R[0] / iResR[0].y)) * SKR1R, C1R, uImageR[0], uDisparityMapR[0], invZminR[0], invZmaxR[0], iResR[0], 1.0, invZR);
        //fragColor = vec4(layer1.a); return; // to debug alpha of top layer
        if(layer1R.a == 1.0 || uNumLayersR == 1) {
            resultR = layer1R;
            invZR += 100.0;
        } else {
            vec4 layer2R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[1] / iResR[1].x, f1R[1] / iResR[1].y)) * SKR1R, C1R, uImageR[1], uDisparityMapR[1], invZminR[1], invZmaxR[1], iResR[1], 1.0, invZR) * (1.0 - layer1R.w) + layer1R * layer1R.w;
            if(layer2R.a == 1.0 || uNumLayersR == 2) {
                resultR = layer2R;
            } else {
                vec4 layer3R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[2] / iResR[2].x, f1R[2] / iResR[2].y)) * SKR1R, C1R, uImageR[2], uDisparityMapR[2], invZminR[2], invZmaxR[2], iResR[2], 1.0, invZR) * (1.0 - layer2R.w) + layer2R * layer2R.w;
                if(layer3R.a == 1.0 || uNumLayersR == 3) {
                    resultR = layer3R;
                } else {
                    vec4 layer4R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[3] / iResR[3].x, f1R[3] / iResR[3].y)) * SKR1R, C1R, uImageR[3], uDisparityMapR[3], invZminR[3], invZmaxR[3], iResR[3], 1.0, invZR) * (1.0 - layer3R.w) + layer3R * layer3R.w;
                    if(uNumLayersR == 4) {
                        resultR = layer4R;
                    }
                }
            }
        }

        float wR = weight2(C2, C1L, C1R);

        vec4 result = (1.0 - wR) * resultL + wR * resultR;

        // if(invZR < -50.0 || invZL > invZR + 0.01)
        //     result = resultL;
        // if(invZL < -50.0 || invZR > invZL + 0.01)
        //     result = resultR;    

        if(invZL - invZR >= 100.0)
            result = resultL;
        if(invZR - invZL >= 100.0)
            result = resultR;

        gl_FragColor = vec4(result.rgb, 1.0);
        //gl_FragColor = vec4(vec3(invZL,invZR,invZL)/.15, 1.0);

    } else {
        gl_FragColor = vec4(vec3(0.1), 1.0);
    }
}
