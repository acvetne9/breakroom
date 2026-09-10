import React, { useCallback, useEffect, useState } from "react";
import { getMyPosts, transformPost, type Post } from "@/services/posts";
import { usePostsContext } from "./PostsProvider";
import { formatTimeAgo } from "../utils/timeAgo";

const PAGE_SIZE = 20;

interface MyStoriesProps {
  /** Open the post in the feed. */
  onOpenPost?: (post: Post) => void;
}

const kindLabel = (post: Post) => (post.isComment ? "Your comment" : post.isJobUpdate ? "Job update" : "Your story");

/** Every post this device has written, newest first, loaded in pages straight from the database. */
const MyStories: React.FC<MyStoriesProps> = ({ onOpenPost }) => {
  const { removePost, posts: feedPosts } = usePostsContext();
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const rows = await getMyPosts(PAGE_SIZE, offset);
      const page = rows.map((row) => transformPost(row));
      setItems((prev) => (offset === 0 ? page : [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]));
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  // Keep vote counts in step with the feed when the same post is loaded there.
  useEffect(() => {
    if (feedPosts.length === 0) return;
    setItems((prev) =>
      prev.map((p) => {
        const live = feedPosts.find((f) => f.id === p.id);
        return live && live.votesTotal !== p.votesTotal ? { ...p, votesTotal: live.votesTotal } : p;
      }),
    );
  }, [feedPosts]);

  const handleDelete = async (post: Post) => {
    if (confirmingId !== post.id) {
      setConfirmingId(post.id);
      return;
    }
    setConfirmingId(null);
    const ok = await removePost(post.id);
    if (ok) setItems((prev) => prev.filter((p) => p.id !== post.id && p.isComment !== post.id));
  };

  if (loading && items.length === 0) {
    return <p className="text-app-gray-medium text-sm">Loading your posts…</p>;
  }

  if (items.length === 0) {
    return <p className="text-app-gray-medium text-sm">No stories or comments yet. Share your workplace experiences!</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {items.map((post) => (
        <div
          key={post.id}
          className="story-item border-l-2 border-app-gray-light pl-4 cursor-pointer hover:bg-app-gray-light/30 p-2 rounded"
          onClick={() => onOpenPost?.(post)}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs text-app-gray-medium whitespace-nowrap">{kindLabel(post)}</p>
              {post.businessName && <span className="text-xs text-app-gray-medium truncate">at {post.businessName}</span>}
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatTimeAgo(post.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-app-gray-medium">{post.votesTotal} votes</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(post);
                }}
                onBlur={() => setConfirmingId((c) => (c === post.id ? null : c))}
                aria-label={confirmingId === post.id ? "Confirm delete" : "Delete post"}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  confirmingId === post.id ? "bg-red-100 text-red-700" : "text-app-gray-medium hover:text-red-600"
                }`}
              >
                {confirmingId === post.id ? "Delete?" : "🗑️"}
              </button>
            </div>
          </div>
          <p className="text-app-gray-dark text-sm">{post.text.length > 140 ? `${post.text.substring(0, 140)}…` : post.text}</p>
        </div>
      ))}

      {hasMore && (
        <button
          onClick={() => load(items.length)}
          disabled={loading}
          className="w-full mt-2 px-4 py-2 text-sm bg-app-gray-light text-app-black rounded hover:bg-app-gray-light/70 transition-colors disabled:opacity-60"
        >
          {loading ? "Loading…" : "Show more"}
        </button>
      )}
    </div>
  );
};

export default MyStories;
