import { useState } from "react";
import { apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import Icon from "../../shared/icons/Icon.jsx";
import { routeTo } from "../../shared/router/routes.js";

const STORAGE_KEY = "ssarain-created-workspace";

export default function BrainCreatePage() {
  // BrainCreateDto와 화면 전용 초대 멤버 상태입니다.
  const [form, setForm] = useState({
    name: "",
    description: "",
    joinPolicy: false,
    memberKeyword: ""
  });
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreate = Boolean(form.name.trim());

  const moveTo = (path) => {
    routeTo(path);
  };

  const updateField = (event) => {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  // 검색/초대 API가 추가되기 전까지 입력한 이름을 초대 예정 목록에 추가합니다.
  const addMember = () => {
    const keyword = form.memberKeyword.trim();
    if (!keyword) return;
    setMembers((current) => current.includes(keyword) ? current : [...current, keyword]);
    setForm((current) => ({ ...current, memberKeyword: "" }));
  };

  const removeMember = (member) => {
    setMembers((current) => current.filter((item) => item !== member));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!canCreate) {
      setStatus("Brain 이름을 입력해주세요.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      joinPolicy: form.joinPolicy
    };

    setIsSubmitting(true);
    setStatus("");

    try {
      const created = await apiPost(endpoints.brains.create, payload);
      const brainId = String(created?.id);
      const workspace = {
        activeBrainId: brainId,
        activeTopicId: null,
        brains: [{
          id: brainId,
          name: created?.name || payload.name,
          description: created?.description || payload.description,
          joinPolicy: payload.joinPolicy,
          owner: "나",
          members: 1,
          topicsCount: Array.isArray(created?.topics) ? created.topics.length : 0
        }],
        topics: [],
        nodes: [],
        notifications: [],
        activities: []
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      moveTo("/main");
    } catch (error) {
      setStatus(`Brain 생성 실패 · ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="brain-create-shell" aria-label="Create brain">
      {/* 메인 화면과 같은 브랜드/이동 버튼을 가진 상단 영역입니다. */}
      <header className="brain-create-topbar">
        <button className="brain-create-brand" type="button" onClick={() => moveTo("/main")} aria-label="메인으로 이동">
          <span className="brand-button"><Icon name="brain" /></span>
          <span>Synapse</span>
        </button>
        <div className="brain-create-actions">
          <button type="button" onClick={() => moveTo("/main")}>접기</button>
          <button type="button" onClick={() => moveTo("/mypage")}>마이페이지</button>
        </div>
      </header>

      <section className="brain-create-content">
        <form className="brain-create-form" onSubmit={submit}>
          <div className="brain-create-heading">
            <p className="panel-kicker">CREATE BRAIN</p>
            <h1>Brain 생성</h1>
          </div>

          <div className="brain-name-row">
            <label>
              <span>Brain 이름</span>
              <input name="name" type="text" value={form.name} onChange={updateField} placeholder="Brain 이름" maxLength={50} required />
            </label>
          </div>

          <label>
            <span>Brain 소개 문구</span>
            <textarea name="description" value={form.description} onChange={updateField} placeholder="Brain 소개 문구" maxLength={200} />
          </label>

          <div className="member-search-row">
            <label>
              <span>초대할 멤버 검색</span>
              <input name="memberKeyword" type="text" value={form.memberKeyword} onChange={updateField} placeholder="이름 또는 이메일" />
            </label>
            <button type="button" onClick={addMember}>검색</button>
          </div>

          <div className="selected-members">
            <strong>현재 추가된 인원</strong>
            {members.length ? (
              <ul>
                {members.map((member) => (
                  <li key={member}>
                    <span>{member}</span>
                    <button type="button" onClick={() => removeMember(member)} aria-label={`${member} 제거`}>×</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>아직 추가된 인원이 없습니다.</p>
            )}
          </div>

          <label className="join-policy-toggle">
            <input name="joinPolicy" type="checkbox" checked={form.joinPolicy} onChange={updateField} />
            <span>가입 정책 공개 / 초대한정</span>
          </label>

          <button className="brain-create-submit" type="submit" disabled={isSubmitting || !canCreate}>
            {isSubmitting ? "생성 중" : "생성"}
          </button>
        </form>

        {status && <p className="brain-create-status" role="status">{status}</p>}
      </section>
    </main>
  );
}
