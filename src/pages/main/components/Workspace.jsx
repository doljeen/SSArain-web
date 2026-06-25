import { memo, useMemo, useState } from "react";
import Icon from "../../../shared/icons/Icon.jsx";
import { collectTopicMap, findTopicPath } from "../config/topicLayout.js";

// MainPage의 중앙 작업 영역입니다.
// Synapse 그래프, Post List, Quiz, Neuron 상세/댓글, Brain 검색 화면을 렌더링합니다.

// 그래프의 Topic/Neuron 연결선을 CSS 변수로 그리기 위한 좌표 계산입니다.
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

// Neuron 카드가 Topic 원/카드를 덮지 않도록 Topic 주변에 충돌 영역을 잡습니다.
const topicBlockerForNode = (topicNode) => {
  const isRoot = topicNode.depth == null;
  const isSmall = topicNode.depth > 1;
  const width = isRoot ? 260 : isSmall ? 240 : 260;
  const height = isRoot ? 260 : isSmall ? 142 : 156;

  return {
    topicId: String(topicNode.topic.id),
    left: topicNode.x - (width / 2),
    right: topicNode.x + (width / 2),
    top: topicNode.y - (height / 2),
    bottom: topicNode.y + (height / 2)
  };
};

// 화면 좌표 기반 충돌 계산용 사각형 유틸입니다.
const rectForPoint = (x, y, width, height) => ({
  left: x - (width / 2),
  right: x + (width / 2),
  top: y - (height / 2),
  bottom: y + (height / 2)
});

const rectsOverlap = (first, second) => (
  first.left < second.right
  && first.right > second.left
  && first.top < second.bottom
  && first.bottom > second.top
);

const getOverlapOffset = (first, second) => {
  if (!rectsOverlap(first, second)) return null;
  return {
    x: Math.min(first.right - second.left, second.right - first.left),
    y: Math.min(first.bottom - second.top, second.bottom - first.top)
  };
};

// Topic끼리 겹칠 때 자식 Topic을 바깥으로 밀어 계층이 읽히게 합니다.
const resolveTopicNodeCollisions = (rootNodes, descendantNodes) => {
  const nodes = [...rootNodes, ...descendantNodes].sort((first, second) => (first.depth || 0) - (second.depth || 0));

  descendantNodes.forEach((node) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nodeRect = topicBlockerForNode(node);
      const blocker = nodes.find((candidate) => candidate !== node && rectsOverlap(nodeRect, topicBlockerForNode(candidate)));
      if (!blocker) break;

      const blockerRect = topicBlockerForNode(blocker);
      const overlap = getOverlapOffset(nodeRect, blockerRect);
      if (!overlap) break;

      const dx = node.x - blocker.x;
      const dy = node.y - blocker.y;
      const pushX = dx === 0 ? (node.side || 1) : Math.sign(dx);
      const pushY = dy === 0 ? ((node.depth || 1) % 2 === 0 ? 1 : -1) : Math.sign(dy);

      if (overlap.x < overlap.y) {
        node.x += pushX * (overlap.x + 44);
      } else {
        node.y += pushY * (overlap.y + 44);
      }
    }
  });
};

// 선택된 Topic 주변에 Neuron 카드를 배치할 때 Topic/카드와 겹치지 않는 위치를 찾습니다.
const findOpenNeuronPosition = ({ topicNode, angle, radius, blockers, width, height }) => {
  const angleOffsets = [0, 0.28, -0.28, 0.56, -0.56, 0.84, -0.84, 1.12, -1.12, 1.4, -1.4, 1.68, -1.68];
  const radiusOffsets = [0, 64, 128, 192, 256, 320];

  for (const radiusOffset of radiusOffsets) {
    for (const angleOffset of angleOffsets) {
      const nextAngle = angle + angleOffset;
      const nextRadius = radius + radiusOffset;
      const x = topicNode.x + (Math.cos(nextAngle) * nextRadius);
      const y = topicNode.y + (Math.sin(nextAngle) * nextRadius);
      const neuronRect = rectForPoint(x, y, width, height);
      const isBlocked = blockers.some((blocker) => rectsOverlap(neuronRect, blocker));

      if (!isBlocked) return { x, y };
    }
  }

  return {
    x: topicNode.x + (Math.cos(angle) * (radius + 220)),
    y: topicNode.y + (Math.sin(angle) * (radius + 220))
  };
};

