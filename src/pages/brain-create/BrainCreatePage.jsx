import { useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import Icon from "../../shared/icons/Icon.jsx";
import { routeTo } from "../../shared/router/routes.js";

const STORAGE_KEY = "ssarain-created-workspace";

const normalizeBrainUser = (user) => ({
  // WAS의 BrainUserInfoDto는 UUID라는 대문자 JSON 키를 내려줍니다.
  id: String(user?.UUID || user?.uuid || user?.uid || user?.id || ""),
  name: user?.name || "",
  email: user?.email || ""
});

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

  // 입력한 이름/이메일을 생성 이후 Brain 초대 후보 검색 API에 사용할 목록으로 보관합니다.
  const addMember = () => {
    const keyword = form.memberKeyword.trim();
    if (!keyword) return;
    setMembers((current) => current.includes(keyword) ? current : [...current, keyword]);
    setForm((current) => ({ ...current, memberKeyword: "" }));
  };

  const removeMember = (member) => {
    setMembers((current) => current.filter((item) => item !== member));
  };

  const findInviteTarget = async (brainId, keyword) => {
    // B12 API로 현재 Brain에 아직 소속되지 않은 사용자를 검색합니다.
    const result = await apiGet(endpoints.brains.availableUsers(brainId, keyword, 0, 5));
    const candidates = (result?.users || []).map(normalizeBrainUser).filter((user) => user.id);
    return (
      candidates.find((user) => user.email === keyword || user.name === keyword)
      || candidates[0]
      || null
    );
  };

  const inviteMembers = async (brainId) => {
    const keywords = [...new Set(members.map((member) => member.trim()).filter(Boolean))];
    if (!keywords.length) {
      return { addedCount: 0, failedKeywords: [] };
    }

    const foundUserIds = [];
    const failedKeywords = [];

    // 각 입력값을 실제 사용자 UUID로 변환합니다. 이름 검색은 중복 가능성이 있어 첫 번째 결과를 사용합니다.
    for (const keyword of keywords) {
      try {
        const target = await findInviteTarget(brainId, keyword);
        if (target) {
          foundUserIds.push(target.id);
        } else {
          failedKeywords.push(keyword);
        }
      } catch {
        failedKeywords.push(keyword);
      }
    }

    const users = [...new Set(foundUserIds)];
    if (!users.length) {
      return { addedCount: 0, failedKeywords };
    }

    // B02 API는 UUID 배열을 users 키로 받습니다.
    await apiPost(endpoints.brains.addUsers(brainId), { users });
    return { addedCount: users.length, failedKeywords };
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
      // 체크 ON: 가입 승인 필요(PROTECTED), 체크 OFF: 누구나 가입 가능(PUBLIC)
      joinPolicy: form.joinPolicy ? "PROTECTED" : "PUBLIC"
    };

    setIsSubmitting(true);
    setStatus("");

    try {
      await apiGet(endpoints.users.me);
      const created = await apiPost(endpoints.brains.create, payload);
      const brainId = String(created?.id);
      let inviteResult = { addedCount: 0, failedKeywords: [] };

      try {
        inviteResult = await inviteMembers(brainId);
      } catch {
        inviteResult = { addedCount: 0, failedKeywords: members };
      }

      const workspace = {
        activeBrainId: brainId,
        activeTopicId: null,
        brains: [{
          id: brainId,
          name: created?.name || payload.name,
          description: created?.description || payload.description,
          joinPolicy: payload.joinPolicy,
          owner: "나",
          members: 1 + inviteResult.addedCount,
          topicsCount: Array.isArray(created?.topics) ? created.topics.length : 0
        }],
        topics: [],
        nodes: [],
        notifications: [],
        activities: []
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));

      if (inviteResult.failedKeywords.length) {
        setStatus(`Brain 생성 완료 · 추가 실패: ${inviteResult.failedKeywords.join(", ")}`);
        window.setTimeout(() => moveTo("/main"), 900);
        return;
      }

      moveTo("/main");
    } catch (error) {
      const message = error.message.includes("인증") || error.message.includes("쿠키")
        ? "Brain 생성은 로그인된 실제 계정으로 가능합니다. 관리자 페이지 확인용 임시 로그인은 WAS 인증 토큰이 없습니다."
        : error.message;
      setStatus(`Brain 생성 실패 · ${message}`);
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
          <span>SSArain</span>
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
            <button type="button" onClick={addMember}>추가</button>
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
            <span>가입 승인 필요</span>
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
