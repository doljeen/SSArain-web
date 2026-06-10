import { useEffect, useState } from "react";
import { apiPost } from "../../api/client.js";
import { endpoints } from "../../api/endpoints.js";
import Icon from "../../shared/icons/Icon.jsx";

const getAuthErrorMessage = (message) => {
  if (message.includes("인증되지 않은 이메일")) {
    return "이메일 인증번호 검증을 완료한 뒤 다시 회원가입을 눌러주세요.";
  }

  if (message.includes("이미 사용 중인 이메일")) {
    return "이미 가입된 이메일입니다. 다른 이메일을 사용하거나 로그인해주세요.";
  }

  if (message.includes("이미 사용 중인 이름")) {
    return "이미 사용 중인 이름입니다. 이름을 바꾼 뒤 중복확인을 다시 해주세요.";
  }

  if (message.includes("인증 코드가 만료")) {
    return "인증번호가 만료되었습니다. 인증번호를 다시 전송해주세요.";
  }

  return message;
};

const AUTH_STATE_KEY = "ssarain-authenticated";

export default function AuthPage({ mode }) {
  // mode가 signup이면 이메일 인증/이름 중복 확인/비밀번호 확인 필드를 추가로 보여줍니다.
  const isSignup = mode === "signup";

  // 폼 입력값과 WAS 요청 상태를 한 곳에서 관리합니다.
  const [form, setForm] = useState({ email: "", code: "", name: "", password: "", passwordConfirm: "" });
  const [status, setStatus] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [nameChecked, setNameChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const moveTo = (path) => {
    window.location.hash = path;
  };

  // 로그인/회원가입 화면을 오갈 때 이전 화면의 안내 문구가 남지 않도록 정리합니다.
  useEffect(() => {
    setStatus("");
    setIsSubmitting(false);
  }, [mode]);

  // 입력값이 바뀌면 검증 완료 상태를 초기화해서 이전 검증 결과가 남지 않게 합니다.
  const updateField = (event) => {
    const { name, value } = event.target;

    if (name === "email") {
      setEmailVerified(false);
    }

    if (name === "name") {
      setNameChecked(false);
    }

    setForm((current) => ({ ...current, [name]: value }));
  };

  // WAS의 이메일 인증번호 전송 API를 호출합니다.
  const requestEmailCode = async () => {
    if (!form.email) {
      setStatus("이메일을 먼저 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      await apiPost(endpoints.auth.emailRequest, { email: form.email });
      setStatus("인증번호를 전송했습니다.");
    } catch (error) {
      setStatus(getAuthErrorMessage(error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 사용자가 입력한 인증번호를 WAS에 검증 요청합니다.
  const verifyEmailCode = async () => {
    if (!form.email || !form.code) {
      setStatus("이메일과 인증번호를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      await apiPost(endpoints.auth.emailVerify, { email: form.email, code: form.code });
      setEmailVerified(true);
      setStatus("이메일 인증이 완료되었습니다.");
    } catch (error) {
      setEmailVerified(false);
      setStatus(getAuthErrorMessage(error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 회원가입 전 이름 중복 여부를 WAS DTO(NameCheckReq)에 맞춰 확인합니다.
  const checkName = async () => {
    if (!form.name) {
      setStatus("이름을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      const result = await apiPost(endpoints.users.nameCheck, { name: form.name });
      if (result?.isDuplicate) {
        setNameChecked(false);
        setStatus("이미 사용 중인 이름입니다.");
        return;
      }

      setNameChecked(true);
      setStatus("사용 가능한 이름입니다.");
    } catch (error) {
      setNameChecked(false);
      setStatus(getAuthErrorMessage(error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 로그인/회원가입 submit을 처리합니다. 회원가입은 이메일 인증, 이름 확인, 비밀번호 일치를 먼저 요구합니다.
  const submit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    if (isSignup && !emailVerified) {
      setStatus("이메일 인증을 완료해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (isSignup && !nameChecked) {
      setStatus("이름 중복 확인을 완료해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (isSignup && form.password !== form.passwordConfirm) {
      setStatus("비밀번호가 일치하지 않습니다.");
      setIsSubmitting(false);
      return;
    }

    try {
      const endpoint = isSignup ? endpoints.auth.signup : endpoints.auth.login;
      const body = isSignup
        ? { email: form.email, name: form.name, password: form.password }
        : { email: form.email, password: form.password };

      await apiPost(endpoint, body);

      if (isSignup) {
        sessionStorage.removeItem(AUTH_STATE_KEY);
        try {
          await apiPost(endpoints.auth.logout, {});
        } catch (error) {
          // 회원가입 응답에서 쿠키가 내려오지 않은 경우도 있으므로 로그아웃 실패는 무시합니다.
        }
        setStatus("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
        window.setTimeout(() => moveTo("/login"), 350);
        return;
      }

      sessionStorage.setItem(AUTH_STATE_KEY, "true");
      setStatus("로그인되었습니다.");
      window.setTimeout(() => moveTo("/main"), 350);
    } catch (error) {
      setStatus(getAuthErrorMessage(error.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      {/* 상단 브랜드와 로그인/회원가입 화면 전환 버튼입니다. */}
      <header className="auth-header">
        <button className="auth-brand" type="button" onClick={() => moveTo("/main")} aria-label="메인으로 이동">
          <span className="brand-button"><Icon name="brain" /></span>
          <span>Synapse</span>
        </button>
        <div className="auth-header-actions">
          <button className={!isSignup ? "is-active" : ""} type="button" onClick={() => moveTo("/login")}>로그인</button>
          <button className={isSignup ? "is-active" : ""} type="button" onClick={() => moveTo("/signup")}>회원가입</button>
        </div>
      </header>

      {/* 인증 페이지의 실제 입력 폼입니다. mode에 따라 필드 구성이 달라집니다. */}
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-kicker">{isSignup ? "Create Account" : "Welcome Back"}</p>
        <h1 id="auth-title">{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="auth-copy">
          {isSignup ? "새 계정을 만들고 Brain과 Topic을 관리하세요." : "계정으로 접속해서 작업 중인 Brain을 이어가세요."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {/* 이메일은 로그인/회원가입 모두 사용하고, 회원가입에서는 인증번호 전송 버튼이 붙습니다. */}
          <div className={`auth-field-row ${isSignup ? "" : "is-single"}`}>
            <label>
              <span>이메일</span>
              <input name="email" type="email" placeholder="admin@synapse.io" value={form.email} onChange={updateField} required />
            </label>
            {isSignup && <button className="auth-side-button" type="button" onClick={requestEmailCode} disabled={isSubmitting}>인증번호 전송</button>}
          </div>

          {/* 회원가입 전용 인증번호 검증 영역입니다. */}
          {isSignup && (
            <div className="auth-field-row">
              <label>
                <span>인증번호</span>
                <input name="code" type="text" inputMode="numeric" placeholder="123456" value={form.code} onChange={updateField} required />
              </label>
              <button className={`auth-side-button ${emailVerified ? "is-done" : ""}`} type="button" onClick={verifyEmailCode} disabled={isSubmitting || emailVerified}>
                {emailVerified ? "검증완료" : "검증"}
              </button>
            </div>
          )}

          {/* 회원가입 전용 이름 입력 및 중복 확인 영역입니다. */}
          {isSignup && (
            <div className="auth-field-row">
              <label>
                <span>이름</span>
                <input name="name" type="text" placeholder="Admin User" value={form.name} onChange={updateField} required />
              </label>
              <button className={`auth-side-button ${nameChecked ? "is-done" : ""}`} type="button" onClick={checkName} disabled={isSubmitting || nameChecked}>
                {nameChecked ? "확인완료" : "중복확인"}
              </button>
            </div>
          )}

          <label>
            <span>비밀번호</span>
            <input name="password" type="password" placeholder="비밀번호" value={form.password} onChange={updateField} required />
          </label>

          {/* 회원가입일 때만 비밀번호 확인 필드를 추가로 보여줍니다. */}
          {isSignup && (
            <label>
              <span>비밀번호 한번더</span>
              <input name="passwordConfirm" type="password" placeholder="비밀번호 확인" value={form.passwordConfirm} onChange={updateField} required />
            </label>
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "처리 중" : isSignup ? "회원가입" : "로그인"}
          </button>
        </form>

        {/* WAS 요청 결과나 유효성 검사 메시지를 사용자에게 보여줍니다. */}
        {status && <p className="auth-status" role="status">{status}</p>}

        {/* 로그인 화면과 회원가입 화면을 서로 오갈 수 있는 하단 버튼입니다. */}
        <div className="auth-switch">
          <span>{isSignup ? "이미 계정이 있나요?" : "아직 계정이 없나요?"}</span>
          <button type="button" onClick={() => moveTo(isSignup ? "/login" : "/signup")}>
            {isSignup ? "로그인으로 이동" : "회원가입으로 이동"}
          </button>
        </div>
      </section>
    </main>
  );
}
