import { useMemo, useState } from "react";
import Icon from "../../../shared/icons/Icon.jsx";

const lineStyle = (fromX, fromY, toX, toY) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  return {
    "--from-x": `${fromX}px`,
    "--from-y": `${fromY}px`,
    "--line-length": `${Math.sqrt((dx * dx) + (dy * dy))}px`,
    "--line-angle": `${Math.atan2(dy, dx) * (180 / Math.PI)}deg`
  };
};

const rootScatterPositions = [
  { x: -620, y: -270 },
  { x: 650, y: 260 },
  { x: 0, y: 0 },
  { x: -300, y: 390 },
  { x: 410, y: -385 },
  { x: -820, y: 150 },
  { x: 850, y: -155 },
  { x: -910, y: -420 },
  { x: 930, y: 440 }
];

const findTopicPath = (topics, topicId, path = []) => {
  for (const topic of topics) {
    const nextPath = [...path, topic];
    if (String(topic.id) === String(topicId)) return nextPath;
    const childPath = findTopicPath(topic.children || [], topicId, nextPath);
    if (childPath.length) return childPath;
  }
  return [];
};

const collectTopicMap = (rootTopics, activeTopicId) => {
  const activePath = findTopicPath(rootTopics, activeTopicId);
  const activeRoot = activePath[0] || null;
  const selectedTopic = activePath[activePath.length - 1] || null;

  const rootNodes = rootTopics.map((rootTopic, index) => {
    const base = rootTopics.length === 1 ? { x: 0, y: 0 } : rootScatterPositions[index % rootScatterPositions.length];
    const ring = Math.floor(index / rootScatterPositions.length);
    return {
      topic: rootTopic,
      x: base.x + (ring * 180),
      y: base.y + (ring * 130),
      isActive: activeRoot && String(activeRoot.id) === String(rootTopic.id)
    };
  });

  const descendantNodes = [];
  const links = [];

  const layoutChildren = (parentTopic, parentNode, depth = 1, branchSide = null) => {
    const children = parentTopic.children || [];

    children.forEach((child, index) => {
      const side = branchSide || (index % 2 === 0 ? 1 : -1);
      const sameSideIndex = children.slice(0, index).filter((_, childIndex) => (branchSide || (childIndex % 2 === 0 ? 1 : -1)) === side).length;
      const sameSideTotal = children.filter((_, childIndex) => (branchSide || (childIndex % 2 === 0 ? 1 : -1)) === side).length;
      const yOffset = (sameSideIndex - ((sameSideTotal - 1) / 2)) * (depth === 1 ? 170 : 130);
      const node = {
        topic: child,
        x: parentNode.x + (side * (depth === 1 ? 300 : 220)),
        y: parentNode.y + yOffset,
        depth,
        side,
        isSelected: selectedTopic && String(child.id) === String(selectedTopic.id),
        isPath: activePath.some((pathTopic) => String(pathTopic.id) === String(child.id))
      };

      descendantNodes.push(node);
      links.push({ from: parentNode, to: node });
      layoutChildren(child, node, depth + 1, side);
    });
  };

  rootNodes.forEach((rootNode) => {
    layoutChildren(rootNode.topic, rootNode);
  });

  return { rootNodes, descendantNodes, links, selectedTopic };
};

const TopicTreeGraph = ({ rootTopics, activeTopic, onMoveToTopic }) => {
  const { rootNodes, descendantNodes, links, selectedTopic } = collectTopicMap(rootTopics, activeTopic?.id);

  if (!rootTopics.length) return null;

  return (
    <div className="topic-map" aria-label="Topic synapse map">
      {links.map((link) => (
        <span className="topic-map-link" key={`${link.from.topic.id}-${link.to.topic.id}`} style={lineStyle(link.from.x, link.from.y, link.to.x, link.to.y)} aria-hidden="true" />
      ))}

      {rootNodes.map((node) => (
        <button className={`topic-map-node is-root ${node.isActive ? "is-active" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px` }} onClick={(event) => onMoveToTopic(event, node.topic.id, { openPosts: true })}>
          <span>{node.topic.name}</span>
        </button>
      ))}

      {descendantNodes.map((node) => (
        <button className={`topic-map-node ${node.depth > 1 ? "is-small" : ""} ${node.isPath ? "is-path" : ""} ${node.isSelected ? "is-selected" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px` }} onClick={(event) => onMoveToTopic(event, node.topic.id, { openPosts: true })}>
          <span>{node.topic.name}</span>
        </button>
      ))}

      {selectedTopic && !descendantNodes.length && (
        <div className="topic-map-hint">하위 토픽이 없습니다</div>
      )}
    </div>
  );
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const buildCommentTree = (comments = []) => {
  const commentMap = new Map();
  const roots = [];

  comments.forEach((comment) => {
    commentMap.set(String(comment.id), { ...comment, children: [] });
  });

  commentMap.forEach((comment) => {
    if (comment.parentId && commentMap.has(String(comment.parentId))) {
      commentMap.get(String(comment.parentId)).children.push(comment);
      return;
    }
    roots.push(comment);
  });

  return roots;
};

