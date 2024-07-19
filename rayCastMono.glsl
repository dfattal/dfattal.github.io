precision highp float;
varying highp vec2 vTextureCoord;
uniform sampler2D uImage;
uniform sampler2D uDisparityMap;
uniform vec3 uFacePosition;
uniform vec2 iRes, oRes;

/*vec4 texture2(sampler2D iChannel, vec2 coord) {
    ivec2 ivec = ivec2(int(coord.x * iRes.x),  // asssuming all input textures are of same size
                       int(coord.y * iRes.y));
    return texelFetch(iChannel, ivec, 0);
}*/
#define texture texture2D

const float vd = 600.0;
const float IO = 63.0;
const float f = 1.0;

vec2 adjustAr(vec2 iRes,vec2 oRes) {
    float s = min(iRes.x,iRes.y)/min(oRes.x,oRes.y);
    return s*oRes/iRes;
}

vec3 readColor(sampler2D iChannel, vec2 uv) { return texture(iChannel, uv).rgb; }
float readDisp(sampler2D iChannel, vec2 uv, float minDisp, float maxDisp) { return texture(iChannel, vec2(clamp(uv.x,2.0/iRes.x,1.0-2.0/iRes.x),clamp(uv.y,2.0/iRes.y,1.0-2.0/iRes.y))).x * (minDisp - maxDisp) + maxDisp; }

float disp2Color(float disp, float minDisp, float maxDisp) { return (disp-maxDisp)/(minDisp-maxDisp); }
float color2Disp(float col, float minDisp, float maxDisp) { return col * (minDisp - maxDisp) + maxDisp; }
float disp2invZ(float disp) { return -disp/f; } // returns 1/z
float invZ2Disp(float invZ) { return -f*invZ; } // returns disp

mat3 matFromSlant(vec2 sl) {

    // builds rotation matrix from slant (tangent space) info
    float invsqx = 1.0/sqrt(1.0+sl.x*sl.x);
    float invsqy = 1.0/sqrt(1.0+sl.y*sl.y);
    float invsq = 1.0/sqrt(1.0+sl.x*sl.x+sl.y*sl.y);

    return mat3(invsqx,0.0,sl.x*invsq,0.0,invsqy,sl.y*invsq,-sl.x*invsqx,-sl.y*invsqy,invsq);
}

mat3 matFromRoll(float th) {

    // builds rotation matrix from roll angle
    float PI = 3.141593;
    float c = cos(th*PI/180.0);
    float s = sin(th*PI/180.0);

    return mat3(c,s,0.0,-s,c,0.0,0.0,0.0,1.0);
}

mat3 matFromSkew(vec2 sk) {

    // builds frustum skew matrix from tangent angles
    return mat3(1.0,0.0,0.0,0.0,1.0,0.0,-sk.x,-sk.y,1.0);

}

mat3 matFromFocal(vec2 fxy) {

    // builds focal matrix
    // includes correction for aspect ratio since f expressed in fraction image width
    return mat3(fxy.x,0.0,0.0,0.0,fxy.y,0.0,0.0,0.0,1.0);
}

// Matrix Math
float det(mat2 matrix) {
    return matrix[0].x * matrix[1].y - matrix[0].y * matrix[1].x;
}

mat3 transpose_m(mat3 matrix){
    return mat3(
    vec3(matrix[0].x, matrix[1].x, matrix[2].x),
    vec3(matrix[0].y, matrix[1].y, matrix[2].y),
    vec3(matrix[0].z, matrix[1].z, matrix[2].z));
}

mat3 inverse(mat3 matrix) {
    vec3 row0 = matrix[0];
    vec3 row1 = matrix[1];
    vec3 row2 = matrix[2];
    vec3 minors0 = vec3(
    det(mat2(row1.y, row1.z, row2.y, row2.z)),
    det(mat2(row1.z, row1.x, row2.z, row2.x)),
    det(mat2(row1.x, row1.y, row2.x, row2.y))
    );
    vec3 minors1 = vec3(
    det(mat2(row2.y, row2.z, row0.y, row0.z)),
    det(mat2(row2.z, row2.x, row0.z, row0.x)),
    det(mat2(row2.x, row2.y, row0.x, row0.y))
    );
    vec3 minors2 = vec3(
    det(mat2(row0.y, row0.z, row1.y, row1.z)),
    det(mat2(row0.z, row0.x, row1.z, row1.x)),
    det(mat2(row0.x, row0.y, row1.x, row1.y))
    );
    mat3 adj = transpose_m(mat3(minors0, minors1, minors2));
    return (1.0 / dot(row0, minors0)) * adj;
}

// Action !

