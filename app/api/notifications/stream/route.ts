import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { listNotificationsAfter } from "@/lib/server/services/notifications";
import { subscribeToNotificationWakeups } from "@/lib/server/services/notification-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCursor(request: Request) {
  const url = new URL(request.url);
  const cursor = request.headers.get("Last-Event-ID") ?? url.searchParams.get("cursor") ?? "0";
  if (!/^\d{1,20}$/.test(cursor)) return BigInt(0);
  return BigInt(cursor);
}

function frame(event: string, id: string | null, data: unknown) {
  const prefix = id ? `id: ${id}\n` : "";
  return `${prefix}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "notifications:view");
    let cursor = parseCursor(request);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let flushing = false;
        let needsFlush = false;
        let unsubscribe = () => {};
        let heartbeat: NodeJS.Timeout | null = null;

        const enqueue = (message: string) => {
          if (!closed) controller.enqueue(encoder.encode(message));
        };

        const close = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          controller.close();
        };

        const flush = async () => {
          if (flushing) {
            needsFlush = true;
            return;
          }

          flushing = true;
          try {
            do {
              needsFlush = false;
              const notifications = await listNotificationsAfter(actor, cursor);
              for (const notification of notifications) {
                cursor = BigInt(notification.cursor);
                enqueue(frame("notification", notification.cursor, notification));
              }
            } while (needsFlush && !closed);
          } catch (error) {
            enqueue(frame("error", null, { message: "Notification stream catch-up failed" }));
            console.warn("Notification stream catch-up failed", error);
          } finally {
            flushing = false;
          }
        };

        unsubscribe = subscribeToNotificationWakeups(() => void flush());
        heartbeat = setInterval(() => {
          void requireCapability(request.headers, "notifications:view").then(
            () => enqueue(": heartbeat\n\n"),
            () => close(),
          );
        }, 25_000);

        request.signal.addEventListener("abort", close);
        enqueue(frame("ready", cursor.toString(), { cursor: cursor.toString() }));
        void flush();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
