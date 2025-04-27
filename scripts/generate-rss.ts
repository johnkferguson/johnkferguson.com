// scripts/generate-rss.ts
import fs from "fs"
import path from "path"
import { Feed } from "feed"
// Import both functions needed
import { getSortedPostsData, getPostData } from "../src/lib/posts"

async function generateRssFeed() {
  // 1. Get basic post list (sync)
  const basicPosts = getSortedPostsData()

  const siteURL =
    process.env.NEXT_PUBLIC_SITE_URL || "https://johnkferguson.com" // Use env variable or default
  const date = new Date() // Use current date for build time
  const author = {
    name: "John Ferguson",
    link: siteURL,
  }

  const feed = new Feed({
    title: "John Ferguson's Blog",
    description: "Thoughts on web development, technology, and life.",
    id: siteURL,
    link: siteURL,
    copyright: `All rights reserved ${date.getFullYear()}, John Ferguson`,
    updated: date,
    generator: "Feed for johnkferguson.com",
    feedLinks: {
      rss2: `${siteURL}/rss.xml`,
    },
    author,
  })

  // 2. Loop through basic posts and fetch full data (async)
  for (const basicPost of basicPosts) {
    // Fetch full post data including HTML content
    const post = await getPostData(basicPost.slug)

    // Skip if getPostData failed or returned null
    if (!post) {
      console.warn(
        `Skipping post slug "${basicPost.slug}" in RSS feed due to error fetching full data.`
      )
      continue // Use continue instead of return inside loop
    }

    // Double-check date, though getPostData should also validate
    if (!post.date) {
      console.warn(
        `Skipping post "${post.title}" (slug: ${post.slug}) in RSS feed due to missing date.`
      )
      continue
    }

    const url = `${siteURL}/posts/${post.slug}`

    feed.addItem({
      title: post.title,
      id: url,
      link: url,
      description: post.description, // Use description from full post data
      content: post.contentHtml, // Use contentHtml from full post data
      author: [author],
      date: new Date(post.date),
    })
  }

  // Ensure public directory exists
  const publicDir = path.join(process.cwd(), "public")
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir)
  }

  // Write the RSS feed to public/rss.xml
  fs.writeFileSync(path.join(publicDir, "rss.xml"), feed.rss2())

  console.log("✅ RSS feed generated successfully at public/rss.xml")
}

generateRssFeed().catch((error) => {
  console.error("❌ Error generating RSS feed:", error)
  process.exit(1)
})
