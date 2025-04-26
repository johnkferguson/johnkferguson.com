// src/app/posts/[slug]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostData, getAllPostSlugs } from '@/lib/posts';
import MarkdownRenderer from '@/components/MarkdownRenderer';

// Generate params for all posts at build time
export function generateStaticParams(): { slug: string }[] {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({
    slug: slug,
  }));
}

// Generate metadata for the page
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  // read route params
  const awaitedParams = await params;
  const slug = awaitedParams.slug;
  const post = await getPostData(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://johnkferguson.com';
  const postUrl = `${siteUrl}/${slug}`; // URL for this specific post

  if (!post) {
    // If post not found, return default metadata or handle as needed
    // Returning notFound() here might not be appropriate for metadata
    return {
      title: 'Post Not Found',
    };
  }

  const postDescription = post.description || post.excerpt || 'A blog post by John K. Ferguson'; // Use frontmatter description, fallback to excerpt or default

  return {
    title: post.title, // Title template from layout will add '| John K. Ferguson'
    description: postDescription,
    alternates: {
      canonical: postUrl, // Canonical URL for this post
    },
    openGraph: {
      title: post.title,
      description: postDescription,
      url: postUrl,
      type: 'article',
      publishedTime: post.date, // ISO 8601 format
      authors: ['John K. Ferguson'], // Or dynamically if author varies
      // Add post-specific image later if available in frontmatter
      // images: [
      //   {
      //     url: `${siteUrl}/og-images/${post.slug}.png`, // Example path
      //     width: 1200,
      //     height: 630,
      //     alt: post.title,
      //   },
      // ],
    },
    // Optionally add Twitter card specific to the post
    // twitter: {
    //   card: 'summary_large_image',
    //   title: post.title,
    //   description: postDescription,
    //   // images: [`${siteUrl}/twitter-images/${post.slug}.png`],
    // },
  };
}

// The Page component
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const awaitedParams = await params;
  const postData = await getPostData(awaitedParams.slug);

  if (!postData) {
    notFound(); // Trigger 404 if post not found
  }

  // Format date manually to match the original site style
  const formattedDate = new Date(postData.date).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  return (
    <div className="page-content">
      <div className="wrap">
        <div className="post">
          <header className="post-header">
            <h1>{postData.title}</h1>
            <p className="meta">{formattedDate}</p>
          </header>
          <article className="post-content">
            <MarkdownRenderer content={postData.contentMarkdown} blurMap={postData.blurMap} />
          </article>
        </div>
      </div>
    </div>
  );
}
