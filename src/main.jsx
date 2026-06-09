import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./shared/styles/base.css";
import "./pages/main/main.css";
import "./pages/auth/auth.css";
import "./pages/mypage/mypage.css";
import "./pages/brain-create/brainCreate.css";

// React 앱을 index.html의 #app 영역에 연결하는 진입점입니다.
// 공통 CSS와 페이지별 CSS도 여기에서 한 번만 불러옵니다.
createRoot(document.querySelector("#app")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
