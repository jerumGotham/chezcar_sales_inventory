CREATE SEQUENCE "Notification_cursor_seq";

ALTER TABLE "Notification" ADD COLUMN "cursor" BIGINT;

UPDATE "Notification"
SET "cursor" = nextval('"Notification_cursor_seq"')
WHERE "cursor" IS NULL;

ALTER TABLE "Notification" ALTER COLUMN "cursor" SET DEFAULT nextval('"Notification_cursor_seq"');
ALTER TABLE "Notification" ALTER COLUMN "cursor" SET NOT NULL;

ALTER SEQUENCE "Notification_cursor_seq" OWNED BY "Notification"."cursor";

CREATE UNIQUE INDEX "Notification_cursor_key" ON "Notification"("cursor");
CREATE INDEX "Notification_userId_cursor_idx" ON "Notification"("userId", "cursor");
