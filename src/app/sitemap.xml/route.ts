import { getSortedPostsData } from "@/lib/posts"
import { NextResponse } from "next/server"

export const dynamic = "force-static";
export const output = "export";
export const revalidate = 0; // Ensure static generation for Next.js static export

export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://johnkferguson.com"
  const posts = getSortedPostsData()

  // Build XML entries for posts
  const postEntries = posts
    .map(
      ({ slug, date }) => `
    <url>
      <loc>${siteUrl}/${slug}</loc>
      <lastmod>$${
        date
          ? new Date(date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0]
      }</lastmod>
      <changefreq>yearly</changefreq>
      <priority>0.7</priority>
    </url>`
    )
    .join("\n")

  // Static pages (home, etc.)
  const staticEntries = `
    <url>
      <loc>${siteUrl}</loc>
      <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
    </url>`

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${staticEntries}\n${postEntries}\n</urlset>`

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  })
}
