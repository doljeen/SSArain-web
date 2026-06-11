import { useEffect, useState } from "react";
import AuthPage from "./pages/auth/AuthPage.jsx";
import BrainCreatePage from "./pages/brain-create/BrainCreatePage.jsx";
import MainPage from "./pages/main/MainPage.jsx";
import MyPage from "./pages/mypage/MyPage.jsx";
import { getCurrentRoute, ROUTE_EVENTS, syncDocumentRoute } from "./shared/router/routes.js";

export default function App() {
  // 현재 브라우저 경로(/login, /signup, /main)를 읽어서 보여줄 페이지를 결정합니다.
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    syncDocumentRoute(route);

    // history 이동, 뒤로가기/앞으로가기 모두 React 화면과 동기화합니다.
    const handleRouteChange = () => {
      const nextRoute = getCurrentRoute();
      syncDocumentRoute(nextRoute);
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener(ROUTE_EVENTS.changed, handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener(ROUTE_EVENTS.changed, handleRouteChange);
    };
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
