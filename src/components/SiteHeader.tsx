import React from 'react';
import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="border-t border-[color:var(--heading-color)] pt-2 min-h-[2.4rem] leading-[2.1rem]">
      <div className="max-w-[30rem] mx-auto px-3 flex items-start justify-between">
        <Link
          href="/"
          className="block text-black text-[1.5rem] tracking-[-1px] relative border-b border-black z-[1] font-normal"
        >
          John K. Ferguson
        </Link>
        <nav>
          <div>
            {/* Navigation links can be added here */}
          </div>
        </nav>
      </div>
    </header>
  );
}
