import { useMemo, useState } from "react";
import Icon from "../../../shared/icons/Icon.jsx";

const isTopicUsing = (value) => value === true || value === "true" || value === 1 || value === "1";

// 관리모드에서 공통 Topic을 세로 트리로 관리하는 패널입니다.
export default function TopicManagerPanel({
  topics,
  onClose,
  onCreateTopic,
  onToggleTopicUse
}) {
  const [expanded, setExpanded] = useState({});
  const [createTarget, setCreateTarget] = useState(null);
  const [topicName, setTopicName] = useState("");

  const totalCount = useMemo(() => {
    const countTopics = (items) => items.reduce((sum, topic) => sum + 1 + countTopics(topic.children || []), 0);
    return countTopics(topics);
  }, [topics]);

  const title = "토픽 관리";
  const copy = "초록색은 현재 Brain에 표시되는 토픽, 빨간색은 숨김 토픽입니다. + 버튼으로 하위 토픽을 추가할 수 있습니다.";

  const toggleExpand = (topicId) => {
    setExpanded((current) => ({ ...current, [topicId]: !current[topicId] }));
  };

  const openCreate = (topic) => {
    setCreateTarget(topic);
    setTopicName("");
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    const name = topicName.trim();
    if (!name || !createTarget) return;

    await onCreateTopic(createTarget.id, name);
    setCreateTarget(null);
    setTopicName("");
  };

  const renderTree = (items, depth = 0) => (
    <div className={`vertical-topic-level depth-${depth}`}>
      {items.map((topic) => {
        const children = topic.children || [];
        const isUsing = isTopicUsing(topic.isUsing);
        const isDeep = depth >= 3;
        const isExpanded = isDeep ? Boolean(expanded[topic.id]) : true;

        return (
          <article className={`vertical-topic-node ${isUsing ? "is-used" : "is-hidden"}`} key={topic.id}>
            <div className="vertical-topic-card">
              <button className="topic-state-button" type="button" onClick={() => onToggleTopicUse({ ...topic, isUsing })} aria-pressed={isUsing}>
                <span className="topic-state-dot" aria-hidden="true" />
                <span className="topic-state-copy">
                  <strong>{topic.name}</strong>
                  <small>{isUsing ? "Brain에 표시" : "Brain에서 숨김"}</small>
                </span>
              </button>

              <div className="vertical-topic-actions">
                <button className="topic-small-action" type="button" onClick={() => openCreate(topic)} aria-label={`${topic.name} 하위 토픽 생성`}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>

            {children.length > 0 && isDeep && (
              <button className="topic-more-toggle" type="button" onClick={() => toggleExpand(topic.id)}>
                {isExpanded ? "하위 토픽 접기" : `하위 토픽 ${children.length}개 더보기`}
              </button>
            )}

            {children.length > 0 && isExpanded && renderTree(children, depth + 1)}
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
          <button className="modal-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>

        <p className="topic-manager-copy">{copy}</p>

        <div className="topic-manager-scroll">
          {topics.length ? renderTree(topics) : <p className="topic-manager-empty">등록된 공통 토픽이 없습니다.</p>}
        </div>

        {createTarget && (
          <div className="topic-create-layer" role="presentation">
            <form className="topic-create-card" onSubmit={submitCreate}>
              <button className="modal-close" type="button" onClick={() => setCreateTarget(null)} aria-label="닫기">×</button>
              <p className="panel-kicker">CREATE CHILD TOPIC</p>
              <h3>{createTarget.name} 하위 토픽</h3>
              <label>
                <span>토픽 이름</span>
                <input autoFocus type="text" value={topicName} onChange={(event) => setTopicName(event.target.value)} placeholder="예: 그리디" />
              </label>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setCreateTarget(null)}>취소</button>
                <button className="primary-button" type="submit">생성</button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
