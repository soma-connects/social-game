// Board System Design v1.1 — Graph Engine & Tile Specifications
// Document 4 of 10 — Development Bible Implementation

export type BoardTileType =
  | 'minigame'
  | 'ai_challenge'
  | 'treasure'
  | 'trap'
  | 'mystery'
  | 'shop'
  | 'split_route'
  | 'teleport'
  | 'volcano'
  | 'finish';

export interface BoardGraphNode {
  id: string;
  type: BoardTileType;
  position: number; // Main linear index order
  nextIds: string[]; // Graph edges to next tiles (supports split routes / branches)
  isBranch?: boolean;
  isBridge?: boolean;
  isBridgeCollapsed?: boolean;
  isHiddenShortcut?: boolean;
  discoveredPlayerIds?: string[]; // Player IDs who unlocked this shortcut
  label?: string;
  xRatio: number; // 0..100 percentage for visual layout
  yRatio: number; // 0..100 percentage for visual layout
}

/**
 * Tile Distribution (Spec §4):
 * Mini Game (30%), AI Challenge (20%), Treasure (12%), Trap (10%),
 * Mystery (10%), Shop (8%), Split Route (6%), Teleport (2%), Volcano (2%)
 */
export const TILE_TYPE_ICONS: Record<BoardTileType, string> = {
  minigame: '🎙️',
  ai_challenge: '🤖',
  treasure: '💎',
  trap: '🪤',
  mystery: '❓',
  shop: '🛒',
  split_route: '🔀',
  teleport: '🌀',
  volcano: '🌋',
  finish: '🏆',
};

export const TILE_TYPE_NAMES: Record<BoardTileType, string> = {
  minigame: 'Mini Game',
  ai_challenge: 'AI Challenge',
  treasure: 'Treasure Chest',
  trap: 'Trap Tile',
  mystery: 'Mystery Event',
  shop: 'Powerup Shop',
  split_route: 'Split Route Branch',
  teleport: 'Teleport Portal',
  volcano: 'Volcano Eruption',
  finish: 'Finish Line',
};

/**
 * Builds the 24-Tile Graph with 2 Branch/Split Routes (Spec §2 & §3)
 */
export function createBoardGraph(mainPathLength: number = 24): BoardGraphNode[] {
  const nodes: BoardGraphNode[] = [];

  // Main 24 Winding Coordinates (0..23)
  const mainCoords: { x: number; y: number }[] = [
    { x: 8, y: 10 },   // 0 (Start)
    { x: 22, y: 10 },  // 1
    { x: 38, y: 12 },  // 2
    { x: 54, y: 10 },  // 3 (Split Route 1)
    { x: 70, y: 12 },  // 4
    { x: 86, y: 14 },  // 5
    { x: 92, y: 30 },  // 6
    { x: 76, y: 34 },  // 7
    { x: 58, y: 32 },  // 8
    { x: 40, y: 34 },  // 9
    { x: 22, y: 32 },  // 10
    { x: 8, y: 44 },   // 11
    { x: 14, y: 60 },  // 12 (Split Route 2)
    { x: 32, y: 62 },  // 13
    { x: 50, y: 58 },  // 14
    { x: 68, y: 62 },  // 15
    { x: 86, y: 68 },  // 16
    { x: 90, y: 84 },  // 17
    { x: 74, y: 88 },  // 18
    { x: 56, y: 84 },  // 19
    { x: 38, y: 88 },  // 20
    { x: 24, y: 82 },  // 21
    { x: 14, y: 88 },  // 22
    { x: 6, y: 90 },   // 23 (Finish)
  ];

  // Specific Tile Types based on Spec §4 Distribution & Placement Rule
  const tileTypes: BoardTileType[] = [
    'minigame',     // 0 Start
    'ai_challenge', // 1
    'treasure',     // 2
    'split_route',  // 3 (Branch 1 Starts)
    'minigame',     // 4
    'trap',         // 5
    'shop',         // 6
    'ai_challenge', // 7
    'mystery',      // 8
    'minigame',     // 9
    'treasure',     // 10
    'ai_challenge', // 11
    'split_route',  // 12 (Branch 2 Starts)
    'minigame',     // 13
    'shop',         // 14
    'mystery',      // 15
    'trap',         // 16
    'teleport',     // 17
    'volcano',      // 18 (Late board volcano)
    'ai_challenge', // 19
    'minigame',     // 20
    'treasure',     // 21
    'minigame',     // 22
    'finish',       // 23 Finish
  ];

  // Construct Main Path
  for (let i = 0; i < mainPathLength; i++) {
    const id = `node_${i}`;
    const nextIds = i < mainPathLength - 1 ? [`node_${i + 1}`] : [];
    const coord = mainCoords[i] || { x: 50, y: 50 };

    nodes.push({
      id,
      position: i,
      type: tileTypes[i] || 'minigame',
      nextIds,
      xRatio: coord.x,
      yRatio: coord.y,
    });
  }

  // Add Branch 1 (Bridge Shortcut off Node 3 -> reconnects at Node 6)
  nodes[3].nextIds.push('branch_1_bridge');
  nodes.push({
    id: 'branch_1_bridge',
    position: 3,
    type: 'treasure',
    nextIds: ['node_6'],
    isBranch: true,
    isBridge: true, // 25% chance to collapse behind crossing player
    isBridgeCollapsed: false,
    label: 'Rope Bridge Shortcut',
    xRatio: 72,
    yRatio: 22,
  });

  // Add Branch 2 (Hidden Shortcut off Node 12 -> reconnects at Node 15)
  nodes[12].nextIds.push('branch_2_shortcut');
  nodes.push({
    id: 'branch_2_shortcut',
    position: 12,
    type: 'shop',
    nextIds: ['node_15'],
    isBranch: true,
    isHiddenShortcut: true,
    discoveredPlayerIds: [],
    label: 'Secret Tunnel',
    xRatio: 40,
    yRatio: 74,
  });

  return nodes;
}

export const INITIAL_BOARD_GRAPH = createBoardGraph(24);