// 중앙 작업 영역: 상단 경로/보기 전환과 Synapse 그래프 또는 Post List를 렌더링합니다.
export default function Workspace({
  activeBrain,
  activeTopic,
  graph,
  graphClassName,
  graphFieldRef,
  pageData,
  brainSearch,
  openBrainTabs,
  view,
  isAuthenticated,
  isBrainSearchView,
  canManageWorkspace,
  manageMode,
  onRoute,
  onSearchBrains,
  onJoinBrain,
  onSelectBrain,
  onCloseBrainTab,
  onMoveToTopic,
  onOpenNodeDetail,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onFocusPoint,
  onSetGraph,
  onSetView,
  onZoom,
  onOpenModal,
  onOpenNodeModal,
  onOpenTopicPanel,
  nodeDetail,
  commentDraft,
  onCloseNodeDetail,
  onToggleNodeRecommend,
  onUpdateCommentDraft,
  onSubmitComment,
  onStartCommentReply,
  onStartCommentEdit,
  onCancelCommentDraft,
  onDeleteComment,
  isRightPanelOpen,
  onToggleManageMode,
  onToggleRight
}) {
  const [postQuery, setPostQuery] = useState("");
  const hasActiveTopic = Boolean(activeTopic);
  const visibleRootTopics = pageData.topics || [];
  const filteredNodes = useMemo(() => {
    const keyword = postQuery.trim().toLowerCase();
    if (!keyword) return pageData.nodes;
    return pageData.nodes.filter((node) => (
      node.title?.toLowerCase().includes(keyword)
      || node.content?.toLowerCase().includes(keyword)
      || node.writer?.toLowerCase().includes(keyword)
    ));
  }, [pageData.nodes, postQuery]);
  const commentTree = useMemo(() => buildCommentTree(nodeDetail?.data?.comments || []), [nodeDetail?.data?.comments]);
  const activeCommentTarget = useMemo(() => {
    if (!nodeDetail?.data || (!commentDraft.parentId && !commentDraft.editingId)) return null;
    const targetId = commentDraft.editingId || commentDraft.parentId;
    return nodeDetail.data.comments.find((comment) => String(comment.id) === String(targetId)) || null;
  }, [commentDraft.editingId, commentDraft.parentId, nodeDetail?.data]);
  const currentUserName = pageData.user?.name || "";
  const currentRole = String(pageData.user?.role || "").toUpperCase();
  const canModerateComments = ["ADMIN", "MANAGER", "LEADER"].includes(currentRole);

  const renderComment = (comment, depth = 0) => {
    const canEditComment = canModerateComments || (currentUserName && comment.writer === currentUserName);

    return (
      <div className="comment-thread" key={comment.id} style={{ "--comment-depth": depth }}>
        <article className={`comment-card ${depth ? "is-reply" : ""}`}>
          <div className="comment-avatar"><Icon name="user" /></div>
          <div className="comment-content">
            <div className="comment-meta">
              <strong>{comment.writer}</strong>
              {comment.createdAt && <span>{formatDate(comment.createdAt)}</span>}
            </div>
            <p>{comment.content}</p>
            <div className="comment-actions" aria-label={`${comment.writer} 댓글 작업`}>
              <button type="button" onClick={() => onStartCommentReply(comment)}>답글</button>
              {canEditComment && (
                <>
                  <button type="button" onClick={() => onStartCommentEdit(comment)}>수정</button>
                  <button className="is-danger" type="button" onClick={() => onDeleteComment(comment)}>삭제</button>
                </>
              )}
            </div>
          </div>
        </article>
        {comment.children.length > 0 && (
          <div className="comment-replies">
            {comment.children.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const submitBrainSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSearchBrains(String(formData.get("brainKeyword") || "").trim(), 0);
  };
  const hasBrainTabs = isAuthenticated && openBrainTabs.length > 0;

  return (
    <section className={`workspace ${hasBrainTabs ? "has-brain-tabs" : ""}`} aria-label="SSArain workspace">
      {hasBrainTabs && (
        <nav className="brain-tab-strip" aria-label="열린 Brain 탭">
          <div className="brain-tabs" role="tablist">
            {openBrainTabs.map((brain) => (
              <button
                key={brain.id}
                className={`brain-tab ${String(brain.id) === String(pageData.activeBrainId) ? "is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={String(brain.id) === String(pageData.activeBrainId)}
                onClick={(event) => onSelectBrain(event, brain.id)}
              >
                <span>{brain.name}</span>
                <span className="brain-tab-close" role="button" tabIndex={-1} onClick={(event) => onCloseBrainTab(event, brain.id)} aria-label={`${brain.name} 탭 닫기`}>×</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* 현재 Brain/Topic 경로와 보기 전환, 마이페이지/알림 버튼입니다. */}
      <header className="workspace-header">
        <nav className="breadcrumb" aria-label="현재 위치">
          {activeBrain && <button type="button" onClick={(event) => onRoute(event, `/brains/${activeBrain.id}`)}>{activeBrain.name}</button>}
          {activeBrain && activeTopic && <span aria-hidden="true">›</span>}
          {activeTopic && <button className="crumb-chip" type="button" onClick={(event) => onRoute(event, `/topics/${activeTopic.id}`)}>{activeTopic.name}</button>}
        </nav>
        <div className="header-actions">
          {canManageWorkspace && (
            <button className={`header-button manage-mode-button ${manageMode ? "is-active" : ""}`} type="button" onClick={onToggleManageMode} aria-pressed={manageMode}>
              <Icon name="settings" />
              <span>관리모드</span>
            </button>
          )}
          <div className="view-tabs" role="tablist" aria-label="보기 전환">
            <button className={`view-tab ${view === "synapse" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "synapse"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/synapse` : "/main/synapse"); onSetView("synapse"); }}><Icon name="synapse" /><span>Synapse View</span></button>
            <button className={`view-tab ${view === "posts" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "posts"} onClick={(event) => { onRoute(event, activeTopic ? `/topics/${activeTopic.id}/posts` : "/main/posts"); onSetView("posts"); }}><Icon name="list" /><span>Post List</span></button>
          </div>
          <button className="header-button" type="button" onClick={(event) => onRoute(event, isAuthenticated ? "/mypage" : "/login")}>{isAuthenticated ? "마이페이지" : "로그인"}</button>
          <button className={`header-button notice-trigger ${isRightPanelOpen ? "is-open" : ""}`} type="button" onClick={(event) => { onRoute(event, "/notifications"); onToggleRight(); }} aria-pressed={isRightPanelOpen}><Icon name="bell" /><span>알림창</span></button>
        </div>
      </header>

      {isBrainSearchView ? (
        <section className="brain-search-view" aria-labelledby="brain-search-heading">
          <form className="brain-search-form" onSubmit={submitBrainSearch}>
            <label htmlFor="brain-search-input" className="sr-only">Brain 명 검색</label>
            <input id="brain-search-input" name="brainKeyword" type="search" defaultValue={brainSearch.query} placeholder="Brain 명 검색" />
            <button type="submit" disabled={brainSearch.isLoading}>{brainSearch.isLoading ? "검색 중" : "검색"}</button>
          </form>

          <div className="brain-search-summary">
            <div>
              <p className="panel-kicker">FIND BRAIN</p>
              <h1 id="brain-search-heading">Brain 찾기</h1>
            </div>
            <span>{brainSearch.totalElements}개 결과</span>
          </div>

          {brainSearch.message ? (
            <p className="brain-search-message" role="status">{brainSearch.message}</p>
          ) : (
            <div className="brain-result-grid">
              {brainSearch.results.map((brain) => (
                <article className="brain-result-card" key={brain.id}>
                  <div className="brain-result-top">
                    <strong>{brain.name}</strong>
                    <span>{brain.adminName || "관리자 미지정"}</span>
                  </div>
                  <p>{brain.description || "등록된 소개 문구가 없습니다."}</p>
                  <div className="brain-result-bottom">
                    <small>가입 인원 {brain.memberNames?.length || 0}명</small>
                    <button type="button" onClick={() => onJoinBrain(brain)}>가입</button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!brainSearch.message && !brainSearch.results.length && !brainSearch.isLoading && (
            <p className="brain-search-empty">검색 결과가 없습니다.</p>
          )}

          <div className="brain-pagination" aria-label="Brain 검색 페이지네이션">
            <button type="button" disabled={brainSearch.isLoading || brainSearch.currentPage <= 0} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage - 1)}>이전</button>
            <span>{brainSearch.totalPages ? `${brainSearch.currentPage + 1} / ${brainSearch.totalPages}` : "0 / 0"}</span>
            <button type="button" disabled={brainSearch.isLoading || !brainSearch.hasNext} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage + 1)}>다음</button>
          </div>
        </section>
      ) : (
        // 그래프 패널입니다. Pointer/Wheel 이벤트는 MainPage에서 받아 카메라 상태를 바꿉니다.
        <div ref={graphFieldRef} className={graphClassName} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          {view === "synapse" && hasActiveTopic ? (
          <>
            {/* CSS 변수로 pan/zoom/tilt 값을 내려서 Prezi식 이동을 표현합니다. */}
            <div className="graph-viewport" style={{ "--pan-x": `${graph.x}px`, "--pan-y": `${graph.y}px`, "--zoom": graph.scale, "--tilt": `${graph.tilt || 0}deg` }}>
              <TopicTreeGraph rootTopics={visibleRootTopics} activeTopic={activeTopic} onMoveToTopic={onMoveToTopic} />
            </div>
            {/* 그래프 확대/축소와 위치 초기화 컨트롤입니다. */}
            <div className="zoom-controls" aria-label="그래프 확대 축소">
              <button type="button" onClick={() => onZoom(graph.scale / 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="축소">-</button>
              <button type="button" onClick={() => onSetGraph({ x: 0, y: 0, scale: 1, tilt: 0 })} aria-label="위치 초기화">{Math.round(graph.scale * 100)}%</button>
              <button type="button" onClick={() => onZoom(graph.scale * 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="확대">+</button>
            </div>
          </>
          ) : view === "posts" && hasActiveTopic && nodeDetail?.isOpen ? (
          <article className="neuron-detail" aria-label="Neuron 상세">
            <button className="neuron-back-button" type="button" onClick={onCloseNodeDetail}>
              ← {activeTopic.name} 목록으로
            </button>

            {nodeDetail.isLoading ? (
              <div className="post-empty-state">
                <Icon name="file" />
                <strong>Neuron을 불러오는 중입니다.</strong>
              </div>
            ) : nodeDetail.status ? (
              <div className="post-empty-state">
                <Icon name="file" />
                <strong>{nodeDetail.status}</strong>
              </div>
            ) : nodeDetail.data ? (
              <>
                <header className="neuron-detail-header">
                  <div>
                    <p className="panel-kicker">NEURON</p>
                    <h1>{nodeDetail.data.title}</h1>
                    <div className="neuron-author-line">
                      <span className="neuron-avatar"><Icon name="user" /></span>
                      <span>{nodeDetail.data.writer}</span>
                      {nodeDetail.data.createdAt && <span><Icon name="clock" />{formatDate(nodeDetail.data.createdAt)}</span>}
                    </div>
                  </div>
                  <button className={`recommend-button ${nodeDetail.liked ? "is-active" : ""}`} type="button" onClick={onToggleNodeRecommend}>
                    <Icon name="plus" />
                    <span>추천 {nodeDetail.data.recommends || 0}</span>
                  </button>
                </header>

                <section className="neuron-body">
                  {nodeDetail.data.content.split("\n").map((line, index) => (
                    <p key={`${nodeDetail.data.id}-${index}`}>{line || "\u00a0"}</p>
                  ))}
                </section>

                <section className="neuron-comments" aria-labelledby="neuron-comments-heading">
                  <div className="neuron-comments-head">
                    <h2 id="neuron-comments-heading"><Icon name="bell" />댓글 {nodeDetail.data.comments.length}</h2>
                  </div>

                  <form className="comment-form" onSubmit={onSubmitComment}>
                    {(commentDraft.parentId || commentDraft.editingId) && (
                      <div className="comment-form-context">
                        <strong>{commentDraft.editingId ? "댓글 수정 중" : "답글 작성 중"}</strong>
                        {activeCommentTarget && <span>{activeCommentTarget.writer} · {activeCommentTarget.content}</span>}
                        <button type="button" onClick={onCancelCommentDraft}>취소</button>
                      </div>
                    )}
                    <textarea value={commentDraft.content} onChange={onUpdateCommentDraft} placeholder={commentDraft.parentId ? "답글을 입력해주세요." : "댓글을 입력해주세요."} maxLength={255} rows={4} />
                    <div className="comment-form-actions">
                      {commentDraft.status && <span role="status">{commentDraft.status}</span>}
                      <button type="submit" disabled={commentDraft.isSubmitting}>
                        {commentDraft.isSubmitting ? "저장 중" : (commentDraft.editingId ? "댓글 수정" : (commentDraft.parentId ? "답글 작성" : "댓글 작성"))}
                      </button>
                    </div>
                  </form>

                  <div className="comment-list">
                    {commentTree.map((comment) => renderComment(comment))}
                    {!nodeDetail.data.comments.length && (
                      <p className="comment-empty">아직 댓글이 없습니다. 첫 의견을 남겨보세요.</p>
                    )}
                  </div>
                </section>
              </>
            ) : null}
          </article>
          ) : view === "posts" && hasActiveTopic ? (
          // Post List 보기에서는 현재 Topic의 문서 목록 형태로 노드를 보여줍니다.
          <div className="post-list">
            <div className="post-list-header">
              <div>
                <p className="panel-kicker">POST LIST</p>
                <h1>{activeTopic.name}</h1>
              </div>
              <div className="post-list-tools">
                <label className="post-search">
                  <Icon name="search" />
                  <input type="search" value={postQuery} onChange={(event) => setPostQuery(event.target.value)} placeholder="Neuron 검색" />
                </label>
                <button className="node-create-button" type="button" onClick={onOpenNodeModal}>
                  <Icon name="plus" />
                  <span>뉴런 추가</span>
                </button>
              </div>
            </div>

            <div className="post-card-list">
              {filteredNodes.map((node) => (
                <button className="post-card" type="button" key={node.id} onClick={(event) => onOpenNodeDetail(event, node.id)}>
                  <span className="post-topic"><Icon name="folder" />{activeTopic.name}</span>
                  <span className="post-card-body">
                    <strong>{node.title}</strong>
                    <small>{node.content || "내용이 없습니다."}</small>
                  </span>
                  <span className="post-card-meta">
                    <span className="post-author"><Icon name="user" />{node.writer || pageData.user.name || "작성자"}</span>
                    {node.createdAt && <span><Icon name="clock" />{formatDate(node.createdAt)}</span>}
                    <span><Icon name="bell" />댓글 {node.comments || 0}</span>
                  </span>
                </button>
              ))}
              {!filteredNodes.length && (
                <div className="post-empty-state">
                  <Icon name="file" />
                  <strong>{postQuery ? "검색 결과가 없습니다." : "아직 작성된 Neuron이 없습니다."}</strong>
                  <span>{postQuery ? "다른 검색어로 다시 찾아보세요." : "뉴런 추가 버튼으로 첫 글을 작성해보세요."}</span>
                </div>
              )}
            </div>
          </div>
          ) : null}
          {manageMode && canManageWorkspace && (
            <div className="manage-action-dock" aria-label="Topic management actions">
              <button className="manage-action-button" type="button" onClick={() => onOpenTopicPanel("manage")}>
                <span>토픽 관리</span>
              </button>
              <button className="manage-action-button danger" type="button" onClick={() => onOpenTopicPanel("delete")}>
                <span>토픽 삭제</span>
              </button>
            </div>
          )}
        </div>
      )}
      {/* 도움말 모달을 여는 플로팅 버튼입니다. */}
      <button className="help-button" type="button" onClick={(event) => { onRoute(event, "/help"); onOpenModal("help"); }} aria-label="도움말">?</button>
    </section>
  );
}
