// src/lib/posts.ts
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
// Add static imports for remark processing
import { remark } from 'remark';
import html from 'remark-html';

// Define the path to the directory containing the post MARKDOWN FILES
const postsDirectory = path.join(process.cwd(), 'src/content/posts');

// Define the shape of the post data we expect from frontmatter
export interface PostFrontMatter {
  title: string;
  date: string;
  tags?: string[];
  description?: string;
  excerpt?: string; // Add excerpt type, which gray-matter can generate
}

// Helper function to create a truncated excerpt respecting word boundaries
function createExcerpt(content: string, maxLength = 160): string {
  if (!content) return '';

  // Basic approach: Treat content as plain text for excerpt generation.
  // A more robust solution might involve stripping markdown first.
  const plainContent = content.replace(/(\*\*|\*|_|`|>|#)/g, ''); // Simple removal of some markdown chars

  if (plainContent.length <= maxLength) {
    return plainContent;
  }

  let truncated = plainContent.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > 0) {
    // Truncate at the last space before maxLength
    truncated = truncated.substring(0, lastSpaceIndex);
  }
  // else: No space found, truncate at maxLength

  return truncated + '…';
}

/**
 * Gets the slugs (filenames without .md extension) for all posts.
 */
export function getAllPostSlugs(): string[] {
  try {
    // Read filenames from the posts directory
    const fileNames = fs.readdirSync(postsDirectory);
    // Filter for markdown files and remove the .md extension to get slugs
    return fileNames
      .filter(fileName => fileName.endsWith('.md') || fileName.endsWith('.mdx'))
      .map(fileName => fileName.replace(/\.(md|mdx)$/, ''));
  } catch (err) {
    console.error('Error reading posts directory:', err);
    return []; // Return empty array on error
  }
}

/**
 * Gets sorted post data (metadata + slug) for the blog index page.
 */
export function getSortedPostsData(): ({ slug: string; excerpt: string } & PostFrontMatter)[] {
  const slugs = getAllPostSlugs();

  const allPostsData = slugs.map((slug) => {
    // Construct the full path to the markdown file directly
    const fullPath = path.join(postsDirectory, `${slug}.md`); // Assuming .md for now, add .mdx check if needed

    // Read markdown file as string
    let fileContents;
    try {
      // Check for both .md and .mdx if getAllPostSlugs supports it
      let actualPath = fullPath;
      if (!fs.existsSync(actualPath)) {
          const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
          if (fs.existsSync(mdxPath)) {
              actualPath = mdxPath;
          } else {
              console.error(`Markdown file not found for slug ${slug} at ${fullPath} or ${mdxPath}`);
              return null;
          }
      }
      fileContents = fs.readFileSync(actualPath, 'utf8');
    } catch (err) {
      console.error(`Error reading markdown file for slug ${slug}:`, err);
      return null; // Skip on error
    }

    // Use gray-matter to parse the post metadata section
    // Disable built-in excerpt, we'll create our own from content
    const matterResult = matter(fileContents, { excerpt: false }); 

    // --- Important: Extract date from frontmatter --- 
    const date = matterResult.data.date;
    if (!date || typeof date !== 'string') {
      console.warn(`Post with slug "${slug}" is missing a valid date in frontmatter. Skipping.`);
      return null;
    }
    // --- End Important ---

    // Combine the data with the slug
    return {
      slug,
      ...(matterResult.data as PostFrontMatter),
      // Create excerpt using our custom function from the raw content
      excerpt: createExcerpt(matterResult.content),
    };
  })
  // Update filter type guard to include excerpt
  .filter((post): post is ({ slug: string; excerpt: string } & PostFrontMatter) => post !== null); // Filter out nulls

  // Sort posts by date
  return allPostsData.sort((a, b) => {
    if (a.date < b.date) {
      return 1;
    } else {
      return -1;
    }
  });
}

/**
 * Gets full post data including processed HTML content for a single post page.
 */
export async function getPostData(slug: string): Promise<({ slug: string, contentHtml: string } & PostFrontMatter) | null> {
  // Construct the full path to the markdown file directly
  const fullPath = path.join(postsDirectory, `${slug}.md`); // Assuming .md

  let fileContents;
  try {
    // Check for both .md and .mdx
    let actualPath = fullPath;
    if (!fs.existsSync(actualPath)) {
        const mdxPath = path.join(postsDirectory, `${slug}.mdx`);
        if (fs.existsSync(mdxPath)) {
            actualPath = mdxPath;
        } else {
            console.error(`Markdown file not found for slug ${slug} at ${fullPath} or ${mdxPath}`);
            return null;
        }
    }
    fileContents = fs.readFileSync(actualPath, 'utf8');
  } catch (err) {
    console.error(`Error reading markdown file for slug ${slug}:`, err);
    return null;
  }

  const matterResult = matter(fileContents);

  // Process markdown content to HTML using remark
  const processedContent = await remark()
    .use(html, { sanitize: false }) // Keep sanitize false if you trust your MD content or handle elsewhere
    .process(matterResult.content);
  const contentHtml = processedContent.toString();

  // Type assertion for frontmatter - ensure required fields exist
  const frontmatter = matterResult.data as PostFrontMatter;
  if (!frontmatter.title || !frontmatter.date) {
    console.warn(`Post with slug "${slug}" is missing title or date in frontmatter.`);
    // Decide how to handle - return null or default values?
    return null;
  }

  // Combine the data with the id and contentHtml
  return {
    slug,
    contentHtml,
    ...frontmatter,
  };
}
