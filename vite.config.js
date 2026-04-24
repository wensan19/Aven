const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
const pkg = require("./package.json");

const buildStamp = new Date().toISOString();
const buildVersion = pkg.version;

module.exports = defineConfig({
  base: "/Aven/",
  define: {
    __AVEN_BUILD_STAMP__: JSON.stringify(buildStamp),
    __AVEN_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    {
      name: "aven-build-marker",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          [
            `    <meta name="aven-build-version" content="${buildVersion}" />`,
            `    <meta name="aven-build-stamp" content="${buildStamp}" />`,
            `    <!-- Aven build ${buildVersion} | ${buildStamp} -->`,
            "  </head>",
          ].join("\n"),
        );
      },
    },
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
