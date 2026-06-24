import { useEffect, useMemo, useState } from "react";
import Icon from "../../../shared/icons/Icon.jsx";

// 관리모드의 "토픽 관리" 모달입니다.
// 공통 Topic 트리를 검색하고, 현재 Brain에 표시/숨김 상태를 바꾸고, 새 하위 Topic을 생성합니다.

const isTopicUsing = (value) => value === true || value === "true" || value === 1 || value === "1";
const normalizeTopicName = (value) => String(value || "").trim().toLowerCase();

// 생성 모달에서 선택한 부모 Topic을 찾기 위해 트리를 깊이 우선 탐색합니다.
const findTopicById = (topics, topicId) => {
  for (const topic of topics) {
    if (String(topic.id) === String(topicId)) return topic;
    const found = findTopicById(topic.children || [], topicId);
    if (found) return found;
  }
  return null;
};

// Topic 생성 위치 선택 모달의 로컬 검색용 필터입니다.
// 검색된 Topic만 단독으로 보여주지 않고, 부모-자식 맥락을 유지합니다.
const filterTopicTreeByName = (topics, keyword) => {
  const normalizedKeyword = normalizeTopicName(keyword);
  if (!normalizedKeyword) return topics;

  return topics.reduce((filtered, topic) => {
    const children = filterTopicTreeByName(topic.children || [], keyword);
    const isMatch = normalizeTopicName(topic.name).includes(normalizedKeyword);
    if (isMatch || children.length) filtered.push({ ...topic, children });
    return filtered;
  }, []);
};

