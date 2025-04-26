import React from 'react';
import Link from 'next/link';
import { type PostFrontMatter } from '@/lib/posts';

interface PostListProps {
  posts: ({
    slug: string;
    excerpt: string;
  } & PostFrontMatter)[];
}

export default function PostList({ posts }: PostListProps) {
  // Helper function to format dates in the style "May 24, 2014"
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      console.error('Invalid date string:', dateString);
      return dateString; // Return the original if parsing fails
    }
  };

  return (
    <div className="page-content">
      <div className="wrap">
        <ul className="posts">
          {posts.map((post) => (
            <li key={post.slug}>
              <span className="post-date">{formatDate(post.date)}</span>
              <Link 
                href={`/${post.slug}`} 
                className="post-link"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="rss-subscribe">
          subscribe <a href="/rss.xml">via RSS</a>
        </p>
      </div>
    </div>
  );
}
