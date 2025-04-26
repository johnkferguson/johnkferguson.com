import React from 'react';

interface PostLayoutProps {
  title: string;
  date: string;
  children: React.ReactNode; // This will be the rendered Markdown content
}

export default function PostLayout({ title, date, children }: PostLayoutProps) {
  return (
    <article>
      {/* Apply .post-header styles */}
      <header className="mb-[1.7rem]">
        {/* Apply .post-title styles */}
        <h1 className="text-3xl tracking-tight leading-tight mb-0">
          {title}
        </h1>
        {/* Apply .post-meta styles */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1"> {/* Added small top margin for spacing */}
          {date}
        </p>
      </header>
      {/* Rendered Markdown content will go here */}
      {/* Styling for content within 'children' is handled by globals.css (main p, main ul, etc.) */}
      <div>
        {children}
      </div>
    </article>
  );
}
