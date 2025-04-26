import type { Metadata } from "next";
import { PT_Serif, Fira_Code } from "next/font/google";
import "./globals.css";

import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

const ptSerif = PT_Serif({
  variable: "--font-pt-serif",
  weight: ["400", "700"],
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://johnkferguson.com';
const siteTitle = "John K. Ferguson | Software Engineer";
const siteDescription = "Personal website and blog of John K. Ferguson, exploring software development, technology, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | John K. Ferguson`,
  },
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "John K. Ferguson's Site",
    type: 'website',
    locale: 'en_US',
    // Add an og:image later if you have a default site image
    // images: [
    //   {
    //     url: `${siteUrl}/default-og-image.png`, // Must be an absolute URL
    //     width: 1200,
    //     height: 630,
    //     alt: 'John K. Ferguson Site Preview',
    //   },
    // ],
  },
  // Add Twitter card metadata if desired
  // twitter: {
  //   card: 'summary_large_image',
  //   title: siteTitle,
  //   description: siteDescription,
  //   // images: [`${siteUrl}/default-twitter-image.png`], // Must be absolute URL
  //   // creator: '@yourTwitterHandle',
  // },
  // Add robots meta tag if needed (complementing robots.txt)
  // robots: {
  //   index: true,
  //   follow: true,
  //   googleBot: {
  //     index: true,
  //     follow: true,
  //     'max-video-preview': -1,
  //     'max-image-preview': 'large',
  //     'max-snippet': -1,
  //   },
  // },
  // Add canonical URL if different from siteUrl
  // alternates: {
  //   canonical: siteUrl,
  // },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ptSerif.variable} ${firaCode.variable}`}>
      <body>
        <div>
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
