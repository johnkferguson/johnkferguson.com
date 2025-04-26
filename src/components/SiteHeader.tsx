import React from 'react';
import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="site-title">
          John K. Ferguson
        </Link>
        <nav className="site-nav">
          <div className="trigger">
            {/* Navigation links can be added here */}
          </div>
        </nav>
      </div>
    </header>
  );
}