// 관리모드에서 공통 Topic을 세로 트리로 관리하는 패널입니다.
export default function TopicManagerPanel({
  topics,
  isLoading = false,
  search,
  onClose,
  onCreateTopic,
  onToggleTopicUse,
  onSearchTopics,
  onClearSearch
}) {
  const [expanded, setExpanded] = useState({});
  const [createExpanded, setCreateExpanded] = useState({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState(null);
  const [topicName, setTopicName] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState(search?.query || "");
  const [createSearchKeyword, setCreateSearchKeyword] = useState("");
  const isSearchMode = Boolean(search?.isSearching);
  const isCreateSearchMode = Boolean(createSearchKeyword.trim());
  const topicsToRender = isSearchMode ? search?.topics || [] : topics;
  const createTopicsToRender = useMemo(() => filterTopicTreeByName(topics, createSearchKeyword), [topics, createSearchKeyword]);
  const matchedTopicIds = useMemo(() => new Set((search?.matchedTopicIds || []).map(String)), [search?.matchedTopicIds]);
  const createTargetTopic = createTarget?.id == null ? null : findTopicById(topics, createTarget.id);
  const siblingTopics = createTarget?.id == null ? topics : createTargetTopic?.children || [];
  const isDuplicateName = Boolean(
    topicName.trim()
    && siblingTopics.some((topic) => normalizeTopicName(topic.name) === normalizeTopicName(topicName))
  );

  const totalCount = useMemo(() => {
    const countTopics = (items) => items.reduce((sum, topic) => sum + 1 + countTopics(topic.children || []), 0);
    return countTopics(topicsToRender);
  }, [topicsToRender]);

  const title = "토픽 관리";
  const copy = "토픽을 눌러 하위 토픽을 펼치고, 오른쪽 버튼으로 현재 Brain 표시 여부를 바꿀 수 있습니다.";

  // 외부 검색 상태가 바뀌면 검색 input도 같은 값으로 동기화합니다.
  useEffect(() => {
    setSearchKeyword(search?.query || "");
  }, [search?.query]);

  // Topic 관리 트리의 펼침 상태입니다. 검색 모드에서는 위치 확인을 위해 모두 펼쳐집니다.
  const toggleExpand = (topicId) => {
    setExpanded((current) => ({ ...current, [topicId]: !current[topicId] }));
  };

  const toggleCreateExpand = (topicId) => {
    setCreateExpanded((current) => ({ ...current, [topicId]: !current[topicId] }));
  };

  // 새 Topic 생성은 별도 레이어에서 진행합니다. 부모 위치를 먼저 고르게 만드는 흐름입니다.
  const openCreateModal = () => {
    setIsCreateOpen(true);
    setCreateTarget(null);
    setTopicName("");
    setCreateStatus("");
    setCreateSearchKeyword("");
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateTarget(null);
    setTopicName("");
    setCreateStatus("");
    setCreateSearchKeyword("");
    setIsCreating(false);
  };

  const selectCreateTarget = (topic) => {
    setCreateTarget(topic);
    setTopicName("");
    setCreateStatus("");
  };

  // T07 검색 API를 호출하도록 MainPage에 검색어를 전달합니다.
  const submitSearch = (event) => {
    event.preventDefault();
    onSearchTopics?.(searchKeyword);
  };

  const clearSearch = () => {
    setSearchKeyword("");
    onClearSearch?.();
  };

  // T04 생성 API 호출 전, 같은 부모 아래 중복 이름은 프론트에서 먼저 차단합니다.
  const submitCreate = async (event) => {
    event.preventDefault();
    const name = topicName.trim();
    if (!name || !createTarget || isCreating) return;
    if (isDuplicateName) {
      setCreateStatus("같은 위치에 이미 같은 이름의 토픽이 있습니다.");
      return;
    }

    setIsCreating(true);
    setCreateStatus("");
    try {
      await onCreateTopic(createTarget.id, name);
      closeCreateModal();
    } catch (error) {
      setCreateStatus(error.message || "토픽을 생성하지 못했습니다.");
      setIsCreating(false);
    }
  };

  // Topic 관리 본문 트리입니다. 오른쪽 버튼은 현재 Brain 표시/숨김 토글입니다.
  const renderTree = (items, depth = 0) => (
    <div className={`vertical-topic-level depth-${depth}`}>
      {items.map((topic) => {
        const children = topic.children || [];
        const hasChildren = children.length > 0;
        const isUsing = isTopicUsing(topic.isUsing);
        const isExpanded = isSearchMode || Boolean(expanded[topic.id]);
        const isMatch = matchedTopicIds.has(String(topic.id));

        return (
          <article className={`vertical-topic-node ${isUsing ? "is-used" : "is-hidden"} ${isExpanded ? "is-expanded" : ""} ${isMatch ? "is-search-match" : ""}`} key={topic.id}>
            <div className="vertical-topic-card">
              <button
                className="topic-tree-open-button"
                type="button"
                onClick={() => hasChildren && toggleExpand(topic.id)}
                disabled={!hasChildren}
                aria-expanded={hasChildren ? isExpanded : undefined}
                aria-label={hasChildren ? `${topic.name} 하위 토픽 ${isExpanded ? "접기" : "펼치기"}` : `${topic.name} 하위 토픽 없음`}
              >
                <span className={`topic-caret ${isExpanded ? "is-expanded" : ""}`} aria-hidden="true">›</span>
              </button>
              <button
                className="topic-state-button"
                type="button"
                onClick={() => hasChildren ? toggleExpand(topic.id) : undefined}
                aria-expanded={hasChildren ? isExpanded : undefined}
              >
                <span className="topic-state-dot" aria-hidden="true" />
                <span className="topic-state-copy">
                  <strong>{topic.name}</strong>
                  <small>{isUsing ? "Brain에 표시" : "Brain에서 숨김"}</small>
                </span>
              </button>

              <div className="vertical-topic-actions">
                <button className={`topic-use-action ${isUsing ? "is-visible" : ""}`} type="button" onClick={() => onToggleTopicUse({ ...topic, isUsing })} aria-pressed={isUsing}>
                  <span aria-hidden="true">{isUsing ? "-" : "+"}</span>
                  <strong>{isUsing ? "Brain에 숨김" : "Brain에 표시"}</strong>
                </button>
              </div>
            </div>

            {hasChildren && isExpanded && renderTree(children, depth + 1)}
          </article>
        );
      })}
    </div>
  );

  // Topic 생성 모달의 부모 선택 트리입니다. 선택된 행 아래에 새 하위 Topic이 생성됩니다.
  const renderCreateTargetTree = (items, depth = 0) => (
    <div className={`topic-create-target-level depth-${depth}`}>
      {items.map((topic) => {
        const children = topic.children || [];
        const hasChildren = children.length > 0;
        const isExpanded = isCreateSearchMode || Boolean(createExpanded[topic.id]);
        const isSelected = createTarget?.id != null && String(createTarget.id) === String(topic.id);

        return (
          <article className="topic-create-target-node" key={topic.id}>
            <div className={`topic-create-target-row ${isSelected ? "is-selected" : ""}`}>
              <button
                className="topic-create-caret"
                type="button"
                onClick={() => hasChildren && toggleCreateExpand(topic.id)}
                disabled={!hasChildren}
                aria-label={hasChildren ? `${topic.name} 하위 토픽 ${isExpanded ? "접기" : "펼치기"}` : `${topic.name} 하위 토픽 없음`}
              >
                <span className={`topic-caret ${isExpanded ? "is-expanded" : ""}`} aria-hidden="true">›</span>
              </button>
              <button
                className="topic-create-target"
                type="button"
                onClick={() => selectCreateTarget(topic)}
              >
                <Icon name="folder" />
                <span>{topic.name}</span>
                <strong>
                  <Icon name="plus" />
                  여기에 하위토픽 추가
                </strong>
              </button>
            </div>
            {hasChildren && isExpanded && renderCreateTargetTree(children, depth + 1)}
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="topic-manager-backdrop" role="presentation" onClick={onClose}>
      <section className="topic-manager-panel" role="dialog" aria-modal="true" aria-labelledby="topic-manager-title" onClick={(event) => event.stopPropagation()}>
        <header className="topic-manager-head">
          <div>
            <p className="panel-kicker">COMMON TOPIC TREE</p>
            <h2 id="topic-manager-title">{title}</h2>
            <span>{totalCount}개 토픽</span>
          </div>
          <div className="topic-manager-head-actions">
            <button className="topic-add-button" type="button" onClick={openCreateModal}>
              <Icon name="plus" />
              토픽 추가
            </button>
            <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
          </div>
        </header>

        <p className="topic-manager-copy">{copy}</p>

        {/* T07 검색 영역: 검색 결과는 조상 Topic까지 펼쳐서 위치를 보여줍니다. */}
        <form className="topic-search-form" onSubmit={submitSearch}>
          <label className="topic-search-label" htmlFor="topic-manager-search">토픽 검색</label>
          <div className="topic-search-row">
            <input
              id="topic-manager-search"
              type="search"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="찾을 토픽 이름을 입력하세요"
            />
            <button className="topic-search-button" type="submit" disabled={search?.isLoading}>검색</button>
            {isSearchMode && <button className="topic-search-clear" type="button" onClick={clearSearch}>전체 보기</button>}
          </div>
          {(isSearchMode || search?.isLoading) && (
            <p className={`topic-search-status ${search?.isLoading ? "is-loading" : ""}`} role="status">
              {search?.isLoading ? "토픽 위치를 찾는 중입니다." : search?.message || "검색 결과는 위치 확인을 위해 모두 펼쳐집니다."}
            </p>
          )}
        </form>

        {/* 공통 Topic 트리 본문입니다. 표시/숨김은 B09/B10 상태와 맞춰 MainPage에서 처리합니다. */}
        <div className="topic-manager-scroll">
          {topicsToRender.length
            ? renderTree(topicsToRender)
            : <p className="topic-manager-empty">{isLoading || search?.isLoading ? "토픽을 불러오는 중입니다." : isSearchMode ? "검색 결과가 없습니다." : "등록된 공통 토픽이 없습니다."}</p>}
        </div>

        {/* Topic 추가 레이어입니다. 부모 위치 선택과 이름 입력을 분리해 실수를 줄입니다. */}
        {isCreateOpen && (
          <div className="topic-create-layer" role="presentation">
            <form className="topic-create-card" onSubmit={submitCreate}>
              <button className="modal-close" type="button" onClick={closeCreateModal} aria-label="닫기">×</button>
              <p className="panel-kicker">CREATE TOPIC</p>
              <h3>토픽 추가</h3>
              <p className="topic-create-guide">왼쪽에서 새 토픽을 넣을 위치를 먼저 선택한 뒤, 오른쪽에서 이름을 입력해주세요.</p>
              <div className="topic-create-grid">
                <div className="topic-create-picker">
                  <div className="topic-create-picker-head">
                    <strong>1. 추가할 위치 선택</strong>
                    <span>선택한 토픽의 바로 아래에 하위토픽이 생성됩니다.</span>
                  </div>
                  <label className="topic-create-search" htmlFor="topic-create-search">
                    <Icon name="search" />
                    <input
                      id="topic-create-search"
                      type="search"
                      value={createSearchKeyword}
                      onChange={(event) => setCreateSearchKeyword(event.target.value)}
                      placeholder="부모 토픽 검색"
                    />
                  </label>
                  <button
                    className={`topic-create-root-target ${createTarget?.id == null ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => selectCreateTarget({ id: null, name: "최상위 토픽" })}
                  >
                    <Icon name="folder" />
                    <span>최상위 토픽</span>
                    <strong>
                      <Icon name="plus" />
                      최상위에 추가
                    </strong>
                  </button>
                  <div className="topic-create-tree">
                    {createTopicsToRender.length
                      ? renderCreateTargetTree(createTopicsToRender)
                      : <p className="topic-manager-empty">{createSearchKeyword.trim() ? "검색된 토픽이 없습니다." : "선택할 토픽이 없습니다."}</p>}
                  </div>
                </div>
                <div className="topic-create-form">
                  <div className="topic-create-selected">
                    <span>선택된 위치</span>
                    <strong>{createTarget?.name ? `${createTarget.name} 아래에 새 토픽 생성` : "아직 선택되지 않았습니다."}</strong>
                  </div>
                  <label>
                    <span>2. 새 토픽 이름</span>
                    <input
                      autoFocus
                      type="text"
                      value={topicName}
                      onChange={(event) => {
                        setTopicName(event.target.value);
                        setCreateStatus("");
                      }}
                      placeholder="예: 그리디"
                      disabled={!createTarget || isCreating}
                    />
                  </label>
                  {isDuplicateName && <p className="topic-create-status is-error">같은 부모 아래에 이미 같은 이름의 토픽이 있습니다.</p>}
                  {createStatus && <p className="topic-create-status is-error">{createStatus}</p>}
                  <div className="modal-actions">
                    <button className="secondary-button" type="button" onClick={closeCreateModal}>취소</button>
                    <button className="primary-button" type="submit" disabled={!createTarget || !topicName.trim() || isDuplicateName || isCreating}>
                      {isCreating ? "생성 중" : "생성"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
