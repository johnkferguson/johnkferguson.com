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
    <div className="py-8">
      <div className="max-w-[95vw] md:max-w-[630px] mx-auto px-4 md:px-[15.75px]">
        <ul className="list-none p-0 m-0">
          {posts.map((post, idx) => (
            <li key={post.slug} className="mb-[1.4rem]">
              <span className="block text-[0.7rem] text-[#818181] leading-none">{formatDate(post.date)}</span>
              <Link
                href={`/${post.slug}`}
                className="text-[1rem] md:text-[1.2rem] tracking-[-0.04em] leading-none font-normal text-gray-900 hover:text-black border-b border-[#ddd] hover:border-black transition-colors"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-[16px] leading-[24px] mb-[21px] text-gray-400 md:text-[21px] md:leading-[31.5px]">
          subscribe <a href="/rss.xml" className="text-blue-700 hover:underline">via RSS</a>
        </p>
      </div>
    </div>
  );
}
