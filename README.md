# [johnkferguson.com](https://www.johnkferguson.com)

This blog is built using [gatsby](https://github.com/gatsbyjs/gatsby) and is deployed using [Netlify](https://www.netlify.com/).

The first version of this blog was built using [Octopress](https://github.com/imathis/octopress), which was later dropped in favor of using [Jekyll](https://github.com/jekyll/jekyll) by itself.

## Planned Blog Improvements

This project is currently in the process of making several improvements, which shall proceed in three distinct phases.

### Phase 1: Feature Parity with Gatsby

The goal of this phase is to complete the transition from using `jekyll` to using `gatsby` as the static site generator. In doing so, the intent is to achieve full feature parity with the `jekyll` version of the blog.

- [x] Add way to import and read markdown posts
- [x] Copy posts folder to gatsby
- [x] Copy image folder over to gatsby
- [x] Set up index page so it can iterate through all posts and extract right info
- [x] Set up post template
- [x] Format dates
- [x] Sort posts from most recent to least recent
- [x] Change date format to short codes
- [x] Add Rss feed [Reference](https://www.gatsbyjs.org/docs/adding-an-rss-feed/)
  - [x] Confirm excerpt is already included
- [x] Add sitemap
- [x] Add robots.txt
- [x] Add gatsby helmet
- [x] Format header based upon jekyll's `header.html`
- [x] Remove gatsby favicon
- [x] Change date formatting to use graphql
- [x] Confirm that gatsby site has all jekyll elements in it properly set up
- [x] Get rid of all jekyll components
- [x] Update Netlify build instructions (locally in file, netlify.toml)
- [ ] Update package.json info with real site info
- [ ] Merge and deploy

### Phase 2: Gatsby Improvements

After completing the transition to Gatsby, the goal of this phase is to extend the functionality of the blog, leveraging the various tools offered by Gatsby and the general `javascript` ecosystem.

- [ ] Add custom 404 page
- [ ] Name all queries
- [ ] Add canonical urls in head
- [ ] Update Netlify CMS
- [ ] [Add Gatsby plugin Netlify Cache](https://github.com/axe312ger/gatsby-plugin-netlify-cache)
- [ ] Set all external links to open in new tab
- [ ] Update site to use tailwind for css: [Reference](https://www.jerriepelser.com/blog/using-tailwind-with-gatsby/)
- [ ] Add syntax highlighting by language
- [ ] Create custom 404 page.
- [ ] Embed fonts in page directly
- [ ] Improve Site's SEO. References: [SEO React Helmet Example](https://github.com/jlengstorf/gatsby-theme-jason-blog/blob/master/src/components/SEO/SEO.js), [Simpler React Helmet Example](https://github.com/gatsbyjs/gatsby/blob/master/www/src/components/site-metadata.js), [SEO with Gatsby](https://blog.dustinschau.com/search-engine-optimization-with-gatsby)
- [ ] Analyze asset bundle size
- [ ] Look into ways to trim asset bundle
- [ ] Set application to run as PWA with offline support
- [ ] Review gatsby plugin options to find others that would be beneficial
  - [ ] [Some options](https://github.com/gatsbyjs/gatsby/issues/16590)
- [ ] Review site performance using Lighthouse and other gatsby recommended tools
- [ ] Optimize Images [Reference](https://www.sitepoint.com/automatically-optimize-responsive-images-in-gatsby/)
- [ ] Implement QA standards: [Reference](https://kalinchernev.github.io/gatsbyjs-qa-linting-testing)
- [ ] Implement some tests: [Gatsby Testing](https://www.intricatecloud.io/2018/09/simple-automated-testing-for-a-static-website-with-nightwatch-js/)
- [ ] Add Plop generators to site: [Reference](https://dev.to/ekafyi/adding-generators-to-your-gatsby-site-with-plop-2gd5)
- [ ] Improve XML Sitema
  - [ ] Process Explanation - In Updating Sitemap below
  - [ ] [Jekyll Sitemap lastmod Reference](https://github.com/jekyll/jekyll-sitemap/blob/dbc18f15357444d58cab3b61d6f303b772914ae5/README.md#lastmod-tag)
  - [ ] [Reference: Sitemap.XML – Why Changefreq & Priority XML Are Important ](https://www.v9digital.com/insights/sitemap-xml-why-changefreq-priority-are-important/)
  - [ ] [How to Optimize XML Sitemaps: 13 SEO Best Practices](https://www.searchenginejournal.com/xml-sitemap-best-practices/237649/#close)
  - [ ] [Best Practices for XML](https://webmasters.googleblog.com/2014/10/best-practices-for-xml-sitemaps-rssatom.html)
  - [ ] [Google Sitemap Reference](https://support.google.com/webmasters/answer/183668?hl=en)

### Phase 3: Blog Re-design

After leveraging all of the power that Gatsby has to offer, the goal of this phase is to re-design the blog to better reflect the online presence that I would like to have.

- [ ] Review other personal blogs and sites for inspiration
- [ ] Create about me page
- [ ] Create custom favicon
- [ ] Considder adding elasticlunr.js
- [ ] [Cross-post from Gatsby to Medium, etc.](https://www.freecodecamp.org/news/how-to-automatically-cross-post-from-your-gatsbyjs-blog-with-rss/)
- [ ] Add blog comments
  - [ ] Research options

#### Updating sitemap

To update the sitemap to include `lastmod` and custom set fields, the following will have to be done:

1. Within `gatsby-node.js`, there needs to be some sort of hook, that adds `lastmod`, `changefreq`, and `priority` to the fields of `allSitePages` node. The files that it should access and add these to can be accessed with the following query:

   ```js
   {
     allFile {
       edges {
         node {
           name
           modifiedTime
           extension
           relativePath
         }
       }
     }
   }
   ```

These files should be filtered such that it only returns files in the `pages` directory and the `.md` files in the `posts` directory.

`modifiedTime` can be used to set `lastmod`.
`priority` can be set to 1 for the index, 0.9 for other pages, and 0.7 for posts.
`changefreq` should be set to daily for index page and monthly for each other item.

2. Then, within `gatsby-config.js`, it should have something like the following:

```javascript
resolve: `gatsby-plugin-sitemap`,
  options: {
  query: `
  {
  site {
   siteMetadata {
     siteUrl
   }
  }

  allSitePages {
   edges {
     node {
       path
       fields {
         lastmod
         changefreq
         priority
       }
     }
   }
  }
  }`,
  serialize: ({ site, allSitePage }) =>
  allSitePage.edges.map(edge => {
   return {
     url: site.siteMetadata.siteUrl + edge.node.path,
     lastmod: edge.node.fields.lastmod,
     changefreq: edge.node.fields.changefreq,
     priority: edge.node.fields.priority,
   }
  }),
```

Add last mod to pages:

Can be extracted from modifiedTime