vec4 raycasting(vec2 s2, mat3 FSKR2, vec3 C2, mat3 FSKR1, vec3 C1, sampler2D iChannelCol, sampler2D iChannelDisp, float minDisp, float maxDisp, float t) {

    // s2 is normalized xy coordinate for synthesized view, centered at 0 so values in -0.5..0.5

    const int numsteps = 40;
    float numsteps_float = float(numsteps);

    float invZ = disp2invZ(minDisp); // starting point for invZ search
    float dinvZ = (invZ - disp2invZ(maxDisp)) / numsteps_float; // dividing the step into 40 steps
    float invZmin = invZ*(1.0-t); // for animation
    invZ += dinvZ; // step back once before start

    //vec2 s1 = s2; // inititalize s1
    float invZ2 = 0.0; // initialize invZ2
    float disp = 0.0; //initialize disp
    float oldDisp = 0.0;
    float gradDisp = 0.0;
    float gradThr = 0.02*(maxDisp-minDisp)*140.0/numsteps_float;

    vec3 nor = vec3(0.0);

    mat3 P = FSKR1*inverse(FSKR2);
    vec3 C = FSKR1*(C2-C1);

    // extract matrix blocks
    mat2 Pxyxy = mat2(P[0].xy, P[1].xy);
    vec2 Pxyz = P[2].xy;
    vec2 Pzxy = vec2(P[0].z, P[1].z);
    float Pzz = P[2].z;

    vec2 s1 = C.xy*invZ + (1.0 - C.z*invZ)*(Pxyxy*s2 + Pxyz)/(dot(Pzxy,s2) + Pzz); // starting point for s1
    vec2 ds1 = (C.xy-C.z*(Pxyxy*s2 + Pxyz)/(dot(Pzxy,s2) + Pzz))*dinvZ; // initial s1 step size

    float alpha = 1.0;
    // 40 steps
    for (int i = 0; i < numsteps; i++) {

        invZ -= dinvZ; // step forward
        s1 -= ds1;

        //s1 = C.xy*invZ + (1.0 - C.z*invZ)*(Pxyxy*s2 + Pxyz)/(dot(Pzxy,s2) + Pzz);

        disp = readDisp(iChannelDisp, s1 + .5,minDisp,maxDisp);
        gradDisp = disp-oldDisp;
        oldDisp = disp;
        invZ2 = invZ*(dot(Pzxy,s2) + Pzz)/(1.0 - C.z*invZ);
        if ((disp < invZ2Disp(invZ))&&(invZ2>0.0)) { // if ray is below the "virtual surface"...
            //if (invZ2Disp(invZ)-disp > 0.002) alpha = 0.0;
            if (abs(gradDisp) > gradThr) alpha = 0.0;
            invZ += dinvZ; // step back
            s1 += ds1;
            dinvZ /= 2.0; // increase precision
            ds1 /= 2.0;
        }

    }
    if ((abs(s1.x)<0.5)&&(abs(s1.y)<0.5)&&(invZ2>0.0)&&(invZ>invZmin)) {
    //if ((abs(s1.x*adjustAr(iChannelResolution[0].xy,iResolution.xy).x)<0.495)&&(abs(s1.y*adjustAr(iChannelResolution[0].xy,iResolution.xy).y)<0.495)&&(invZ2>0.0)) {
        return vec4(readColor(iChannelCol, s1+.5), alpha*invZ2);
    } else {
        return vec4(0.0);
    }
}

void main(void) {

    vec2 uv = vTextureCoord;

    float minDisp = -0.1;
    float maxDisp = 0.0*minDisp/2.0;
    float invZmin = disp2invZ(minDisp);
    float invZmax = disp2invZ(maxDisp);
    float invd = invZmin; // pivot

    vec2 f1 = vec2(f,f*iRes.x/iRes.y);
    mat3 FSKR1 = mat3(f1.x,0.0,0.0,0.0,f1.y,0.0,0.0,0.0,1.0); // only f matrix is on trivial, no frustum skew no rotation
    vec3 C1 = vec3(0.0,0.0,0.0); // original position

    vec3 C2 = vec3(uFacePosition.x,-uFacePosition.y,vd-uFacePosition.z)/IO; // normalized camera space coordinates
    vec2 sk2 = -C2.xy*invd/(1.0-C2.z*invd); //keeps 3D focus at specified location
    vec2 f2 = f1/adjustAr(iRes,oRes)*max(1.0-C2.z*invd,1.0);

    mat3 FSKR2 = matFromFocal(f2)*matFromSkew(sk2); // non need for extra rot calculation here

    vec4 result = raycasting(uv-0.5, FSKR2, C2, FSKR1, C1, uImage, uDisparityMap, minDisp, maxDisp, 1.0);
    gl_FragColor = vec4(result.rgb,1.0);

    //vec4 albedoColor = texture2D(uImage, vTextureCoord);
    //float disparity = texture2D(uDisparityMap, vTextureCoord).r;
    //gl_FragColor = vec4(albedoColor.rgb,1.0);
}
