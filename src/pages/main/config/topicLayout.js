// Synapse View와 카메라 포커싱이 같은 Topic 좌표계를 쓰도록 모아둔 레이아웃 유틸입니다.

const rootScatterPositions = [
  { x: -1040, y: -420 },
  { x: 1080, y: 420 },
  { x: 0, y: 0 },
  { x: -560, y: 650 },
  { x: 620, y: -650 },
  { x: -1360, y: 210 },
  { x: 1400, y: -210 },
  { x: -1460, y: -700 },
  { x: 1500, y: 720 }
];

const stableHash = (value) => {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const stableNoise = (value) => (stableHash(value) % 10000) / 10000;

const rectForTopicNode = (node) => {
  const isRoot = node.depth == null;
  const isSmall = node.depth > 1;
  const width = isRoot ? 240 : isSmall ? 190 : 210;
  const height = isRoot ? 240 : isSmall ? 110 : 128;

  return {
    left: node.x - (width / 2),
    right: node.x + (width / 2),
    top: node.y - (height / 2),
    bottom: node.y + (height / 2)
  };
};

const rectsOverlap = (first, second) => (
  first.left < second.right
  && first.right > second.left
  && first.top < second.bottom
  && first.bottom > second.top
);

const pushTopicNodesApart = (nodes) => {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const first = nodes[firstIndex];
        const second = nodes[secondIndex];
        const firstRect = rectForTopicNode(first);
        const secondRect = rectForTopicNode(second);
        if (!rectsOverlap(firstRect, secondRect)) continue;

        const dx = second.x - first.x || (stableNoise(`${second.topic.id}-x`) - 0.5);
        const dy = second.y - first.y || (stableNoise(`${second.topic.id}-y`) - 0.5);
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const sameBranch = first.rootDirection === second.rootDirection;
        const force = (sameBranch ? 28 : 16) + (pass * 2);
        const pushX = (dx / distance) * force;
        const pushY = (dy / distance) * force;

        if (first.depth != null) {
          first.x -= pushX * 0.5;
          first.y -= pushY * 0.5;
        }
        if (second.depth != null) {
          second.x += pushX * 0.5;
          second.y += pushY * 0.5;
        }
      }
    }
  }
};

export const findTopicPath = (topics, topicId, path = []) => {
  for (const topic of topics) {
    const nextPath = [...path, topic];
    if (String(topic.id) === String(topicId)) return nextPath;
    const childPath = findTopicPath(topic.children || [], topicId, nextPath);
    if (childPath.length) return childPath;
  }
  return [];
};

const getTopicTreeStats = (topic) => {
  const children = topic.children || [];
  if (!children.length) return { count: 1, leaves: 1, depth: 1 };

  const childStats = children.map(getTopicTreeStats);
  return {
    count: 1 + childStats.reduce((sum, stats) => sum + stats.count, 0),
    leaves: childStats.reduce((sum, stats) => sum + stats.leaves, 0),
    depth: 1 + Math.max(...childStats.map((stats) => stats.depth))
  };
};

const collectSubtreeIds = (topic, ids = new Set()) => {
  if (!topic) return ids;
  ids.add(String(topic.id));
  (topic.children || []).forEach((child) => collectSubtreeIds(child, ids));
  return ids;
};

const normalizeAngle = (angle) => {
  let nextAngle = angle;
  while (nextAngle > Math.PI) nextAngle -= Math.PI * 2;
  while (nextAngle < -Math.PI) nextAngle += Math.PI * 2;
  return nextAngle;
};

