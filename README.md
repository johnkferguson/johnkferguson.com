# [johnkferguson.com](https://www.johnkferguson.com)

This blog is built using [gatsby](https://github.com/gatsbyjs/gatsby) and is deployed using [Netlify](https://www.netlify.com/).

The first version of this blog was built using [Octopress](https://github.com/imathis/octopress), which was later dropped in favor of using [Jekyll](https://github.com/jekyll/jekyll) by itself.

## Planned Blog Improvements

This project is currently in the process of making several improvements, which shall proceed in three distinct phases.

### Phase 1: Feature Parity with Gatsby

The goal of this phase is to complete the transition from using `jekyll` to using `gatsby` as the static site generator. In doing so, the intent is to achieve full feature parity with the `jekyll` version of the blog.

- [X] Add way to import and read markdown posts
- [X] Copy posts folder to gatsby
- [X] Copy image folder over to gatsby
- [X] Set up index page so it can iterate through all posts and extract right info
- [X] Set up post template
- [X] Format dates
- [X] Sort posts from most recent to least recent
- [ ] Change date format to short codes
- [ ] Add Rss feed
- [ ] Add gatsby helmet
- [ ] Format header based upon jekyll's `header.html`
- [ ] Confirm that gatsby site has all jekyll elements in it properly set up
- [ ] Get rid of all jekyll components
- [ ] Update Netlify build instructions (locally in file)
- [ ] Merge and deploy

### Phase 2: Gatsby Improvements

After completing the transition to Gatsby, the goal of this phase is to extend the functionality of the blog, leveraging the various tools offered by Gatsby and the general `javascript` ecosystem.

- [ ] Name all queries
- [ ] Update Netlify CMS
- [ ] Set all external links to open in new tab
- [ ] Update site to use tailwind for css: [Reference](https://www.jerriepelser.com/blog/using-tailwind-with-gatsby/)
- [ ] Add syntax highlighting by language
- [ ] Improve Site's SEO. References: [SEO React Helmet Example](https://github.com/jlengstorf/gatsby-theme-jason-blog/blob/master/src/components/SEO/SEO.js), [Simpler React Helmet Example](https://github.com/gatsbyjs/gatsby/blob/master/www/src/components/site-metadata.js), [SEO with Gatsby](https://blog.dustinschau.com/search-engine-optimization-with-gatsby)
- [ ] Analyze asset bundle size
- [ ] Look into ways to trim asset bundle
- [ ] Set application to run as PWA with offline support
- [ ] Review gatsby plugin options to find others that would be beneficial
- [ ] Review site performance using Lighthouse and other gatsby recommended tools
- [ ] Optimize Images [Reference](https://www.sitepoint.com/automatically-optimize-responsive-images-in-gatsby/)
- [ ] Implement QA standards: [Reference](https://kalinchernev.github.io/gatsbyjs-qa-linting-testing)
- [ ] Implement some tests: [Gatsby Testing](https://www.intricatecloud.io/2018/09/simple-automated-testing-for-a-static-website-with-nightwatch-js/)
- [ ] Add Plop generators to site: [Reference](https://dev.to/ekafyi/adding-generators-to-your-gatsby-site-with-plop-2gd5)

### Phase 3: Blog Re-design

After leveraging all of the power that Gatsby has to offer, the goal of this phase is to re-design the blog to better reflect the online presence that I would like to have.

- [ ] Review other personal blogs and sites for inspiration
- [ ] Create about me page
- [ ] Considder adding elasticlunr.js
