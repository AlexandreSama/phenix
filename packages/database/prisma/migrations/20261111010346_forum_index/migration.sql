-- CreateIndex
CREATE INDEX "ForumPost_threadId_createdAt_idx" ON "ForumPost"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumThread_categoryId_pinned_updatedAt_idx" ON "ForumThread"("categoryId", "pinned", "updatedAt");
