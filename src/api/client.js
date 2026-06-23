import { API_BASE_URL } from "./endpoints.js";

// 상대 API path를 실제 WAS 주소로 변환합니다.
const buildUrl = (path) => `${API_BASE_URL}${path}`;
const REFRESH_PATH = "/auth/refresh";
let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export const isAuthError = (error) => (
  error?.status === 401
  || ["C003", "US006", "US007", "US008", "US009", "US011"].includes(error?.code)
);

// WAS BaseResponse 형태({ status, message, data })에서 실제 data만 꺼냅니다.
export const unwrapResponse = (payload) => {
  if (payload && typeof payload === "object" && "data" in payload && "status" in payload) {
    return payload.data;
  }

  return payload;
};

const readPayload = async (response) => {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return { message: text || `API response parse failed: ${response.status}` };
  }
};

const createApiError = (response, payload) => new ApiError(
  payload?.message || `API request failed: ${response.status}`,
  {
    status: response.status,
    code: payload?.code || "",
    payload
  }
);

const shouldRefreshAccessToken = (response, payload) => (
  response.status === 401
  && (!payload?.code || ["C003", "US006", "US007"].includes(payload.code))
);

const refreshAccessToken = async () => {
  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl(REFRESH_PATH), {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json"
      }
    }).then(async (response) => {
      const payload = await readPayload(response);
      if (!response.ok) throw createApiError(response, payload);
      return unwrapResponse(payload);
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

// 모든 API 요청의 공통 fetch 함수입니다. JWT 쿠키 기반 인증을 위해 credentials를 포함합니다.
export const apiRequest = async (path, options = {}, hasRetried = false) => {
  const response = await fetch(buildUrl(path), {
    credentials: "include",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const payload = await readPayload(response);

  // HTTP 에러가 오면 WAS message를 우선 보여주고, 없으면 상태 코드를 보여줍니다.
  if (!response.ok) {
    if (shouldRefreshAccessToken(response, payload) && !hasRetried && path !== REFRESH_PATH) {
      await refreshAccessToken();
      return apiRequest(path, options, true);
    }

    throw createApiError(response, payload);
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

// PATCH 요청 헬퍼입니다. 관리자 권한 변경처럼 일부 값만 수정할 때 사용합니다.
export const apiPatch = (path, body) => apiRequest(path, {
  method: "PATCH",
  body: JSON.stringify(body)
});

// DELETE 요청 헬퍼입니다. WAS가 삭제 대상 목록 DTO를 요구하는 경우 body도 함께 보낼 수 있습니다.
export const apiDelete = (path, body = undefined) => apiRequest(path, {
  method: "DELETE",
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
