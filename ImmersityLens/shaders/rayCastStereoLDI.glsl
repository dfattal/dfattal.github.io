precision highp float;

#ifdef GL_ES
varying highp vec2 v_texcoord;
#else
in vec2 v_texcoord;
#endif

uniform vec2 iResOriginal;
uniform float uTime;

// info view L
uniform sampler2D uImageL[4]; // for LDI this is an array
uniform sampler2D uDisparityMapL[4]; // for LDI this is an array
uniform float invZminL[4], invZmaxL[4]; // used to get invZ
uniform vec3 uViewPositionL; // in normalized camera space, common to all layers, "C1"
uniform vec2 sk1L, sl1L; // common to all layers
uniform float roll1L; // common to all layers, f1 in px
uniform float f1L[4]; // f per layer
uniform vec2 iResL[4];

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
// add originalF
uniform int uNumLayersR;

// info rendering params
uniform vec3 uFacePosition; // in normalized camera space
uniform vec2 sk2, sl2;
uniform float roll2, f2; // f2 in px
uniform vec2 oRes; // viewport resolution in px
uniform float feathering;
uniform vec4 background; // background color

/*vec4 texture2(sampler2D iChannel, vec2 coord) {
    ivec2 ivec = ivec2(int(coord.x * iRes.x),  // asssuming all input textures are of same size
                       int(coord.y * iRes.y));
    return texelFetch(iChannel, ivec, 0);
}*/
#define texture texture2D

//float edge = feathering;
// vec3 background = vec3(1.0);
float taper(vec2 uv) {
    return smoothstep(0.0, feathering, uv.x) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.x)) * smoothstep(0.0, feathering, uv.y) * (1.0 - smoothstep(1.0 - feathering, 1.0, uv.y));
    //float r2 = pow(2.0*uv.x-1.0,2.0)+pow(2.0*uv.y-1.0,2.0);
    //return 1.0-smoothstep(0.64,1.0,r2);
}

vec3 readColor(sampler2D iChannel, vec2 uv) {
    // return texture(iChannel, uv).rgb * taper(uv) + 0.1 * (1.0 - taper(uv));
    return texture(iChannel, uv).rgb;
}

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

float isMaskAround_get_val(vec2 xy, sampler2D tex, vec2 iRes) {
    return texture(tex, xy).a;
}

// Multiview weighting
float weight2(vec3 C, vec3 C1, vec3 C2) {

    // generalizes weightR for arbitrary 2 views blending
    return smoothstep(0.0, 1.0, dot(C2 - C1, C - C1) / dot(C2 - C1, C2 - C1));

}

// Action !
vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float invZmin, float invZmax, vec2 iRes, float t, out float invZ2, out float confidence) {

    // s2 is normalized xy coordinate for synthesized view, centered at 0 so values in -0.5..0.5

    const int numsteps = 40;
    float numsteps_float = float(numsteps);

    float invZ = invZmin; // starting point for invZ search
    float dinvZ = (invZmin - invZmax) / numsteps_float; // dividing the step into 40 steps
    float invZminT = invZ * (1.0 - t); // for animation
    invZ += dinvZ; // step back once before start

    //vec2 s1 = s2; // inititalize s1
    invZ2 = 0.0; // initialize invZ2
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

    confidence = 1.0;
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
                confidence = 0.0;
            invZ += dinvZ; // step back
            s1 += ds1;
            dinvZ /= 2.0; // increase precision
            ds1 /= 2.0;
        }

    }
    if((abs(s1.x) < 0.5) && (abs(s1.y) < 0.5) && (invZ2 >= 0.0) && (invZ > invZminT)) {
    //if ((abs(s1.x*adjustAr(iChannelResolution[0].xy,iResolution.xy).x)<0.495)&&(abs(s1.y*adjustAr(iChannelResolution[0].xy,iResolution.xy).y)<0.495)&&(invZ2>0.0)) {
        // if(uNumLayers == 0) { // non-ldi
        //     return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5));
        // }
//
        if(isMaskAround(s1 + .5, iChannelDisp, iRes))
            return vec4(0.0); // option b) original. 0.0 - masked pixel
        return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5)); // 1.0 - non masked pixel
        // return vec4(readColor(iChannelCol, s1 + .5), taper(s1 + .5) * isMaskAround_get_val(s1 + .5, iChannelDisp, iRes));
    } else {
        invZ2 = 0.0;
        // confidence = 0.0;
        return vec4(background.rgb, 0.0);
    }
}

