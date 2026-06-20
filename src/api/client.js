import { API_BASE_URL } from "./endpoints.js";

// 상대 API path를 실제 WAS 주소로 변환합니다.
const buildUrl = (path) => `${API_BASE_URL}${path}`;
const REFRESH_PATH = "/auth/refresh";

// WAS BaseResponse 형태({ status, message, data })에서 실제 data만 꺼냅니다.
export const unwrapResponse = (payload) => {
  if (payload && typeof payload === "object" && "data" in payload && "status" in payload) {
    return payload.data;
  }

  return payload;
};

// 모든 API 요청의 공통 fetch 함수입니다. JWT 쿠키 기반 인증을 위해 credentials를 포함합니다.
export const apiRequest = async (path, options = {}, hasRetried = false) => {
  const response = await fetch(buildUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const text = await response.text();
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { message: text || `API response parse failed: ${response.status}` };
  }

  // HTTP 에러가 오면 WAS message를 우선 보여주고, 없으면 상태 코드를 보여줍니다.
  if (!response.ok) {
    if (response.status === 401 && !hasRetried && path !== REFRESH_PATH) {
      await apiRequest(REFRESH_PATH, {}, true);
      return apiRequest(path, options, true);
    }

    const message = payload?.message || `API request failed: ${response.status}`;
    throw new Error(message);
  }

  return unwrapResponse(payload);
};

// GET 요청 헬퍼입니다.
export const apiGet = (path) => apiRequest(path);

// POST 요청 헬퍼입니다. WAS DTO에 맞는 body 객체를 JSON으로 전송합니다.
export const apiPost = (path, body) => apiRequest(path, {
  method: "POST",
  body: JSON.stringify(body)
});