// Synapse View의 실제 Topic/Neuron 지도입니다.
const TopicTreeGraphComponent = ({ rootTopics, activeTopic, topicNodesById = {}, quizStatusByTopicId = {}, showNeuronDetail, hideNeurons, onMoveToTopic, onOpenNodeDetail }) => {
  const { rootNodes, descendantNodes, links, selectedTopic } = useMemo(
    () => collectTopicMap(rootTopics, activeTopic?.id),
    [rootTopics, activeTopic?.id]
  );
  const allTopicNodes = useMemo(() => [...rootNodes, ...descendantNodes], [rootNodes, descendantNodes]);
  // 전체 Topic의 Neuron은 작은 점/제목으로, 선택 Topic의 Neuron은 확장 카드로 배치합니다.
  const positionedNeurons = useMemo(() => {
    if (hideNeurons) return [];

    const topicBlockers = allTopicNodes.map(topicBlockerForNode);
    const nextPositionedNeurons = [];
    const placedExpandedNeuronBlockers = [];

    allTopicNodes.forEach((topicNode) => {
      const topicNeurons = topicNodesById[String(topicNode.topic.id)] || [];
      const neuronCount = topicNeurons.length;
      const isSelectedTopic = selectedTopic && String(topicNode.topic.id) === String(selectedTopic.id);
      const isConnectedTopic = Boolean(selectedTopic && topicNode.isPath);
      const isExpanded = isSelectedTopic && showNeuronDetail;
      const perRing = isExpanded ? 7 : 12;
      const topicBlockersExceptSelf = topicBlockers.filter((blocker) => blocker.topicId !== String(topicNode.topic.id));
      const cardWidth = isExpanded ? 178 : 58;
      const cardHeight = isExpanded ? 100 : 58;

      topicNeurons.forEach((node, index) => {
        const ring = Math.floor(index / perRing);
        const ringIndex = index % perRing;
        const ringCount = Math.min(perRing, neuronCount - (ring * perRing));
        const angleJitter = ((index % 5) - 2) * 0.08;
        const radiusJitter = ((index % 4) - 1.5) * 14;
        const angle = ((Math.PI * 2) / Math.max(ringCount, 1)) * ringIndex - (Math.PI / 2) + (ring * 0.31) + angleJitter;
        const neuronRadius = (isExpanded ? 260 : 138) + (ring * (isExpanded ? 148 : 52)) + radiusJitter;
        const position = findOpenNeuronPosition({
          topicNode,
          angle,
          radius: neuronRadius,
          blockers: isExpanded ? [...topicBlockersExceptSelf, ...placedExpandedNeuronBlockers] : topicBlockersExceptSelf,
          width: cardWidth,
          height: cardHeight
        });
        if (isExpanded) placedExpandedNeuronBlockers.push(rectForPoint(position.x, position.y, cardWidth + 18, cardHeight + 18));

        nextPositionedNeurons.push({
          node,
          topicNode,
          isSelectedTopic,
          isConnectedTopic,
          isExpanded,
          x: position.x,
          y: position.y
        });
      });
    });

    return nextPositionedNeurons;
  }, [allTopicNodes, hideNeurons, selectedTopic, showNeuronDetail, topicNodesById]);

  if (!rootTopics.length) return null;

  return (
    <div className={`topic-map ${showNeuronDetail ? "is-detail-zoom" : ""} ${selectedTopic ? "has-selected-topic" : ""}`} aria-label="Topic synapse map">
      {links.map((link) => (
        <span className={`topic-map-link ${link.isPath ? "is-path" : ""} ${link.isDimmed ? "is-dimmed" : ""}`} key={`${link.from.topic.id}-${link.to.topic.id}`} style={lineStyle(link.from.x, link.from.y, link.to.x, link.to.y)} aria-hidden="true" />
      ))}

      {!hideNeurons && positionedNeurons.map((item) => (
        <span className={`neuron-map-link is-main ${item.isConnectedTopic ? "is-selected-topic" : "is-background"}`} key={`neuron-link-${item.topicNode.topic.id}-${item.node.id}`} style={lineStyle(item.topicNode.x, item.topicNode.y, item.x, item.y)} aria-hidden="true" />
      ))}

      {!hideNeurons && positionedNeurons.map((item) => (
        <button
          className={`neuron-map-node is-main ${item.isConnectedTopic ? "is-selected-topic" : "is-background"} ${item.isExpanded ? "is-expanded" : ""}`}
          key={`${item.topicNode.topic.id}-${item.node.id}`}
          type="button"
          style={{ "--node-x": `${item.x}px`, "--node-y": `${item.y}px` }}
          onClick={(event) => onOpenNodeDetail(event, item.node.id, item.topicNode.topic.id)}
        >
          <span className="neuron-map-icon"><Icon name="file" /></span>
          <strong>{item.node.title || "제목 없는 Neuron"}</strong>
        </button>
      ))}

      {rootNodes.map((node) => (
        <button className={`topic-map-node is-root ${node.isActive ? "is-active" : ""} ${node.isPath ? "is-path" : ""} ${node.isDimmed ? "is-dimmed" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px`, "--topic-scale": node.scaleHint }} onClick={(event) => onMoveToTopic(event, node.topic.id)}>
          <span className="topic-title">{node.topic.name}</span>
          {quizStatusByTopicId[String(node.topic.id)]?.hasQuiz && (
            <span className="topic-quiz-badge" title={`${quizStatusByTopicId[String(node.topic.id)]?.quizCount || 0}개 퀴즈 생성됨`}>Q</span>
          )}
        </button>
      ))}

      {descendantNodes.map((node) => (
        <button className={`topic-map-node ${node.depth > 1 ? "is-small" : ""} ${node.isPath ? "is-path" : ""} ${node.isSelected ? "is-selected" : ""} ${node.isDimmed ? "is-dimmed" : ""}`} key={node.topic.id} type="button" style={{ "--node-x": `${node.x}px`, "--node-y": `${node.y}px` }} onClick={(event) => onMoveToTopic(event, node.topic.id)}>
          <span className="topic-title">{node.topic.name}</span>
          {quizStatusByTopicId[String(node.topic.id)]?.hasQuiz && (
            <span className="topic-quiz-badge" title={`${quizStatusByTopicId[String(node.topic.id)]?.quizCount || 0}개 퀴즈 생성됨`}>Q</span>
          )}
        </button>
      ))}

      {selectedTopic && !descendantNodes.length && (
        <div className="topic-map-hint">하위 토픽이 없습니다</div>
      )}
    </div>
  );
};