export const collectTopicMap = (rootTopics, activeTopicId) => {
  const activePath = findTopicPath(rootTopics, activeTopicId);
  const activeRoot = activePath[0] || null;
  const selectedTopic = activePath[activePath.length - 1] || null;
  const activePathIds = new Set(activePath.map((topic) => String(topic.id)));
  const connectedTopicIds = selectedTopic
    ? new Set([...activePathIds, ...collectSubtreeIds(selectedTopic)])
    : new Set();
  const rootStats = rootTopics.map(getTopicTreeStats);
  const rootCount = rootTopics.length;
  const maxRootWeight = Math.max(...rootStats.map((stats) => stats.count), 1);

  const rootNodes = rootTopics.map((rootTopic, index) => {
    const stats = rootStats[index] || { count: 1, leaves: 1, depth: 1 };
    const angleNoise = (stableNoise(`${rootTopic.id}-root-angle`) - 0.5) * 0.28;
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / Math.max(rootCount, 1)) + angleNoise;
    const radiusNoise = (stableNoise(`${rootTopic.id}-root-radius`) - 0.5) * 180;
    const base = rootCount === 1
      ? { x: 0, y: 0 }
      : {
          x: Math.cos(angle) * (780 + radiusNoise + Math.min(560, stats.count * 15) + (stats.depth * 42)),
          y: Math.sin(angle) * (500 + (radiusNoise * 0.55) + Math.min(390, stats.leaves * 36) + (stats.depth * 30))
        };
    const fallback = rootScatterPositions[index % rootScatterPositions.length];
    const x = Number.isFinite(base.x) ? base.x : fallback.x;
    const y = Number.isFinite(base.y) ? base.y : fallback.y;
    const rootDirection = rootCount === 1
      ? 1
      : (Math.abs(x) < 140 ? (index % 2 === 0 ? 1 : -1) : Math.sign(x));

    return {
      topic: rootTopic,
      x,
      y,
      stats,
      rootDirection,
      branchAngle: rootCount === 1 ? -Math.PI / 2 : Math.atan2(y, x),
      branchSpread: rootCount === 1 ? Math.PI * 1.18 : Math.PI * 0.84,
      isActive: activeRoot && String(activeRoot.id) === String(rootTopic.id),
      isPath: connectedTopicIds.has(String(rootTopic.id)),
      isDimmed: Boolean(selectedTopic && !connectedTopicIds.has(String(rootTopic.id))),
      scaleHint: 1 + (Math.min(stats.count, maxRootWeight) / Math.max(maxRootWeight, 1)) * 0.12
    };
  });

  const descendantNodes = [];
  const links = [];

  const layoutChildren = (parentTopic, parentNode, depth = 1, branchSide = null, branchAngle = parentNode.branchAngle, branchSpread = parentNode.branchSpread) => {
    const children = parentTopic.children || [];
    const childStats = children.map(getTopicTreeStats);
    const childWeights = childStats.map((stats) => Math.max(1.4, Math.min(stats.leaves * 1.15, 10)));
    const totalWeight = childWeights.reduce((sum, weight) => sum + weight, 0);
    let weightCursor = 0;
    const minSpreadByChildren = children.length > 1 ? Math.min(Math.PI * 0.96, (children.length - 1) * (depth === 1 ? 0.17 : 0.13)) : 0.22;
    const spread = Math.max(
      minSpreadByChildren,
      Math.min(branchSpread, depth === 1 ? Math.PI * 1.05 : Math.PI * 0.58)
    );

    children.forEach((child, index) => {
      const stats = childStats[index] || { count: 1, leaves: 1, depth: 1 };
      const weight = childWeights[index] || 1;
      const side = branchSide || parentNode.rootDirection || (index % 2 === 0 ? 1 : -1);
      const weightedPosition = totalWeight > 0
        ? ((weightCursor + (weight / 2)) / totalWeight) - 0.5
        : 0;
      const angleJitter = (stableNoise(`${parentTopic.id}-${child.id}-angle`) - 0.5) * (depth === 1 ? 0.2 : 0.14);
      const radiusJitter = (stableNoise(`${parentTopic.id}-${child.id}-radius`) - 0.5) * (depth === 1 ? 90 : 70);
      const rawAngle = branchAngle + (weightedPosition * spread) + angleJitter;
      const angle = normalizeAngle(rawAngle);
      const siblingRadiusOffset = ((index % 3) - 1) * (depth === 1 ? 46 : 34);
      const radius = (depth === 1 ? 620 : 470)
        + (depth * 46)
        + Math.min(360, stats.count * 15)
        + (stats.depth * 30)
        + siblingRadiusOffset
        + radiusJitter;
      const nextSpread = Math.max(0.34, spread * (0.5 + Math.min(weight, 6) * 0.04));
      weightCursor += weight;

      const node = {
        topic: child,
        x: parentNode.x + (Math.cos(angle) * radius),
        y: parentNode.y + (Math.sin(angle) * radius),
        depth,
        side,
        rootDirection: parentNode.rootDirection || side,
        branchAngle: angle,
        branchSpread: nextSpread,
        stats,
        isSelected: selectedTopic && String(child.id) === String(selectedTopic.id),
        isPath: connectedTopicIds.has(String(child.id)),
        isDimmed: Boolean(selectedTopic && !connectedTopicIds.has(String(child.id)))
      };

      descendantNodes.push(node);
      links.push({
        from: parentNode,
        to: node,
        isPath: connectedTopicIds.has(String(parentTopic.id)) && connectedTopicIds.has(String(child.id)),
        isDimmed: Boolean(selectedTopic && !(connectedTopicIds.has(String(parentTopic.id)) && connectedTopicIds.has(String(child.id))))
      });
      layoutChildren(child, node, depth + 1, side, angle, nextSpread);
    });
  };

  rootNodes.forEach((rootNode) => {
    layoutChildren(rootNode.topic, rootNode, 1, null, rootNode.branchAngle, rootNode.branchSpread);
  });

  pushTopicNodesApart([...rootNodes, ...descendantNodes]);

  return { rootNodes, descendantNodes, links, selectedTopic };
};

export const collectTopicLayoutPoints = (rootTopics) => {
  const { rootNodes, descendantNodes } = collectTopicMap(rootTopics, null);
  return [...rootNodes, ...descendantNodes];
};
