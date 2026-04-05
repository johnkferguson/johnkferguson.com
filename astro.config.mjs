// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://johnkferguson.com",
  output: "static",
  integrations: [sitemap(), mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
  trailingSlash: "never",
  build: {
    inlineStylesheets: "auto",
  },
  prefetch: {
    prefetchAll: true,
  },
  markdown: {
    syntaxHighlight: false,
  },
});
