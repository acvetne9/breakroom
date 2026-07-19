import React, { useState, useMemo, memo, useEffect, useCallback, useRef } from "react";
import { Eye } from "lucide-react";
import { isProfane } from "../utils/profanityFilter";
import { usePostsContext } from "./PostsProvider";
import VotingComponent from "./VotingComponent";
import { formatTimeAgo } from "../utils/timeAgo";
import { TranslatedText } from "./TranslatedText";
import { supabase } from "@/integrations/supabase/client";
import { CommenterBadge } from "./CommenterBadge";
import { getCommenterIdentity } from "@/utils/commenterIdentity";
import { useIsMobile } from "@/hooks/use-mobile";

interface Post {
  id: string;
  author: string;
  text: string;
  businessId?: string;
  businessName?: string;
  images?: string[];
  isStory?: boolean;
  isJobUpdate?: boolean;
  linkedLocation?: string;
  votesTotal: number;
  userVote?: "up" | "down" | null;
  createdAt: Date;
  timestamp?: string;
  isComment?: string;
  userId?: string;
}

interface ExplorePageProps {
  filteredBusinessId?: string;
  filteredUserStories?: boolean;
  onBusinessView?: (businessId: string) => void;
  onExpandedPostChange?: (postId: string | null) => void;
  onCommentSubmit?: (postId: string, comment: string) => void;
  onBackToAllPosts?: () => void;
  onNavigateToHomeBusiness?: (businessId: string) => void;
  onBusinessPreview?: (businessId: string) => void;
  onFlyToBusiness?: (businessId: string, post?: any) => void;
  currentSlide?: number;
}

