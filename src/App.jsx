import { useEffect, useState } from "react";
import AuthPage from "./pages/auth/AuthPage.jsx";
import BrainCreatePage from "./pages/brain-create/BrainCreatePage.jsx";
import MainPage from "./pages/main/MainPage.jsx";
import MyPage from "./pages/mypage/MyPage.jsx";
import { getCurrentRoute } from "./shared/router/routes.js";

export default function App() {
  // hash route(#/login, #/signup, #/main)를 읽어서 보여줄 페이지를 결정합니다.
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    // 주소 hash가 바뀌면 React 화면도 같이 바뀌도록 동기화합니다.
    const handleHashChange = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // 로그인/회원가입은 같은 AuthPage 컴포넌트에 mode만 다르게 넘깁니다.
  if (route === "/login") {
    return <AuthPage mode="login" />;
  }

  if (route === "/signup") {
    return <AuthPage mode="signup" />;
  }

  if (route === "/mypage") {
    return <MyPage />;
  }

  if (route === "/brains/new") {
    return <BrainCreatePage />;
  }

  // 등록되지 않은 route는 현재 작업 중인 메인 화면으로 보냅니다.
  return <MainPage />;
}
