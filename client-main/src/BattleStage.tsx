import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Stage, Graphics, Sprite, Container } from "@pixi/react";
import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import * as PIXI from "pixi.js";
import testMap from "./assets/maps/forest-test.png";

type GameState = {
    map: { id: string; imageUrl: string; gridSize: number };
    tokens: Token[];
};

type Token = {
    id: string;
    name: string;
    x: number; // grid
    y: number; // grid
};

const SERVER = "http://localhost:5253";

export default function BattleStage() {
    const [state, setState] = useState<GameState | null>(null);

    const width = 900;
    const height = 600;

    

    const cellSize = state?.map.gridSize ?? 64;

    const connRef = useRef<HubConnection | null>(null);

    const appRef = useRef<PIXI.Application | null>(null);

    const worldRef = useRef<PIXI.Container | null>(null);

    const isSpaceDownRef = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);

    const zoomRef = useRef(1);

    const [isConnected, setIsConnected] = useState(false);
    const [, setDragTick] = useState(0); 

    // Drag state (vilken token dras + var)
    const dragRef = useRef<{
        tokenId: string;
        offsetX: number;
        offsetY: number;
        dragX: number;
        dragY: number;
    } | null>(null);



    // 1) Hämta initial state
    useEffect(() => {
        fetch(`${SERVER}/state`)
            .then((r) => r.json())
            .then((data: GameState) => setState(data))
            .catch(console.error);
    }, []);

    // 2) SignalR: connect + lyssna
    useEffect(() => {
        const conn = new HubConnectionBuilder()
            .withUrl(`${SERVER}/gamehub`)
            .configureLogging(LogLevel.Information)
            .withAutomaticReconnect()
            .build();

        connRef.current = conn;

        conn.on("TokenMoved", (token: Token) => {
            setState((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    tokens: prev.tokens.map((t) => (t.id === token.id ? token : t)),
                };
            });
        });

        conn
            .start()
            .then(() => {
                console.log("SignalR connected");
                setIsConnected(true);
            })
            .catch(console.error);

        conn.onreconnected(() => {
            console.log("SignalR reconnected");
            setIsConnected(true);
        });

        conn.onclose(() => {
            console.log("SignalR disconnected");
            setIsConnected(false);
        });

        return () => {
            connRef.current = null;
            conn.stop().catch(() => { });
        };
    }, []);



    // Grid overlay
    const Grid = useMemo(() => {
        return (
            <Graphics
                draw={(g: any) => {
                    g.clear();
                    g.lineStyle(1, 0xffffff, 0.15);

                    for (let x = 0; x <= width; x += cellSize) {
                        g.moveTo(x, 0);
                        g.lineTo(x, height);
                    }
                    for (let y = 0; y <= height; y += cellSize) {
                        g.moveTo(0, y);
                        g.lineTo(width, y);
                    }
                }}
            />
        );
    }, [cellSize, width, height]);

    // Hjälpare: snap pixel -> grid
    const snapToGrid = (px: number, py: number) => {
        const gx = Math.max(0, Math.min(Math.round(px / cellSize), Math.floor(width / cellSize) - 1));
        const gy = Math.max(0, Math.min(Math.round(py / cellSize), Math.floor(height / cellSize) - 1));
        return { gx, gy };
    };
    const finishDrag = useCallback(async () => {
        if (!dragRef.current) return;

        const { tokenId, dragX, dragY } = dragRef.current;
        dragRef.current = null;

        const { gx, gy } = snapToGrid(dragX, dragY);

        const conn = connRef.current;
        if (conn && isConnected) {
            try {
                await conn.invoke("MoveToken", tokenId, gx, gy);
            } catch (err) {
                console.error(err);
            }
        }
    }, [isConnected, cellSize, width, height]);

 // 3) Global pointer-up (stoppa drag även utanför canvas)
    useEffect(() => {
        const handlePointerUp = () => {
            if (dragRef.current) {
                void finishDrag();
            }
        };

        window.addEventListener("pointerup", handlePointerUp);

        return () => {
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [finishDrag]);

    useEffect(() => {
  const app = appRef.current;
  const world = worldRef.current;
  if (!app || !world) return;

  const onPointerDown = (e: any) => {
    if (!isSpaceDownRef.current) return;

    isPanningRef.current = true;

    const p =
      typeof e?.getLocalPosition === "function"
        ? e.getLocalPosition(app.stage)
        : (e?.global ?? e?.data?.global);

    if (!p) return;

    panStartRef.current = { x: p.x, y: p.y, wx: world.x, wy: world.y };
  };

  const onPointerMove = (e: any) => {
    // TOKEN DRAG
    if (dragRef.current) {
      const pos = getWorldPos(e);
      if (!pos) return;

      dragRef.current.dragX = pos.x - dragRef.current.offsetX;
      dragRef.current.dragY = pos.y - dragRef.current.offsetY;

      setDragTick((n) => n + 1);
      return;
    }

    // PAN
    if (isPanningRef.current && panStartRef.current) {
      const p =
        typeof e?.getLocalPosition === "function"
          ? e.getLocalPosition(app.stage)
          : (e?.global ?? e?.data?.global);

      if (!p) return;

      world.x = panStartRef.current.wx + (p.x - panStartRef.current.x);
      world.y = panStartRef.current.wy + (p.y - panStartRef.current.y);
    }
  };

  const onPointerUp = () => {
    if (dragRef.current) void finishDrag();
    isPanningRef.current = false;
    panStartRef.current = null;
  };

  const onWheel = (ev: WheelEvent) => {
    const canvas = app.view as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();

    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;

    const before = world.toLocal(new PIXI.Point(mouseX, mouseY));

    const zoomFactor = ev.deltaY < 0 ? 1.1 : 0.9;
    const next = Math.max(0.5, Math.min(3, zoomRef.current * zoomFactor));
    zoomRef.current = next;

    world.scale.set(next);

    const after = world.toLocal(new PIXI.Point(mouseX, mouseY));

    world.x += (after.x - before.x) * next;
    world.y += (after.y - before.y) * next;

    ev.preventDefault();
  };

  app.stage.on("pointerdown", onPointerDown);
  app.stage.on("pointermove", onPointerMove);
  app.stage.on("pointerup", onPointerUp);
  app.stage.on("pointerupoutside", onPointerUp);

  const canvas = app.view as HTMLCanvasElement;
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    app.stage.off("pointerdown", onPointerDown);
    app.stage.off("pointermove", onPointerMove);
    app.stage.off("pointerup", onPointerUp);
    app.stage.off("pointerupoutside", onPointerUp);
    canvas.removeEventListener("wheel", onWheel as any);
  };
}, [finishDrag]);

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.code === "Space") isSpaceDownRef.current = true;
        };
        const up = (e: KeyboardEvent) => {
            if (e.code === "Space") isSpaceDownRef.current = false;
        };

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);

        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, []);

    if (!state) return <div style={{ padding: 12 }}>Laddar state...</div>;
      

    const getWorldPos = (e: any) => {
        const world = worldRef.current;
        if (!world) return null;

        if (typeof e?.getLocalPosition === "function") {
            return e.getLocalPosition(world); // ✅ world-space
        }

        const g = e?.data?.global ?? e?.global;
        if (g) return world.toLocal(g);

        return null;
    };
    return (
        <Stage
            width={width}
            height={height}
            options={{ backgroundColor: 0x1b1b1b }}
            onMount={(app) => {
                appRef.current = app;

                app.stage.eventMode = "static";
                app.stage.hitArea = app.screen;

                const canvas = app.view as HTMLCanvasElement;
                canvas.style.touchAction = "none";
            }}
        >
            {/*  MAP IMAGE LAYER (BAKOM ALLT) */}
            <Sprite
                image={state.map.imageUrl && state.map.imageUrl.trim() !== "" ? state.map.imageUrl : testMap}
                x={0}
                y={0}
                width={width}
                height={height}
                eventMode="none"
            />

            {Grid}

            {state.tokens.map((t) => {
                const isDragging = dragRef.current?.tokenId === t.id;
                const renderX = isDragging ? dragRef.current!.dragX : t.x * cellSize;
                const renderY = isDragging ? dragRef.current!.dragY : t.y * cellSize;

                return (
                    <Graphics
                        key={t.id}
                        x={renderX}
                        y={renderY}
                        eventMode="static"
                        cursor="pointer"
                        hitArea={new PIXI.Rectangle(0, 0, cellSize, cellSize)}
                        onpointerdown={(e: any) => {
                            const pos = getStagePos(e);
                            if (!pos) return;

                            const tokenPxX = t.x * cellSize;
                            const tokenPxY = t.y * cellSize;

                            dragRef.current = {
                                tokenId: t.id,
                                offsetX: pos.x - tokenPxX,
                                offsetY: pos.y - tokenPxY,
                                dragX: tokenPxX,
                                dragY: tokenPxY,
                            };
                        }}
                        draw={(g: any) => {
                            g.clear();
                            g.beginFill(0x00ffcc);
                            g.drawRect(0, 0, cellSize, cellSize);
                            g.endFill();
                        }}
                    />
                );
            })}
        </Stage>
    );
}