/**
 * SnakeGame - Self-playing Nokia 3310-style snake game for waiting screens.
 * The snake AI uses a simple pathfinding approach to chase food while avoiding walls.
 */

import { useEffect, useRef, useCallback } from 'react';

const CELL_SIZE = 20;
const SNAKE_COLOR = '#696969'; // dim gray
const FOOD_COLOR = '#2d2d2d'; // darker block
const BACKGROUND_COLOR = 'transparent';

type Direction = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };

interface SnakeState {
  snake: Point[];
  food: Point;
  direction: Direction;
  nextDirection: Direction;
}

export function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SnakeState | null>(null);
  const animationRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const getGridSize = useCallback(() => {
    if (!containerRef.current) return { cols: 20, rows: 15 };
    const rect = containerRef.current.getBoundingClientRect();
    const cols = Math.floor(rect.width / CELL_SIZE);
    const rows = Math.floor(rect.height / CELL_SIZE);
    return { cols: Math.max(10, cols), rows: Math.max(8, rows) };
  }, []);

  const initGame = useCallback(() => {
    const { cols, rows } = getGridSize();
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    
    const snake: Point[] = [
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY },
      { x: centerX - 2, y: centerY },
    ];

    const food = spawnFood(snake, cols, rows);

    stateRef.current = {
      snake,
      food,
      direction: 'right',
      nextDirection: 'right',
    };
  }, [getGridSize]);

  const spawnFood = (snake: Point[], cols: number, rows: number): Point => {
    let food: Point;
    do {
      food = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * rows),
      };
    } while (snake.some(s => s.x === food.x && s.y === food.y));
    return food;
  };

  const getOppositeDirection = (dir: Direction): Direction => {
    const opposites: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    };
    return opposites[dir];
  };

  const movePoint = (point: Point, direction: Direction): Point => {
    const moves: Record<Direction, Point> = {
      up: { x: point.x, y: point.y - 1 },
      down: { x: point.x, y: point.y + 1 },
      left: { x: point.x - 1, y: point.y },
      right: { x: point.x + 1, y: point.y },
    };
    return moves[direction];
  };

  const isCollision = (point: Point, snake: Point[], cols: number, rows: number): boolean => {
    // Wall collision
    if (point.x < 0 || point.x >= cols || point.y < 0 || point.y >= rows) {
      return true;
    }
    // Self collision (exclude tail since it will move)
    return snake.slice(0, -1).some(s => s.x === point.x && s.y === point.y);
  };

  const calculateAIDirection = useCallback((state: SnakeState, cols: number, rows: number): Direction => {
    const head = state.snake[0];
    const { food, direction } = state;
    const opposite = getOppositeDirection(direction);

    // All possible directions
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    
    // Filter out opposite direction (can't go backwards) and collisions
    const validDirections = directions.filter(dir => {
      if (dir === opposite) return false;
      const nextPos = movePoint(head, dir);
      return !isCollision(nextPos, state.snake, cols, rows);
    });

    if (validDirections.length === 0) {
      // No valid moves, game will reset
      return direction;
    }

    // Score each direction based on distance to food
    const scored = validDirections.map(dir => {
      const nextPos = movePoint(head, dir);
      const distance = Math.abs(nextPos.x - food.x) + Math.abs(nextPos.y - food.y);
      
      // Add penalty for directions that lead to being boxed in
      let freedom = 0;
      for (const testDir of directions) {
        const testPos = movePoint(nextPos, testDir);
        if (!isCollision(testPos, state.snake, cols, rows)) {
          freedom++;
        }
      }
      
      return { dir, score: -distance + freedom * 0.5 };
    });

    // Sort by score (higher is better) and add some randomness
    scored.sort((a, b) => b.score - a.score);
    
    // 80% chance to pick best direction, 20% chance for second best (if available)
    if (scored.length > 1 && Math.random() > 0.8) {
      return scored[1].dir;
    }
    
    return scored[0].dir;
  }, []);

  const tick = useCallback(() => {
    if (!stateRef.current) return;

    const { cols, rows } = getGridSize();
    const state = stateRef.current;

    // AI decides next direction
    state.nextDirection = calculateAIDirection(state, cols, rows);
    state.direction = state.nextDirection;

    // Move snake
    const head = state.snake[0];
    const newHead = movePoint(head, state.direction);

    // Check collision
    if (isCollision(newHead, state.snake, cols, rows)) {
      // Reset game on collision
      initGame();
      return;
    }

    // Add new head
    state.snake.unshift(newHead);

    // Check food collision
    if (newHead.x === state.food.x && newHead.y === state.food.y) {
      // Ate food - spawn new food (don't remove tail, snake grows)
      state.food = spawnFood(state.snake, cols, rows);
    } else {
      // Remove tail
      state.snake.pop();
    }
  }, [getGridSize, calculateAIDirection, initGame]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !stateRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const { cols, rows } = getGridSize();

    // Set canvas size
    canvas.width = cols * CELL_SIZE;
    canvas.height = rows * CELL_SIZE;

    // Center the canvas
    canvas.style.position = 'absolute';
    canvas.style.left = `${(rect.width - canvas.width) / 2}px`;
    canvas.style.top = `${(rect.height - canvas.height) / 2}px`;

    // Clear
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const state = stateRef.current;

    // Draw food
    ctx.fillStyle = FOOD_COLOR;
    ctx.fillRect(
      state.food.x * CELL_SIZE,
      state.food.y * CELL_SIZE,
      CELL_SIZE,
      CELL_SIZE
    );

    // Draw snake (sharp edges - no rounding)
    ctx.fillStyle = SNAKE_COLOR;
    for (const segment of state.snake) {
      ctx.fillRect(
        segment.x * CELL_SIZE,
        segment.y * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE
      );
    }
  }, [getGridSize]);

  const gameLoop = useCallback((timestamp: number) => {
    // Tick every 150ms for a classic feel
    if (timestamp - lastTickRef.current > 150) {
      tick();
      lastTickRef.current = timestamp;
    }
    
    draw();
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [tick, draw]);

  useEffect(() => {
    initGame();
    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initGame, gameLoop]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      initGame();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initGame]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden opacity-20"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export default SnakeGame;