const ExplorePage: React.FC<ExplorePageProps> = memo(({
  filteredBusinessId,
  filteredUserStories,
  onBusinessView,
  onExpandedPostChange,
  onCommentSubmit,
  onBackToAllPosts,
  onNavigateToHomeBusiness,
  onBusinessPreview,
  onFlyToBusiness,
  currentSlide = 2,
}) => {
  const { posts, loading, hasMore, submitPost, votePost, removePost, loadMore, trackCommentedPost } = usePostsContext();
  const isMobile = useIsMobile();
  
  // Debug logging
  useEffect(() => {
    console.log('🎯 ExplorePage props changed:', {
      filteredBusinessId,
      filteredUserStories,
      currentSlide
    });
  }, [filteredBusinessId, filteredUserStories, currentSlide]);
  
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [fadeOutSystemPost, setFadeOutSystemPost] = useState(false);
  const [hideSystemPost, setHideSystemPost] = useState(false);
  const [isSwipingOrTransitioning, setIsSwipingOrTransitioning] = useState(true);
  const [inputBoxVisible, setInputBoxVisible] = useState(false);

  const defaultPlaceholder = filteredBusinessId ? "Thoughts about this business?" : "How's work?";
  const [postPlaceholder, setPostPlaceholder] = useState(defaultPlaceholder);
  const [comments, setComments] = useState<{ [postId: string]: any[] }>({});
  const [postText, setPostText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentPlaceholder, setCommentPlaceholder] = useState("Leave a comment!");
  const [visibleCount, setVisibleCount] = useState(25);

  // Use ref to track if scroll handler is attached
  const infiniteScrollHandlerAttached = useRef(false);

  useEffect(() => {
    if (currentSlide !== 2) {
      setIsSwipingOrTransitioning(true);
      setInputBoxVisible(false);
    } else {
      const timer = setTimeout(() => {
        setIsSwipingOrTransitioning(false);
        setInputBoxVisible(true);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [currentSlide]);

  // Memoized infinite scroll handler
  const handleInfiniteScroll = useCallback(() => {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = document.documentElement.scrollTop;
    const clientHeight = document.documentElement.clientHeight;

    if (scrollHeight - scrollTop - clientHeight < 500 && !loading && hasMore) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);

  // Attach infinite scroll listener only once
  useEffect(() => {
    if (!infiniteScrollHandlerAttached.current) {
      window.addEventListener("scroll", handleInfiniteScroll);
      infiniteScrollHandlerAttached.current = true;
    }

    return () => {
      if (infiniteScrollHandlerAttached.current) {
        window.removeEventListener("scroll", handleInfiniteScroll);
        infiniteScrollHandlerAttached.current = false;
      }
    };
  }, [handleInfiniteScroll]);

  useEffect(() => {
    setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
  }, [filteredBusinessId]);

  const { displayPosts, realPostCount } = useMemo(() => {
    console.log('🔍 ExplorePage displayPosts recalculating:', {
      filteredBusinessId,
      filteredUserStories,
      totalPosts: posts.length,
      userPosts: posts.filter(p => p.author === "You").length
    });

    let filtered: Post[] = [];

    if (filteredBusinessId) {
      filtered = posts.filter((post) => post.businessId === filteredBusinessId && !post.isJobUpdate && !post.isComment);
      console.log('📍 Filtering by business:', filteredBusinessId, 'Found:', filtered.length);
    } else if (filteredUserStories) {
      filtered = posts.filter((post) => post.author === "You" && !post.isJobUpdate && !post.isComment);
      console.log('👤 Filtering by user stories - Found:', filtered.length, 'posts');
    } else {
      filtered = posts.filter((post) => !post.isComment);
      console.log('📋 Showing all posts:', filtered.length);
    }

    const realBusinessPosts = filtered.filter((post) => post.author !== "System");

    if (filteredBusinessId && realBusinessPosts.length === 0) {
      const defaultPost: Post = {
        id: `default-${filteredBusinessId}`,
        author: "System",
        text: "Share a thought about this business 💭",
        businessId: filteredBusinessId,
        isStory: true,
        votesTotal: 0,
        userVote: null,
        createdAt: new Date(),
      };
      filtered = [defaultPost, ...filtered];
    }

    return { displayPosts: filtered, realPostCount: realBusinessPosts.length };
  }, [posts, filteredBusinessId, filteredUserStories]);

  useEffect(() => {
    if (filteredBusinessId && realPostCount > 0 && !fadeOutSystemPost && !hideSystemPost) {
      setFadeOutSystemPost(true);
      setTimeout(() => {
        setHideSystemPost(true);
        setFadeOutSystemPost(false);
      }, 500);
    }

    if (!filteredBusinessId || realPostCount === 0) {
      setFadeOutSystemPost(false);
      setHideSystemPost(false);
    }
  }, [realPostCount, filteredBusinessId, fadeOutSystemPost, hideSystemPost]);

  const handlePostSubmit = useCallback(async () => {
    if (!postText.trim()) return;

    if (isProfane(postText)) {
      setPostText("");
      setPostPlaceholder("Post blocked: Inappropriate content detected");
      return;
    }

    const success = await submitPost(postText, filteredBusinessId);
    if (success) {
      setPostText("");
      setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
    } else {
      setPostText("");
      setPostPlaceholder("Failed to create post. Please try again.");
    }
  }, [postText, submitPost, filteredBusinessId]);

  const handleCommentSubmit = useCallback(async () => {
    if (!commentText.trim() || !expandedPost) return;

    if (isProfane(commentText)) {
      setCommentText("");
      return;
    }

    const success = await submitPost(commentText, undefined, false, undefined, undefined, undefined, expandedPost);

    if (success) {
      trackCommentedPost(expandedPost);
      setCommentText("");
      setCommentPlaceholder("Leave a comment!");
    } else {
      setCommentPlaceholder("Connection error. Please try again.");
      setCommentText("");
    }
  }, [commentText, expandedPost, submitPost, trackCommentedPost]);

  const handlePostClick = useCallback((postId: string) => {
    if (isSwipingOrTransitioning) {
      return;
    }

    setExpandedPost((prev) => (prev === postId ? null : postId));
    onExpandedPostChange?.(expandedPost === postId ? null : postId);
  }, [isSwipingOrTransitioning, expandedPost, onExpandedPostChange]);

  const handleBusinessView = useCallback((e: React.MouseEvent, businessId: string, post?: any) => {
    e.stopPropagation();

    if (onFlyToBusiness) {
      onFlyToBusiness(businessId, post);
    } else if (onNavigateToHomeBusiness) {
      onNavigateToHomeBusiness(businessId);
    } else {
      onBusinessView?.(businessId);
    }
  }, [onFlyToBusiness, onNavigateToHomeBusiness, onBusinessView]);

  const handlePostVote = useCallback(async (postId: string, voteType: "up" | "down") => {
    await votePost(postId, voteType);
  }, [votePost]);

  const handlePostDelete = useCallback(async (postId: string) => {
    const success = await removePost(postId);

    if (!success) {
      return;
    }

    if (expandedPost === postId) {
      setExpandedPost(null);
      setCommentText("");
    }
  }, [removePost, expandedPost]);

  useEffect(() => {
    if (!expandedPost) {
      setCommentText("");
      setPostPlaceholder(filteredBusinessId ? "Thoughts about this business?" : "How's work?");
    }
  }, [expandedPost, filteredBusinessId]);

  // Build a lookup of comments keyed by parent post id once per posts change,
  // instead of filtering all posts on every render / per expanded post.
  const commentsByPostId = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      if (post.isComment) {
        const existing = map.get(post.isComment);
        if (existing) {
          existing.push(post);
        } else {
          map.set(post.isComment, [post]);
        }
      }
    }
    return map;
  }, [posts]);

  const getPostComments = useCallback(
    (postId: string) => commentsByPostId.get(postId) ?? [],
    [commentsByPostId],
  );

  // Incremental rendering: grow the number of locally-rendered posts as the
  // user scrolls near the bottom. When the end of the locally-rendered posts
  // is reached and the hook still has more server posts, trigger loadMore.
  const handlePaginationScroll = useCallback(() => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      if (visibleCount < displayPosts.length) {
        setVisibleCount((prev) => Math.min(prev + 25, displayPosts.length));
      } else if (hasMore && !loading) {
        loadMore();
      }
    }
  }, [displayPosts.length, visibleCount, hasMore, loading, loadMore]);

  useEffect(() => {
    window.addEventListener("scroll", handlePaginationScroll);
    return () => {
      window.removeEventListener("scroll", handlePaginationScroll);
    };
  }, [handlePaginationScroll]);

  useEffect(() => {
    setVisibleCount(25);
  }, [displayPosts]);

  const paginatedPosts = useMemo(() => {
    return displayPosts.slice(0, visibleCount);
  }, [displayPosts, visibleCount]);

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
      {/* Header for filtered views */}
      {(filteredBusinessId || filteredUserStories) && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-white border-b border-app-gray-light">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={onBackToAllPosts}
              className="text-app-gray-dark hover:text-app-black transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-lg font-medium text-app-black">
              {filteredUserStories ? "My Stories" : "Business Stories"}
            </h2>
            <div className="w-16"></div> {/* Spacer for centering */}
          </div>
        </div>
      )}

      <div className={`h-full overflow-y-auto pb-20 ${filteredBusinessId || filteredUserStories ? "pt-20" : "pt-20"}`}>
        <div className="space-y-4 px-4 flex flex-col items-center">
          {paginatedPosts.map((post) => (
            <div key={post.id} className="relative w-full max-w-2xl">
              <div
                className={`app-popup-transparent p-4 cursor-pointer ${post.images && post.images.length >= 5 ? "relative overflow-hidden" : ""} ${
                  post.author === "System" && fadeOutSystemPost
                    ? "animate-fade-out opacity-0 transition-opacity duration-500"
                    : ""
                }`}
                onClick={() => handlePostClick(post.id)}
                style={{
                  backgroundImage: post.images && post.images.length >= 5 ? `url(${post.images[0]})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {post.images && post.images.length >= 5 && (
                  <div className="absolute inset-0 opacity-30">
                    <div className="grid grid-cols-3 h-full">
                      {post.images.slice(0, 6).map((img, idx) => (
                        <div key={idx} className="bg-cover bg-center" style={{ backgroundImage: `url(${img})` }} />
                      ))}
                    </div>
                  </div>
                )}

                <div
                  className={`relative z-10 pb-10 ${post.images && post.images.length >= 5 ? "post-overlay rounded-lg p-3" : ""}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <TranslatedText
                      text={post.text}
                      className={`flex-1 pr-4 break-words overflow-wrap-break-word ${
                        post.author === "System" ? "text-app-gray-medium italic" : "text-app-black"
                      }`}
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
                    <span className="text-xs text-gray-400">
                      {post.author === "System" ? "Click to share!" : formatTimeAgo(post.createdAt)}
                    </span>
                  </div>

                  {post.author !== "System" && (
                    <div className="absolute bottom-1 right-1">
                      <VotingComponent
                        votesTotal={post.votesTotal}
                        userVote={post.userVote}
                        onVote={(voteType) => handlePostVote(post.id, voteType)}
                        isOwner={post.userId === "00000000-0000-0000-0000-000000000000" ? false : post.author === "You"}
                        onDelete={() => handlePostDelete(post.id)}
                      />
                    </div>
                  )}
                </div>

                {expandedPost === post.id && (
                  <div className="mt-4 pt-4 border-t border-app-gray-light space-y-2">
                    {(() => {
                      const postComments = getPostComments(post.id);

                      const orderedComments = postComments.slice().sort((a, b) => {
                        if (a.author === post.author && b.author !== post.author) return -1;
                        if (b.author === post.author && a.author !== post.author) return 1;
                        return a.createdAt.getTime() - b.createdAt.getTime();
                      });

                      if (orderedComments.length === 0) {
                        return (
                          <h4 className="text-sm font-medium mb-2 text-slate-500 text-left">
                            Be the first to share! 😉
                          </h4>
                        );
                      }

                      const usedCombinations = new Set<string>();

                      return orderedComments.map((comment) => {
                        const identity = getCommenterIdentity(
                          comment.id,
                          comment.author === post.author,
                          usedCombinations,
                        );

                        return (
                          <div key={comment.id} className="flex items-center gap-2 py-2">
                            <CommenterBadge label={identity.label} color={identity.color} isOP={identity.isOP} />

                            <div className="flex-1 flex items-center justify-between gap-2">
                              <TranslatedText text={comment.text} className="text-sm text-app-gray-dark flex-1" />
                              <div className="flex-shrink-0">
                                <VotingComponent
                                  votesTotal={comment.votesTotal}
                                  userVote={comment.userVote}
                                  onVote={(voteType) => handlePostVote(comment.id, voteType)}
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
          ))}
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
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleCommentSubmit();
                  }
                }}
              />
              <button
                onClick={handleCommentSubmit}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
              >
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
                onKeyPress={(e) => {
                  if (e.key === "Enter") handlePostSubmit();
                }}
              />
              <button
                onClick={handlePostSubmit}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-lg bg-transparent"
              >
                🗣️
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ExplorePage.displayName = 'ExplorePage';

export default ExplorePage;
