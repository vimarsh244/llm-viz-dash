/** @type {import('next').NextConfig} */

let withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  reactStrictMode: false, // Recommended for the `pages` directory, default in `app`.
  productionBrowserSourceMaps: true,
  experimental: {
    appDir: true,
  },
  // Exclude problematic native dependencies
  webpack: (config, { isServer }) => {
    // Apply to both server and client to avoid any bundling issues
    config.externals = config.externals || [];
    config.externals.push({
      'onnxruntime-node': 'commonjs onnxruntime-node',
      'sharp': 'commonjs sharp',
    });

    if (!isServer) {
      // Browser-specific exclusions
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node': false,
        'onnxruntime-common': false,
        'sharp': false,
      };
      
      // Fallback for node built-ins
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        buffer: false,
        process: false,
      };

      // Ignore .node files completely
      config.module.rules.push({
        test: /\.node$/,
        use: 'null-loader',
      });
    }
    return config;
  },
  redirects: async () => {
    return [
      {
        source: "/llm-viz",
        destination: "/llm",
        permanent: true,
      },
    ];
  }
};

module.exports = withBundleAnalyzer(nextConfig);
