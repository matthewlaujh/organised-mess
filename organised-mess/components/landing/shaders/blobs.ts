export const blobsVert = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const blobsFrag = /* glsl */ `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform float u_seed;

  float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }

  float blob(vec2 p, vec2 center, float r) {
    float d = length(p - center);
    return exp(-d * d / (2.0 * r * r));
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    float t = u_time * 0.10;
    float s = u_seed;

    vec2 c1 = vec2((0.20 + sin(t * 0.73 + s * 1.0) * 0.15) * aspect, 0.68 + cos(t * 0.57) * 0.12);
    vec2 c2 = vec2((0.70 + cos(t * 0.41 + s * 1.7) * 0.20) * aspect, 0.35 + sin(t * 0.63) * 0.15);
    vec2 c3 = vec2((0.50 + sin(t * 0.29 + s * 0.5) * 0.22) * aspect, 0.75 + cos(t * 0.81) * 0.10);
    vec2 c4 = vec2((0.12 + cos(t * 0.67 + s * 2.3) * 0.10) * aspect, 0.28 + sin(t * 0.49) * 0.20);
    vec2 c5 = vec2((0.85 + sin(t * 0.53 + s * 1.1) * 0.10) * aspect, 0.60 + cos(t * 0.37) * 0.18);

    float f1 = blob(p, c1, 0.22);
    float f2 = blob(p, c2, 0.28);
    float f3 = blob(p, c3, 0.17);
    float f4 = blob(p, c4, 0.14);
    float f5 = blob(p, c5, 0.19);

    float total = f1 + f2 + f3 + f4 + f5;

    vec3 col1 = vec3(0.78, 0.22, 0.95);
    vec3 col2 = vec3(0.95, 0.40, 0.15);
    vec3 col3 = vec3(0.20, 0.88, 0.95);
    vec3 col4 = vec3(0.92, 0.22, 0.58);
    vec3 col5 = vec3(0.40, 0.95, 0.38);

    vec3 baseColor = (col1 * f1 + col2 * f2 + col3 * f3 + col4 * f4 + col5 * f5)
                     / max(total, 0.001);

    // float brightness = smoothstep(0.0, 0.30, total);
    float brightness = smoothstep(0.0, 0.05, total); // was 0.30

    vec3 color = baseColor * brightness;

    float core = blob(p, c1, 0.06) + blob(p, c2, 0.08)
               + blob(p, c3, 0.05) + blob(p, c4, 0.04) + blob(p, c5, 0.06);
    color += vec3(core * 0.35);

    color = pow(color, vec3(1.2));

    float g = rand(uv * vec2(1847.0, 1123.0) + vec2(u_time * 7919.0, u_time * 6271.0));
    color += (g - 0.5) * 0.11;

    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);

  }
`