// 그래프는 렌더 비용이 커서 핵심 데이터가 바뀔 때만 다시 그립니다.
const TopicTreeGraph = memo(TopicTreeGraphComponent, (prev, next) => (
  prev.rootTopics === next.rootTopics
  && String(prev.activeTopic?.id || "") === String(next.activeTopic?.id || "")
  && prev.topicNodesById === next.topicNodesById
  && prev.quizStatusByTopicId === next.quizStatusByTopicId
  && prev.showNeuronDetail === next.showNeuronDetail
  && prev.hideNeurons === next.hideNeurons
));

// 댓글/Neuron 작성일을 한국어 날짜 문자열로 표시합니다.
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

// flat 댓글 목록을 parentId 기준 트리로 바꿔 답글 들여쓰기를 만듭니다.
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
  isBrainPreview,
  canCreateNeuron = true,
  canManageWorkspace,
  manageMode,
  onRoute,
  onSearchBrains,
  onJoinBrain,
  onPreviewBrain,
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
  onSwitchView,
  onFitGraph,
  onZoom,
  onOpenModal,
  onOpenNodeModal,
  onOpenTopicPanel,
  nodeDetail,
  quizState,
  quizGenerationCount,
  quizGenerationLimit,
  commentDraft,
  canWriteComment,
  canDeleteNode,
  onCloseNodeDetail,
  onToggleNodeRecommend,
  onDeleteNode,
  onOpenQuiz,
  onGenerateQuiz,
  onSelectQuizOption,
  onSubmitQuiz,
  onResetQuiz,
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
  // Post List 검색/정렬, Synapse Neuron 표시 여부는 중앙 화면에서만 쓰는 UI 상태입니다.
  const [postQuery, setPostQuery] = useState("");
  const [postSort, setPostSort] = useState("latest");
  const [hideGraphNeurons, setHideGraphNeurons] = useState(false);
  const hasActiveTopic = Boolean(activeTopic);
  const visibleRootTopics = pageData.topics || [];
  // 상단 Breadcrumb에 보여줄 현재 Topic 경로입니다.
  const topicBreadcrumb = useMemo(
    () => findTopicPath(visibleRootTopics, activeTopic?.id),
    [visibleRootTopics, activeTopic?.id]
  );
  const postSourceNodes = useMemo(() => {
    if (!activeTopic) return [];
    return pageData.nodes.map((node) => ({
      ...node,
      topicId: String(activeTopic.id),
      topicName: activeTopic.name
    }));
  }, [activeTopic, pageData.nodes]);
  // Post List의 검색어와 최신순/인기순 정렬을 적용한 Neuron 목록입니다.
  const filteredNodes = useMemo(() => {
    const keyword = postQuery.trim().toLowerCase();
    const matchedNodes = keyword ? postSourceNodes.filter((node) => (
      node.title?.toLowerCase().includes(keyword)
      || node.content?.toLowerCase().includes(keyword)
      || node.writer?.toLowerCase().includes(keyword)
      || node.topicName?.toLowerCase().includes(keyword)
    )) : postSourceNodes;

    return [...matchedNodes].sort((firstNode, secondNode) => {
      if (postSort === "popular") {
        const recommendGap = Number(secondNode.recommends || 0) - Number(firstNode.recommends || 0);
        if (recommendGap !== 0) return recommendGap;
      }

      return new Date(secondNode.createdAt || 0).getTime() - new Date(firstNode.createdAt || 0).getTime();
    });
  }, [postQuery, postSort, postSourceNodes]);
  // Neuron 상세 댓글은 답글 구조로 보여주기 위해 트리로 변환합니다.
  const commentTree = useMemo(() => buildCommentTree(nodeDetail?.data?.comments || []), [nodeDetail?.data?.comments]);
  // 답글 작성/댓글 수정 중일 때 form 위에 대상 댓글을 표시합니다.
  const activeCommentTarget = useMemo(() => {
    if (!nodeDetail?.data || (!commentDraft.parentId && !commentDraft.editingId)) return null;
    const targetId = commentDraft.editingId || commentDraft.parentId;
    return nodeDetail.data.comments.find((comment) => String(comment.id) === String(targetId)) || null;
  }, [commentDraft.editingId, commentDraft.parentId, nodeDetail?.data]);
  const currentUserName = pageData.user?.name || "";
  const canModerateComments = canManageWorkspace;
  const canGenerateQuiz = canManageWorkspace && manageMode;
  const buildTopicRoute = (topicId, routeView = "synapse") => (
    activeBrain?.id && topicId ? `/brains/${activeBrain.id}${activeBrain.isPreview ? "/preview" : ""}/topics/${topicId}/${routeView}` : `/topics/${topicId}/${routeView}`
  );
  const quizLimitReached = Number(quizGenerationCount || 0) >= Number(quizGenerationLimit || 2);
  const quizScore = useMemo(() => {
    if (!quizState?.quizzes?.length) return { correct: 0, total: 0 };
    const correct = quizState.quizzes.reduce((score, quiz) => {
      const selectedIndex = quizState.answers?.[String(quiz.id)];
      return score + (quiz.options?.[selectedIndex]?.isCorrect ? 1 : 0);
    }, 0);
    return { correct, total: quizState.quizzes.length };
  }, [quizState?.answers, quizState?.quizzes]);

  // 댓글 카드와 답글 카드를 같은 컴포넌트 구조로 재귀 렌더링합니다.
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
            {canWriteComment && (
              <div className="comment-actions" aria-label={`${comment.writer} 댓글 작업`}>
                <button type="button" onClick={() => onStartCommentReply(comment)}>답글</button>
                {canEditComment && (
                  <>
                    <button type="button" onClick={() => onStartCommentEdit(comment)}>수정</button>
                    <button className="is-danger" type="button" onClick={() => onDeleteComment(comment)}>삭제</button>
                  </>
                )}
              </div>
            )}
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

  // Brain 찾기 화면의 검색 form 제출을 MainPage의 B05 검색 핸들러로 넘깁니다.
  const submitBrainSearch = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const excludeJoined = formData.get("excludeJoined") === "on";
    onSearchBrains(String(formData.get("brainKeyword") || "").trim(), 0, !excludeJoined);
  };
  const hasBrainTabs = isAuthenticated && openBrainTabs.length > 0;
  const isNeuronDetailView = view === "posts" && hasActiveTopic && Boolean(nodeDetail?.isOpen);
  const activeBrainJoinStatus = String(activeBrain?.joinStatus || "INACTIVE").toUpperCase();

  return (
    <section className={`workspace ${hasBrainTabs ? "has-brain-tabs" : ""} ${isNeuronDetailView ? "is-neuron-detail-view" : ""}`} aria-label="SSArain workspace">
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
          {activeBrain && topicBreadcrumb.length > 0 && <span aria-hidden="true">›</span>}
          {topicBreadcrumb.map((topic, index) => (
            <span className="breadcrumb-topic" key={topic.id}>
              <button
                className="crumb-chip"
                type="button"
                title={topic.name}
                onClick={(event) => onMoveToTopic(event, topic.id)}
              >
                {topic.name}
              </button>
              {index < topicBreadcrumb.length - 1 && <span aria-hidden="true">›</span>}
            </span>
          ))}
        </nav>
        <div className="header-actions">
          {canManageWorkspace && (
            <button className={`header-button manage-mode-button ${manageMode ? "is-active" : ""}`} type="button" onClick={onToggleManageMode} aria-pressed={manageMode}>
              <Icon name="settings" />
              <span>관리모드</span>
            </button>
          )}
          {isBrainPreview && activeBrain && activeBrainJoinStatus === "INACTIVE" && (
            <button className="header-button preview-join-button" type="button" onClick={() => onJoinBrain(activeBrain)}>
              가입
            </button>
          )}
          <div className="view-tabs" role="tablist" aria-label="보기 전환">
            <button className={`view-tab ${view === "synapse" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "synapse"} onClick={(event) => onSwitchView(event, "synapse")}><Icon name="synapse" /><span>Synapse View</span></button>
            <button className={`view-tab ${view === "posts" ? "is-active" : ""}`} type="button" role="tab" aria-selected={view === "posts"} onClick={(event) => onSwitchView(event, "posts")}><Icon name="list" /><span>Post List</span></button>
          </div>
          <button className="header-button" type="button" onClick={(event) => onRoute(event, isAuthenticated ? "/mypage" : "/login")}>{isAuthenticated ? "마이페이지" : "로그인"}</button>
          <button className={`header-button notice-trigger ${isRightPanelOpen ? "is-open" : ""}`} type="button" onClick={onToggleRight} aria-pressed={isRightPanelOpen}><Icon name="bell" /><span>알림창</span></button>
        </div>
      </header>

      {isBrainSearchView ? (
        <section className="brain-search-view" aria-labelledby="brain-search-heading">
          <form className="brain-search-form" onSubmit={submitBrainSearch}>
            <label htmlFor="brain-search-input" className="sr-only">Brain 명 검색</label>
            <div className="brain-search-field">
              <Icon name="search" />
              <input
                id="brain-search-input"
                name="brainKeyword"
                type="search"
                defaultValue={brainSearch.query}
                placeholder="찾고 싶은 Brain 이름을 입력하세요"
              />
              <label className="brain-search-filter">
                <input
                  name="excludeJoined"
                  type="checkbox"
                  defaultChecked={!brainSearch.includeJoined}
                />
                <span>소속 Brain 제외</span>
              </label>
              <button type="submit" disabled={brainSearch.isLoading}>{brainSearch.isLoading ? "검색 중" : "검색"}</button>
            </div>
          </form>

          <div className="brain-search-summary">
            <div>
              <p className="panel-kicker">FIND BRAIN</p>
              <h1 id="brain-search-heading">Brain 찾기</h1>
            </div>
            <div className="brain-search-summary-right">
              <div className="brain-policy-legend" aria-label="Brain 가입 정책 색상 안내">
                <span className="is-public"><i aria-hidden="true" />공개</span>
                <span className="is-private"><i aria-hidden="true" />초대 한정</span>
              </div>
              <span>{brainSearch.totalElements}개 결과</span>
            </div>
          </div>

          {brainSearch.message ? (
            <p className="brain-search-message" role="status">{brainSearch.message}</p>
          ) : (
            <div className="brain-result-grid">
              {brainSearch.results.map((brain) => {
                const joinPolicy = String(brain.joinPolicy || "PROTECTED").toUpperCase();
                const joinStatus = String(brain.joinStatus || "INACTIVE").toUpperCase();

                return (
                  <article
                    className={`brain-result-card ${joinPolicy === "PUBLIC" ? "is-public" : "is-private"}`}
                    key={brain.id}
                    role="button"
                    tabIndex={0}
                    onClick={(event) => onPreviewBrain(event, brain)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onPreviewBrain(event, brain);
                    }}
                    aria-label={`${brain.name} Brain 미리보기`}
                  >
                    <div className="brain-result-top">
                      <strong>{brain.name}</strong>
                      <div className="brain-result-badges">
                        <span>{brain.adminName || "관리자 미지정"}</span>
                      </div>
                    </div>
                    <p>{brain.description || "등록된 소개 문구가 없습니다."}</p>
                    <div className="brain-result-bottom">
                      <small>가입 인원 {brain.memberNames?.length || 0}명</small>
                      {joinStatus === "ACTIVE" ? (
                        <span className="brain-join-status is-active">이미 소속됨</span>
                      ) : joinStatus === "PENDING" ? (
                        <span className="brain-join-status is-pending">수락 대기중</span>
                      ) : (
                        <button type="button" onClick={(event) => { event.stopPropagation(); onJoinBrain(brain); }}>가입</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!brainSearch.message && !brainSearch.results.length && !brainSearch.isLoading && (
            <p className="brain-search-empty">검색 결과가 없습니다.</p>
          )}

          <div className="brain-pagination" aria-label="Brain 검색 페이지네이션">
            <button type="button" disabled={brainSearch.isLoading || brainSearch.currentPage <= 0} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage - 1, brainSearch.includeJoined)}>이전</button>
            <span>{brainSearch.totalPages ? `${brainSearch.currentPage + 1} / ${brainSearch.totalPages}` : "0 / 0"}</span>
            <button type="button" disabled={brainSearch.isLoading || !brainSearch.hasNext} onClick={() => onSearchBrains(brainSearch.query, brainSearch.currentPage + 1, brainSearch.includeJoined)}>다음</button>
          </div>
        </section>
      ) : (
        // 그래프 패널입니다. Pointer/Wheel 이벤트는 MainPage에서 받아 카메라 상태를 바꿉니다.
        <div ref={graphFieldRef} className={graphClassName} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          {view === "synapse" && activeBrain ? (
          <>
            {/* CSS 변수로 pan/zoom/tilt 값을 내려서 Prezi식 이동을 표현합니다. */}
            <div className="graph-viewport" style={{ "--pan-x": `${graph.x}px`, "--pan-y": `${graph.y}px`, "--zoom": graph.scale, "--tilt": `${graph.tilt || 0}deg` }}>
              <TopicTreeGraph rootTopics={visibleRootTopics} activeTopic={activeTopic} topicNodesById={pageData.topicNodesById || {}} quizStatusByTopicId={pageData.quizStatusByTopicId || {}} showNeuronDetail={Number(graph.scale || 1) >= 0.5} hideNeurons={hideGraphNeurons} onMoveToTopic={onMoveToTopic} onOpenNodeDetail={onOpenNodeDetail} />
            </div>
            <button
              className={`neuron-visibility-toggle ${hideGraphNeurons ? "is-hidden-mode" : ""}`}
              type="button"
              aria-pressed={hideGraphNeurons}
              onClick={() => setHideGraphNeurons((current) => !current)}
            >
              <Icon name={hideGraphNeurons ? "file" : "synapse"} />
              <span>{hideGraphNeurons ? "뉴런 표시" : "뉴런 숨기기"}</span>
            </button>
            {hasActiveTopic && canGenerateQuiz && (
              <div className="quiz-manage-panel" aria-live="polite">
                <button className="quiz-manage-create" type="button" onClick={onGenerateQuiz} disabled={quizState.isGenerating || quizLimitReached}>
                  <Icon name="file" />
                  <span>{quizState.isGenerating ? "퀴즈 생성 중" : quizLimitReached ? "퀴즈 생성 완료" : "퀴즈 생성"}</span>
                </button>
                <small className="quiz-generation-count">{quizGenerationCount || 0} / {quizGenerationLimit || 2}회 생성</small>
                {(quizState.isGenerating || quizState.status || quizLimitReached) && (
                  <p className={`quiz-generation-status ${quizState.status?.includes("실패") ? "is-error" : ""}`}>
                    {quizState.isGenerating ? "퀴즈를 생성하는 중입니다." : quizState.status || "이 Topic은 퀴즈를 최대 2번 생성했습니다."}
                  </p>
                )}
              </div>
            )}
            {hasActiveTopic && (
              <button className="quiz-floating-cta" type="button" onClick={onOpenQuiz}>
                <Icon name="file" />
                <span>퀴즈를 확인해보세요</span>
              </button>
            )}
            {/* 그래프 확대/축소와 위치 초기화 컨트롤입니다. */}
            <div className="zoom-controls" aria-label="그래프 확대 축소">
              <button type="button" onClick={() => onZoom(graph.scale / 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="축소">-</button>
              <button type="button" onClick={onFitGraph} aria-label="전체 Topic 보기">{Math.round(graph.scale * 100)}%</button>
              <button type="button" onClick={() => onZoom(graph.scale * 1.15, window.innerWidth / 2, window.innerHeight / 2)} aria-label="확대">+</button>
            </div>
          </>
          ) : view === "quiz" && hasActiveTopic ? (
          <section className="quiz-view" aria-label={`${activeTopic.name} 퀴즈`}>
            <div className="quiz-view-header">
              <div>
                <p className="panel-kicker">QUIZ</p>
                <h1>{activeTopic.name}</h1>
                <span>Topic 기반으로 생성된 문제를 풀어보세요.</span>
              </div>
              <div className="quiz-header-actions">
                <button className="quiz-back-button" type="button" onClick={(event) => { onRoute(event, activeTopic ? buildTopicRoute(activeTopic.id, "synapse") : "/main/synapse"); onSetView("synapse"); }}>
                  Synapse로 돌아가기
                </button>
              </div>
            </div>

            {quizState.isLoading ? (
              <div className="quiz-empty-state">
                <Icon name="file" />
                <strong>퀴즈를 불러오는 중입니다.</strong>
              </div>
            ) : quizState.quizzes.length ? (
              <>
                {quizState.status && <p className="quiz-status" role="status">{quizState.status}</p>}
                <div className="quiz-list">
                  {quizState.quizzes.map((quiz, quizIndex) => (
                    <article className="quiz-card" key={quiz.id}>
                      <div className="quiz-question">
                        <span>Quiz {quizIndex + 1}</span>
                        <h2>{quiz.question}</h2>
                      </div>
                      <div className="quiz-options">
                        {quiz.options.map((option, optionIndex) => {
                          const selectedIndex = quizState.answers?.[String(quiz.id)];
                          const isSelected = selectedIndex === optionIndex;
                          const showResult = quizState.submitted;
                          const optionClass = [
                            "quiz-option",
                            isSelected ? "is-selected" : "",
                            showResult && option.isCorrect ? "is-correct" : "",
                            showResult && isSelected && !option.isCorrect ? "is-wrong" : ""
                          ].filter(Boolean).join(" ");

                          return (
                            <button className={optionClass} type="button" key={option.id} onClick={() => onSelectQuizOption(quiz.id, optionIndex)} disabled={showResult}>
                              <span>{String.fromCharCode(65 + optionIndex)}</span>
                              <strong>{option.text}</strong>
                            </button>
                          );
                        })}
                      </div>
                      {quizState.submitted && quiz.explanation && (
                        <p className="quiz-explanation">{quiz.explanation}</p>
                      )}
                    </article>
                  ))}
                </div>
                <div className="quiz-submit-bar">
                  {quizState.submitted ? (
                    <strong>{quizScore.total}문제 중 {quizScore.correct}문제 정답</strong>
                  ) : (
                    <span>{Object.keys(quizState.answers || {}).length} / {quizState.quizzes.length}문제 선택</span>
                  )}
                  <div>
                    {quizState.submitted && <button type="button" onClick={onResetQuiz}>다시 풀기</button>}
                    <button className="quiz-submit-button" type="button" onClick={onSubmitQuiz} disabled={quizState.submitted}>정답 확인</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="quiz-empty-state">
                <Icon name="file" />
                <strong>{quizState.status || "퀴즈가 생성되어있지 않았습니다."}</strong>
                <span>관리자가 퀴즈를 생성하면 이곳에서 풀 수 있습니다.</span>
              </div>
            )}
          </section>
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
                  <div className="neuron-detail-actions">
                    <button
                      className={`recommend-button ${nodeDetail.liked ? "is-active" : ""}`}
                      type="button"
                      onClick={onToggleNodeRecommend}
                      disabled={isBrainPreview}
                      title={isBrainPreview ? "미리보기에서는 추천할 수 없습니다." : undefined}
                    >
                      <Icon name="plus" />
                      <span>추천 {nodeDetail.data.recommends || 0}</span>
                    </button>
                    {canDeleteNode && (
                      <button className="neuron-delete-button" type="button" onClick={onDeleteNode}>
                        Neuron 삭제
                      </button>
                    )}
                  </div>
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

                  {canWriteComment ? (
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
                  ) : (
                    <div className="comment-login-panel">
                      <strong>댓글 작성은 로그인 후 이용할 수 있습니다.</strong>
                      <button type="button" onClick={(event) => onRoute(event, "/login")}>로그인</button>
                    </div>
                  )}

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
          ) : view === "posts" ? (
          // Post List 보기에서는 현재 선택한 Topic의 문서 목록 형태로 노드를 보여줍니다.
          <div className="post-list">
            {activeTopic && (
              <div className="post-list-header">
                <div>
                  <p className="panel-kicker">POST LIST</p>
                  <h1>{activeTopic.name}</h1>
                </div>
                <div className="post-list-tools">
                  <div className="post-sort-toggle" role="group" aria-label="Neuron 정렬">
                    <button
                      className={postSort === "latest" ? "is-active" : ""}
                      type="button"
                      onClick={() => setPostSort("latest")}
                    >
                      최신순
                    </button>
                    <button
                      className={postSort === "popular" ? "is-active" : ""}
                      type="button"
                      onClick={() => setPostSort((current) => current === "popular" ? "latest" : "popular")}
                    >
                      인기순
                    </button>
                  </div>
                  <label className="post-search">
                    <Icon name="search" />
                    <input type="search" value={postQuery} onChange={(event) => setPostQuery(event.target.value)} placeholder="Neuron 검색" />
                  </label>
                  {canCreateNeuron && (
                    <button className="node-create-button" type="button" onClick={onOpenNodeModal}>
                      <Icon name="plus" />
                      <span>뉴런 추가</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="post-card-list">
              {filteredNodes.map((node) => (
                <button className="post-card" type="button" key={`${node.topicId}-${node.id}`} onClick={(event) => node.topicId && onOpenNodeDetail(event, node.id, node.topicId)}>
                  <span className="post-topic"><Icon name="folder" />{node.topicName || activeTopic?.name || "Topic"}</span>
                  <span className="post-card-body">
                    <strong>{node.title}</strong>
                    <small>{node.content || "내용이 없습니다."}</small>
                  </span>
                  <span className="post-card-meta">
                    <span className="post-author"><Icon name="user" />{node.writer || "작성자"}</span>
                    {node.createdAt && <span><Icon name="clock" />{formatDate(node.createdAt)}</span>}
                    <span><Icon name="plus" />추천 {node.recommends || 0}</span>
                    <span><Icon name="bell" />댓글 {node.comments || 0}</span>
                  </span>
                </button>
              ))}
              {!activeTopic && (
                <div className="post-empty-state is-topic-required">
                  <Icon name="file" />
                  <strong>현재 선택된 Topic이 없습니다.</strong>
                  <span>Synapse View에서 Topic을 선택하면 해당 Topic의 Neuron 목록을 확인할 수 있습니다.</span>
                </div>
              )}
              {activeTopic && !filteredNodes.length && (
                <div className="post-empty-state">
                  <Icon name="file" />
                  <strong>{postQuery ? "검색 결과가 없습니다." : "아직 작성된 Neuron이 없습니다."}</strong>
                  <span>{postQuery ? "다른 검색어로 다시 찾아보세요." : "뉴런 추가 버튼으로 첫 글을 작성해보세요."}</span>
                </div>
              )}
            </div>
          </div>
          ) : null}
          {view === "synapse" && manageMode && canManageWorkspace && (
            <div className="manage-action-dock" aria-label="Topic management actions">
              <button className="manage-action-button" type="button" onClick={onOpenTopicPanel}>
                <span>토픽 관리</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