void main(void) {

    // gl_FragColor = vec4(1.0,0.0,0.0,1.0);
    // return;

    vec2 uv = v_texcoord;

    // Optional: Window at invZmin
    float s = min(oRes.x, oRes.y) / min(iResOriginal.x, iResOriginal.y);
    vec2 newDim = iResOriginal * s / oRes;

    if((abs(uv.x - .5) < .5 * newDim.x) && (abs(uv.y - .5) < .5 * newDim.y)) {

        vec3 C1L = uViewPositionL;
        mat3 SKR1L = matFromSkew(sk1L) * matFromRoll(roll1L) * matFromSlant(sl1L); // Notice the focal part is missing, changes per layer

        vec3 C1R = uViewPositionR;
        mat3 SKR1R = matFromSkew(sk1R) * matFromRoll(roll1R) * matFromSlant(sl1R); // Notice the focal part is missing, changes per layer

        vec3 C2 = uFacePosition;
        mat3 FSKR2 = matFromFocal(vec2(f2 / oRes.x, f2 / oRes.y)) * matFromSkew(sk2) * matFromRoll(roll2) * matFromSlant(sl2);

        // LDI
        vec4 resultL, resultR, result, layer;
        float invZL = 0.0;
        float invZR = 0.0;
        float invZ = 0.0;
        float aL, aR;

        float wR = weight2(C2, C1L, C1R);

        vec4 layer1L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[0] / iResL[0].x, f1L[0] / iResL[0].y)) * SKR1L, C1L, uImageL[0], uDisparityMapL[0], invZminL[0], invZmaxL[0], iResL[0], 1.0, invZL, aL);
        vec4 layer1R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[0] / iResR[0].x, f1R[0] / iResR[0].y)) * SKR1R, C1R, uImageR[0], uDisparityMapR[0], invZminR[0], invZmaxR[0], iResR[0], 1.0, invZR, aR);
        if((aL == 0.0) && (aR == 1.0) || (layer1L.a < layer1R.a-.1)) {
            layer1L = layer1R;
            // layer1L.r = 1.0;
            invZ = invZR;
        }
        if((aR == 0.0) && (aL == 1.0) || (layer1R.a < layer1L.a-.1)) {
            layer1R = layer1L;
            // layer1R.b = 1.0;
            invZ = invZL;
        }
        layer = (1.0 - wR) * layer1L + wR * layer1R;
        result = layer;
        result.rgb *= result.a; // amount of light emitted by the layer
        if(!(result.a == 1.0 || uNumLayersL == 1)) {
            vec4 layer2L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[1] / iResL[1].x, f1L[1] / iResL[1].y)) * SKR1L, C1L, uImageL[1], uDisparityMapL[1], invZminL[1], invZmaxL[1], iResL[1], 1.0, invZL, aL);
            vec4 layer2R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[1] / iResR[1].x, f1R[1] / iResR[1].y)) * SKR1R, C1R, uImageR[1], uDisparityMapR[1], invZminR[1], invZmaxR[1], iResR[1], 1.0, invZR, aR);
            if((aL == 0.0) && (aR == 1.0) || (layer2L.a < layer2R.a-.1)) {
                layer2L = layer2R;
                // layer2L.r = 1.0;
                invZ = invZR;
            }
            if((aR == 0.0) && (aL == 1.0) || (layer2R.a < layer2L.a-.1)) {
                layer2R = layer2L;
                // layer2R.b = 1.0;
                invZ = invZL;
            }
            layer = (1.0 - wR) * layer2L + wR * layer2R;
            result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
            result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
            if(!(result.a == 1.0 || uNumLayersL == 2)) {
                vec4 layer3L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[2] / iResL[2].x, f1L[2] / iResL[2].y)) * SKR1L, C1L, uImageL[2], uDisparityMapL[2], invZminL[2], invZmaxL[2], iResL[2], 1.0, invZL, aL);
                vec4 layer3R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[2] / iResR[2].x, f1R[2] / iResR[2].y)) * SKR1R, C1R, uImageR[2], uDisparityMapR[2], invZminR[2], invZmaxR[2], iResR[2], 1.0, invZR, aR);
                if((aL == 0.0) && (aR == 1.0) || (layer3L.a < layer3R.a-.1)) {
                    layer3L = layer3R;
                    // layer3L.r = 1.0;
                    invZ = invZR;
                }
                if((aR == 0.0) && (aL == 1.0) || (layer3R.a < layer3L.a-.1)) {
                    layer3R = layer3L;
                    // layer3R.b = 1.0;
                    invZ = invZL;
                }
                layer = (1.0 - wR) * layer3L + wR * layer3R;
                result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
                result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
                if(!(result.a == 1.0 || uNumLayersL == 3)) {
                    vec4 layer4L = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1L[3] / iResL[3].x, f1L[3] / iResL[3].y)) * SKR1L, C1L, uImageL[3], uDisparityMapL[3], invZminL[3], invZmaxL[3], iResL[3], 1.0, invZL, aL);
                    vec4 layer4R = raycasting(uv - 0.5, FSKR2, C2, matFromFocal(vec2(f1R[3] / iResR[3].x, f1R[3] / iResR[3].y)) * SKR1R, C1R, uImageR[3], uDisparityMapR[3], invZminR[3], invZmaxR[3], iResR[3], 1.0, invZR, aR);
                    if((aL == 0.0) && (aR == 1.0) || (layer4L.a < layer4R.a-.1)) {
                        layer4L = layer4R;
                        // layer4L.r = 1.0;
                        invZ = invZR;
                    }
                    if((aR == 0.0) && (aL == 1.0) || (layer4R.a < layer4L.a-.1)) {
                        layer4R = layer4L;
                        // layer4R.b = 1.0;
                        invZ = invZL;
                    }
                    layer = (1.0 - wR) * layer4L + wR * layer4R;
                    result.rgb = result.rgb + (1.0 - result.a) * layer.a * layer.rgb; // Blend background with with layer2
                    result.a = layer.a + result.a * (1.0 - layer.a); // Blend alpha
                }

            }
        }

        // Blend with the background
        result.rgb = background.rgb * background.a * (1.0 - result.a) + result.rgb;
        result.a = background.a + result.a * (1.0 - background.a); // Blend alpha

        gl_FragColor = result;

    } else {
        gl_FragColor = background;
    }
}
