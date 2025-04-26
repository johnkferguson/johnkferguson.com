import { getSortedPostsData } from '@/lib/posts';
import PostList from '@/components/PostList';

export default function Home() {
  const allPostsData = getSortedPostsData();
  
  return <PostList posts={allPostsData} />;
}
