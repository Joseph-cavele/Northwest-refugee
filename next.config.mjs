/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
   * Packages Next must NOT bundle into the server build.
   *
   * Mongoose builds its models by reading class metadata and registers them on a module
   * singleton; a bundler that duplicates or tree-shakes it produces "Cannot overwrite model
   * once compiled" at runtime — which is also why every model file ends with the
   * `mongoose.models.X || mongoose.model(...)` guard. The rest are native or dynamic-require
   * dependencies that do not survive bundling either.
   */
  serverExternalPackages: [
    'mongoose',
    'bcryptjs',
    'pino',
    'cloudinary',
    'otplib',
    '@otplib/preset-default',
  ],

  /*
   * Security headers, replacing helmet.
   *
   * helmet was Express middleware and does not come across. These are the subset that
   * actually applied to this app; Next sets X-Content-Type-Options and X-Powered-By
   * handling itself.
   *
   * NOT SET HERE: Content-Security-Policy. helmet's default CSP would break the Next dev
   * overlay and inline bootstrap script, and a CSP written blind is a CSP that gets
   * disabled the first time something breaks. It wants a nonce-based policy set in
   * middleware.js — worth doing before go-live on a system holding this data.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // HSTS only makes sense over TLS, and on localhost it would pin a developer's
          // browser to https for the whole origin.
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      {
        // The API is called by this origin only. No CORS headers are emitted at all, which
        // is stricter than the Express `cors({ origin: CORS_ORIGIN })` it replaces —
        // front end and API are now the same origin, so the browser never preflights.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
