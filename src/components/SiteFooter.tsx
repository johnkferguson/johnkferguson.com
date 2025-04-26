import React from 'react';
import Link from 'next/link';
import TwitterIcon from './icons/TwitterIcon';
import GithubIcon from './icons/GithubIcon';
import EmailIcon from './icons/EmailIcon';

export default function SiteFooter() {
  // Default usernames/emails that match the original site
  const emailAddress = 'hello@johnkellyferguson.com';
  const githubUsername = 'johnkferguson';
  const twitterUsername = 'johnkferguson';

  return (
    <footer className="site-footer">
      <div className="wrap">
        <ul className="social-icons">
          <li>
            <a href={`https://twitter.com/${twitterUsername}`}>
              <TwitterIcon />
            </a>
          </li>
          <li className="github">
            <a href={`https://github.com/${githubUsername}`}>
              <GithubIcon />
            </a>
          </li>
          <li>
            <a href={`mailto:${emailAddress}`}>
              <EmailIcon />
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
