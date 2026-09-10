import React, { useState, useMemo, memo, useEffect, useCallback, useRef } from "react";
import { isProfane } from "../utils/profanityFilter";
import { usePostsContext } from "./PostsProvider";
import VotingComponent from "./VotingComponent";
import { formatTimeAgo } from "../utils/timeAgo";
import { TranslatedText } from "./TranslatedText";
import { CommenterBadge } from "./CommenterBadge";
import { getCommenterIdentity } from "@/utils/commenterIdentity";
import { SYSTEM_USER_ID, type Post } from "@/services/posts";

interface ExplorePageProps {
  filteredBusinessId?: string;
  filteredUserStories?: boolean;
  onBackToAllPosts?: () => void;
  onFlyToBusiness?: (businessId: string, post?: Post) => void;
  currentSlide?: number;
}

const PAGE_STEP = 25;

const ExplorePage: React.FC<ExplorePageProps> = memo(
  ({ filteredBusinessId, filteredUserStories, onBackToAllPosts, onFlyToBusiness, currentSlide = 2 }) => {
    const { posts, loading, hasMore, submitPost, votePost, removePost, loadMore, loadMyPosts } = usePostsContext();

    const [expandedPost, setExpandedPost] = useState<string | null>(null);
    const [fadeOutSystemPost, setFadeOutSystemPost] = useState(false);
    const [hideSystemPost, setHideSystemPost] = useState(false);
    const [isSwipingOrTransitioning, setIsSwipingOrTransitioning] = useState(true);
    const [postText, setPostText] = useState("");
    const [commentText, setCommentText] = useState("");
    const [postPlaceholder, setPostPlaceholder] = useState("");
    const [commentPlaceholder, setCommentPlaceholder] = useState("Leave a comment!");
    const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const defaultPlaceholder = filteredBusinessId ? "Thoughts about this business?" : "How's work?";

    // "My Stories" must show everything the device wrote, not just the loaded pages.
    useEffect(() => {
      if (filteredUserStories) loadMyPosts();
    }, [filteredUserStories, loadMyPosts]);

    useEffect(() => {
      setPostPlaceholder(defaultPlaceholder);
    }, [defaultPlaceholder]);

    // Ignore taps while the card is sliding into place.
    useEffect(() => {
      if (currentSlide !== 2) {
        setIsSwipingOrTransitioning(true);
        return;
      }
      const timer = setTimeout(() => setIsSwipingOrTransitioning(false), 200);
      return () => clearTimeout(timer);
    }, [currentSlide]);

    const { displayPosts, realPostCount } = useMemo(() => {
      let filtered: Post[];
      if (filteredBusinessId) {
        filtered = posts.filter((p) => p.businessId === filteredBusinessId && !p.isJobUpdate && !p.isComment);
      } else if (filteredUserStories) {
        filtered = posts.filter((p) => p.author === "You" && !p.isJobUpdate && !p.isComment);
      } else {
        filtered = posts.filter((p) => !p.isComment);
      }

      const realBusinessPosts = filtered.filter((p) => p.author !== "System");

      if (filteredBusinessId && realBusinessPosts.length === 0) {
        const placeholder: Post = {
          id: `default-${filteredBusinessId}`,
          author: "System",
          text: "Share a thought about this business 💭",
          businessId: filteredBusinessId,
          isStory: true,
          votesTotal: 0,
          userVote: null,
          createdAt: new Date(),
        };
        filtered = [placeholder, ...filtered];
      }

      return { displayPosts: filtered, realPostCount: realBusinessPosts.length };
    }, [posts, filteredBusinessId, filteredUserStories]);

    // Fade the placeholder out once a real post exists for the business.
    useEffect(() => {
      if (filteredBusinessId && realPostCount > 0 && !fadeOutSystemPost && !hideSystemPost) {
        setFadeOutSystemPost(true);
        const t = setTimeout(() => {
          setHideSystemPost(true);
          setFadeOutSystemPost(false);
        }, 500);
        return () => clearTimeout(t);
      }
      if (!filteredBusinessId || realPostCount === 0) {
        setFadeOutSystemPost(false);
        setHideSystemPost(false);
      }
    }, [realPostCount, filteredBusinessId, fadeOutSystemPost, hideSystemPost]);

    // Comments keyed by parent post, built once per posts change.
    const commentsByPostId = useMemo(() => {
      const map = new Map<string, Post[]>();
      for (const post of posts) {
        if (!post.isComment) continue;
        const list = map.get(post.isComment);
        if (list) list.push(post);
        else map.set(post.isComment, [post]);
      }
      return map;
    }, [posts]);

    // Reveal more of the already-loaded list as the user nears the bottom, and
    // ask the server for the next page once the local list is exhausted.
    useEffect(() => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const onScroll = () => {
        if (el.scrollTop + el.clientHeight < el.scrollHeight - 300) return;
        if (visibleCount < displayPosts.length) {
          setVisibleCount((prev) => Math.min(prev + PAGE_STEP, displayPosts.length));
        } else if (hasMore && !loading) {
          loadMore();
        }
      };
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }, [displayPosts.length, visibleCount, hasMore, loading, loadMore]);

    useEffect(() => {
      setVisibleCount(PAGE_STEP);
      scrollContainerRef.current?.scrollTo({ top: 0 });
    }, [filteredBusinessId, filteredUserStories]);

    const paginatedPosts = useMemo(() => displayPosts.slice(0, visibleCount), [displayPosts, visibleCount]);

    const handlePostSubmit = useCallback(async () => {
      if (!postText.trim()) return;
      if (isProfane(postText)) {
        setPostText("");
        setPostPlaceholder("Post blocked: Inappropriate content detected");
        return;
      }
      const result = await submitPost(postText, filteredBusinessId);
      setPostText("");
      setPostPlaceholder(result.ok ? defaultPlaceholder : result.reason);
    }, [postText, submitPost, filteredBusinessId, defaultPlaceholder]);

    const handleCommentSubmit = useCallback(async () => {
      if (!commentText.trim() || !expandedPost) return;
      if (isProfane(commentText)) {
        setCommentText("");
        return;
      }
      const result = await submitPost(commentText, undefined, false, undefined, undefined, undefined, expandedPost);
      setCommentText("");
      setCommentPlaceholder(result.ok ? "Leave a comment!" : result.reason);
    }, [commentText, expandedPost, submitPost]);

    const handlePostClick = useCallback(
      (postId: string) => {
        if (isSwipingOrTransitioning) return;
        setExpandedPost((prev) => (prev === postId ? null : postId));
      },
      [isSwipingOrTransitioning],
    );

    const handleBusinessView = useCallback(
      (e: React.MouseEvent, businessId: string, post: Post) => {
        e.stopPropagation();
        onFlyToBusiness?.(businessId, post);
      },
      [onFlyToBusiness],
    );

    const handlePostDelete = useCallback(
      async (postId: string) => {
        const success = await removePost(postId);
        if (success && expandedPost === postId) {
          setExpandedPost(null);
          setCommentText("");
        }
      },
      [removePost, expandedPost],
    );

    useEffect(() => {
      if (!expandedPost) setCommentText("");
    }, [expandedPost]);

    if (loading && posts.length === 0) {
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-yellow mx-auto mb-4"></div>
            <p className="text-app-gray-medium">Loading posts...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full">
        {(filteredBusinessId || filteredUserStories) && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-white border-b border-app-gray-light">
            <div className="flex items-center justify-between p-4">
              <button onClick={onBackToAllPosts} className="text-app-gray-dark hover:text-app-black transition-colors">
                ← Back
              </button>
              <h2 className="text-lg font-medium text-app-black">{filteredUserStories ? "My Stories" : "Business Stories"}</h2>
              <div className="w-16"></div>
            </div>
          </div>
        )}

        <div ref={scrollContainerRef} className="h-full overflow-y-auto pb-20 pt-20">
          <div className="space-y-4 px-4 flex flex-col items-center">
            {paginatedPosts.map((post) => {
              const isSystem = post.author === "System";
              return (
                <div key={post.id} className="relative w-full max-w-2xl">
                  <div
                    className={`app-popup-transparent p-4 cursor-pointer ${
                      isSystem && fadeOutSystemPost ? "animate-fade-out opacity-0 transition-opacity duration-500" : ""
                    }`}
                    onClick={() => handlePostClick(post.id)}
                  >
                    <div className="relative z-10 pb-10">
                      <div className="flex items-start justify-between mb-2">
                        <TranslatedText
                          text={post.text}
                          className={`flex-1 pr-4 break-words ${isSystem ? "text-app-gray-medium italic" : "text-app-black"}`}
                        />
                        <div className="flex-shrink-0 w-16 flex justify-end mt-1 my-0">
                          {post.businessId && (
                            <button
                              onClick={(e) => handleBusinessView(e, post.businessId!, post)}
                              className="text-2xl hover:scale-110 transition-transform"
                              title="View business location and details"
                            >
                              👀
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="absolute bottom-1 left-1">
                        <span className="text-xs text-gray-400">{isSystem ? "Click to share!" : formatTimeAgo(post.createdAt)}</span>
                      </div>

                      {!isSystem && (
                        <div className="absolute bottom-1 right-1">
                          <VotingComponent
                            votesTotal={post.votesTotal}
                            userVote={post.userVote}
                            onVote={(voteType) => votePost(post.id, voteType)}
                            isOwner={post.userId !== SYSTEM_USER_ID && post.author === "You"}
                            onDelete={() => handlePostDelete(post.id)}
                          />
                        </div>
                      )}
                    </div>

                    {expandedPost === post.id && (
                      <div className="mt-4 pt-4 border-t border-app-gray-light space-y-2">
                        {(() => {
                          const orderedComments = (commentsByPostId.get(post.id) ?? []).slice().sort((a, b) => {
                            if (a.author === post.author && b.author !== post.author) return -1;
                            if (b.author === post.author && a.author !== post.author) return 1;
                            return a.createdAt.getTime() - b.createdAt.getTime();
                          });

                          if (orderedComments.length === 0) {
                            return <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">Be the first to share! 😉</h4>;
                          }

                          const usedCombinations = new Set<string>();
                          return orderedComments.map((comment) => {
                            const identity = getCommenterIdentity(comment.id, comment.author === post.author, usedCombinations);
                            return (
                              <div key={comment.id} className="flex items-center gap-2 py-2">
                                <CommenterBadge label={identity.label} color={identity.color} isOP={identity.isOP} />
                                <div className="flex-1 flex items-center justify-between gap-2">
                                  <TranslatedText text={comment.text} className="text-sm text-app-gray-dark flex-1" />
                                  <div className="flex-shrink-0">
                                    <VotingComponent
                                      votesTotal={comment.votesTotal}
                                      userVote={comment.userVote}
                                      onVote={(voteType) => votePost(comment.id, voteType)}
                                      isOwner={comment.author === "You"}
                                      onDelete={() => removePost(comment.id)}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {loading && posts.length > 0 && (
            <div className="flex justify-center py-6">
              <div className="text-muted-foreground">Loading more posts...</div>
            </div>
          )}
        </div>

        {currentSlide === 2 && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
            {expandedPost ? (
              <div className="relative">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={commentPlaceholder}
                  className="search-bar pr-14"
                  onKeyDown={(e) => e.key === "Enter" && handleCommentSubmit()}
                />
                <button onClick={handleCommentSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">
                  🗣️
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder={postPlaceholder}
                  className="search-bar pr-14"
                  onKeyDown={(e) => e.key === "Enter" && handlePostSubmit()}
                />
                <button onClick={handlePostSubmit} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent">
                  🗣️
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

ExplorePage.displayName = "ExplorePage";

export default ExplorePage;
