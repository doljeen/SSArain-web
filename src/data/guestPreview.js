import { createBrainWorkspace } from "./createdBrainTemplate.js";

// 로그인하지 않은 사용자가 메인에서 볼 수 있는 읽기 전용 Synapse 미리보기 데이터입니다.
export const guestPreview = createBrainWorkspace({
  id: "guest-product-engineering",
  name: "Product Engineering",
  description: "Guest preview workspace",
  joinPolicy: false,
  members: []
});
