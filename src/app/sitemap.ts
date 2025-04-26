import { MetadataRoute } from 'next';
import { getSortedPostsData } from '@/lib/posts';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://johnkferguson.com';

  // 1. Get all posts
  const posts = getSortedPostsData();

  // 2. Create sitemap entries for posts
  const postEntries: MetadataRoute.Sitemap = posts.map(({ slug, date }) => ({
    url: `${siteUrl}/${slug}`, // Use root path for posts
    lastModified: date ? new Date(date) : new Date(), // Use post date or current date as fallback
    changeFrequency: 'yearly', // Or 'weekly'/'yearly' depending on update frequency
    priority: 0.7, // Priority relative to other pages
  }));

  // 3. Add static pages (e.g., home page)
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(), // Use current date for home page
      changeFrequency: 'weekly',
      priority: 1.0, // Highest priority
    },
    // Add other static pages here if needed
    // e.g., { url: `${siteUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 }
  ];

  // 4. Combine and return
  return [
    ...staticEntries,
    ...postEntries,
  ];
}
