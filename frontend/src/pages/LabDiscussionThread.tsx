import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";
import MentionComposer, { getMentionIdsForSubmit } from "../components/labs/MentionComposer";
import type { MentionMember } from "../components/labs/mentionUtils";
import {
  downloadDiscussionAttachment,
  formatAttachmentSize,
  type DiscussionAttachmentRow,
} from "../components/labs/discussionAttachments";

type Comment = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  author: { id: string | null; name: string; isTeacher: boolean };
  canEdit: boolean;
  canDelete: boolean;
};

function highlightMentions(text: string) {
  return text.replace(/@([^\s@]+)/g, "**@$1**");
}

export default function LabDiscussionThread() {
  const { courseId, labId, postId } = useParams();
  const composerRef = useRef<HTMLDivElement>(null);
  const [post, setPost] = useState<any>(null);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [downloadingAttachId, setDownloadingAttachId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/labs/${labId}/discussions/${postId}`);
    setPost(data.post);
  }, [labId, postId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!courseId) return;
    void api
      .get<{ members: MentionMember[] }>(`/courses/${courseId}/discussion-members`)
      .then(({ data }) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, [courseId]);

  function startReply(c: Comment) {
    setReplyTo(c);
    const prefix = c.author.name ? `@${c.author.name} ` : "";
    setBody(prefix);
    setMentionIds(c.author.id ? [c.author.id] : []);
    setErr(null);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function cancelReply() {
    setReplyTo(null);
    setBody("");
    setMentionIds([]);
  }

  async function sendComment() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setErr(null);
    try {
      await api.post(`/labs/${labId}/discussions/${postId}/comments`, {
        body: trimmed,
        parentId: replyTo?.id ?? null,
        mentionUserIds: getMentionIdsForSubmit(trimmed, members, mentionIds),
      });
      cancelReply();
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "回复失败");
    } finally {
      setSending(false);
    }
  }

  if (!post) {
    return (
      <div className="container">
        <div className="muted">加载中...</div>
      </div>
    );
  }

  const comments = (post.comments ?? []) as Comment[];
  const attachments = (post.attachments ?? []) as DiscussionAttachmentRow[];
  const roots = comments.filter((c) => !c.parentId);
  const childrenOf = (id: string) => comments.filter((c) => c.parentId === id);
  const parentOf = (id: string | null) => (id ? comments.find((c) => c.id === id) : null);

  function renderComment(c: Comment, depth: number, floorNo?: number) {
    const parent = parentOf(c.parentId);
    return (
      <article
        key={c.id}
        className={depth === 0 ? "disc-floor" : "disc-reply"}
        style={depth > 0 ? { marginLeft: Math.min(depth * 16, 48) } : undefined}
      >
        <div className="disc-comment">
          <div className="disc-comment__head">
            <div className="disc-comment__author">
              {depth === 0 && floorNo != null ? (
                <span className="disc-floor__no">#{floorNo}</span>
              ) : null}
              <strong>{c.author.name}</strong>
              {c.author.isTeacher ? (
                <span className="disc-badge disc-badge--teacher">教师</span>
              ) : null}
              {parent ? (
                <span className="disc-comment__reply-to muted">
                  回复 <strong>{parent.author.name}</strong>
                </span>
              ) : null}
            </div>
            <time className="disc-comment__time">{new Date(c.createdAt).toLocaleString()}</time>
          </div>
          <div className="lab-md-root disc-comment__body">
            <ReactMarkdown>{highlightMentions(c.body)}</ReactMarkdown>
          </div>
          <div className="disc-comment__actions">
            <button type="button" className="btn disc-reply-btn" onClick={() => startReply(c)}>
              回复
            </button>
          </div>
        </div>
        {childrenOf(c.id).length > 0 ? (
          <div className="disc-replies">
            {childrenOf(c.id).map((ch) => renderComment(ch, depth + 1))}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="disc-thread-page">
      <div className="container disc-thread-page__inner">
        <Link to={`/courses/${courseId}/labs/${labId}`} className="muted">
          返回实验页
        </Link>

        <div className={`card disc-post ${post.resolved ? "disc-post--resolved" : ""}`}>
          <div className="disc-post__head">
            <h2 className="disc-post__title">{post.title}</h2>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {post.pinned ? <span className="disc-badge disc-badge--pin">置顶</span> : null}
              {post.resolved ? <span className="disc-badge disc-badge--ok">已解决</span> : null}
              {post.author?.isTeacher ? (
                <span className="disc-badge disc-badge--teacher">??</span>
              ) : null}
            </div>
          </div>
          <div className="disc-muted">
            {post.author?.name} · {post.viewCount} 次浏览
          </div>
          <div className="lab-md-root disc-post__body">
            <ReactMarkdown>{post.body}</ReactMarkdown>
          </div>
          {attachments.length > 0 ? (
            <div className="disc-post__attachments">
              <div className="disc-post__attachments-title">附件</div>
              <ul className="disc-attach-list disc-attach-list--readonly">
                {attachments.map((a) => (
                  <li key={a.id} className="disc-attach-list__item">
                    <button
                      type="button"
                      className="disc-attach-list__name"
                      disabled={downloadingAttachId === a.id}
                      onClick={() => {
                        setDownloadingAttachId(a.id);
                        setErr(null);
                        void downloadDiscussionAttachment(a.id, a.fileName)
                          .catch((e: unknown) => {
                            const msg =
                              typeof e === "object" && e !== null && "response" in e
                                ? (e as { response?: { data?: { error?: string } } }).response?.data
                                    ?.error
                                : null;
                            setErr(msg ?? "下载失败");
                          })
                          .finally(() => setDownloadingAttachId(null));
                      }}
                    >
                      {downloadingAttachId === a.id ? "下载中..." : a.fileName}
                    </button>
                    {a.sizeBytes ? (
                      <span className="muted disc-attach-list__size">
                        {formatAttachmentSize(a.sizeBytes)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="row disc-post__actions">
            {post.canResolve ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await api.patch(`/labs/${labId}/discussions/${postId}`, {
                    resolved: !post.resolved,
                  });
                  await load();
                }}
              >
                {post.resolved ? "取消已解决" : "标记已解决"}
              </button>
            ) : null}
            {post.canPin ? (
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await api.patch(`/labs/${labId}/discussions/${postId}`, {
                    pinned: !post.pinned,
                  });
                  await load();
                }}
              >
                {post.pinned ? "取消置顶" : "置顶"}
              </button>
            ) : null}
            {post.canDelete ? (
              <button
                type="button"
                className="btn"
                style={{ color: "var(--danger)" }}
                onClick={async () => {
                  if (!confirm("确定删除此帖？")) return;
                  await api.delete(`/labs/${labId}/discussions/${postId}`);
                  window.location.href = `/courses/${courseId}/labs/${labId}`;
                }}
              >
                删除
              </button>
            ) : null}
          </div>
        </div>

        <section className="disc-comments">
          <h3 className="disc-comments__title">
            评论
            <span className="disc-muted">（{comments.length}）</span>
          </h3>
          {roots.length === 0 ? (
            <div className="disc-comments__empty muted">暂无评论</div>
          ) : (
            <div className="disc-floors">
              {roots.map((c, i) => renderComment(c, 0, i + 1))}
            </div>
          )}
        </section>
      </div>

      <div className="disc-composer-bar" ref={composerRef}>
        <div className="container disc-composer-bar__inner">
          {replyTo ? (
            <div className="disc-composer-bar__target">
              <span>
                回复 <strong>{replyTo.author.name}</strong>
                {replyTo.parentId ? " 的评论" : " 的楼层"}
              </span>
              <button type="button" className="btn disc-composer-bar__cancel" onClick={cancelReply}>
                取消
              </button>
            </div>
          ) : null}
          <div className="disc-composer-bar__box card">
            <MentionComposer
              courseId={courseId!}
              value={body}
              onChange={setBody}
              mentionUserIds={mentionIds}
              onMentionUserIdsChange={setMentionIds}
              rows={3}
              placeholder="写下回复，输入 @ 提醒成员（Shift+Enter 换行）"
              disabled={sending}
              autoFocus={Boolean(replyTo)}
            />
            {err ? <div className="err disc-composer-bar__err">{err}</div> : null}
            <div className="disc-composer-bar__actions">
              <span className="disc-muted">Markdown 支持 @ 提醒成员</span>
              <button
                type="button"
                className="btn primary"
                disabled={sending || !body.trim()}
                onClick={() => void sendComment()}
              >
                {sending ? "发送中…" : replyTo ? "发表回复" : "发表"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
