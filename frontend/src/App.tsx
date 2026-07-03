import { useEffect, useMemo } from "react";
import { MessageSquarePlus, Paperclip, Mic, Phone, Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  formatDate,
  formatTime,
  formatStatus,
  getConversationPreview,
  shouldShowMessageStatus,
  getSortedConversations,
} from "@/lib/format";
import { isAudioMessage, isImageMessage, isVideoMessage } from "@/lib/messageMedia";
import { domRefs } from "@/store/domRefs";
import { useMessenger } from "@/store/messengerStore";
import type { Conversation } from "@/store/types";
import { cn } from "@/lib/utils";

export default function App() {
  const store = useMessenger();
  const set = useMessenger.setState;

  useEffect(() => {
    useMessenger.getState().bootstrap();
    const onOnline = () => {
      const g = useMessenger.getState();
      set((d) => {
        d.isOffline = false;
        d.serverOffline = false;
      });
      if (g.token && g.userId) {
        void g.loadConversations();
        if (g.currentConversationId) void g.refreshCurrentConversation();
        const ws = useMessenger.getState().ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          set((d) => {
            d.wsReconnectAttempts = 0;
          });
          useMessenger.getState().connectWebSocket();
        }
      }
    };
    const onOffline = () => {
      set((d) => {
        d.isOffline = true;
      });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const onVis = () => {
      const g = useMessenger.getState();
      if (document.visibilityState === "visible" && g.token && g.userId) {
        void g.syncAfterResume();
        const ws = useMessenger.getState().ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          set((d) => {
            d.wsReconnectAttempts = 0;
            d.serverOffline = false;
          });
          useMessenger.getState().connectWebSocket();
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVis);
      useMessenger.getState().cleanupVoiceRecorder();
    };
  }, []);

  const isAuthed = !!(store.token && store.userId && store.userId > 0);

  const filteredConversations = useMemo(() => {
    const convs = getSortedConversations(store.conversations, store.messages);
    const q = store.searchQuery.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter(
      (c) =>
        c.username?.toLowerCase().includes(q) || (c.display_name || "").toLowerCase().includes(q)
    );
  }, [store.conversations, store.messages, store.searchQuery]);

  const messagesForCurrent = store.currentConversationId
    ? store.messages[store.currentConversationId] || []
    : [];

  const userProfileStatusText = useMemo(() => {
    if (!isAuthed) return "";
    if (store.wsConnected) return "آنلاین";
    if (store.isOffline) return "آفلاین";
    if (store.wsReconnectAttempts >= store.wsMaxReconnectAttempts) return "آفلاین";
    return "در حال اتصال...";
  }, [isAuthed, store.wsConnected, store.isOffline, store.wsReconnectAttempts, store.wsMaxReconnectAttempts]);

  useEffect(() => {
    if (!store.currentConversationId || store.loadingMessages) return;
    const id = window.setTimeout(() => {
      useMessenger.getState().scrollToBottom();
    }, 50);
    return () => window.clearTimeout(id);
  }, [store.currentConversationId, store.loadingMessages, messagesForCurrent.length]);

  return (
    <div className="h-[100dvh] min-h-0 overflow-hidden">
      {!isAuthed ? (
        <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-50/80 via-stone-50 to-white p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-[52px] items-center justify-center rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-teal-50 text-xl font-extrabold text-emerald-950">
                P
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  PayamBar{" "}
                  <small className="text-xs font-normal text-muted-foreground">{store.appVersion}</small>
                </h1>
                <p className="text-sm text-muted-foreground">پیام‌رسان ساده، سریع و رمزنگاری‌شده</p>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-muted p-1">
              <Button
                type="button"
                variant={store.authTab === "login" ? "secondary" : "ghost"}
                className={cn("rounded-full", store.authTab === "login" && "bg-background shadow-sm")}
                onClick={() => set((d) => { d.authTab = "login"; })}
              >
                ورود
              </Button>
              <Button
                type="button"
                variant={store.authTab === "register" ? "secondary" : "ghost"}
                className={cn("rounded-full", store.authTab === "register" && "bg-background shadow-sm")}
                onClick={() => set((d) => { d.authTab = "register"; })}
              >
                ثبت‌نام
              </Button>
            </div>
            {store.authTab === "login" ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void store.handleLogin();
                }}
              >
                <Input
                  placeholder="نام‌کاربری"
                  value={store.login.username}
                  onChange={(e) => {
                    set((d) => {
                      d.login.username = e.target.value;
                    });
                  }}
                  required
                />
                <Input
                  type="password"
                  placeholder="رمز‌عبور"
                  value={store.login.password}
                  onChange={(e) => {
                    set((d) => {
                      d.login.password = e.target.value;
                    });
                  }}
                  required
                />
                {store.authError ? <p className="text-sm text-red-600">{store.authError}</p> : null}
                <Button type="submit" className="w-full">
                  ورود امن
                </Button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void store.handleRegister();
                }}
              >
                <Input
                  placeholder="نام‌کاربری"
                  value={store.register.username}
                  onChange={(e) => {
                    set((d) => {
                      d.register.username = e.target.value;
                    });
                  }}
                  required
                />
                <Input
                  type="password"
                  placeholder="رمز‌عبور"
                  value={store.register.password}
                  onChange={(e) => {
                    set((d) => {
                      d.register.password = e.target.value;
                    });
                  }}
                  required
                />
                <Input
                  type="password"
                  placeholder="تکرار رمز‌عبور"
                  value={store.register.confirm}
                  onChange={(e) => {
                    set((d) => {
                      d.register.confirm = e.target.value;
                    });
                  }}
                  required
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={store.acceptRules}
                    onChange={(e) => {
                      set((d) => {
                        d.acceptRules = e.target.checked;
                      });
                    }}
                    required
                    className="size-4 rounded border"
                  />
                  <span>قوانین استفاده را می‌پذیرم</span>
                </label>
                {store.authError ? <p className="text-sm text-red-600">{store.authError}</p> : null}
                <Button type="submit" className="w-full">
                  ثبت‌نام
                </Button>
              </form>
            )}
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <button type="button" className="font-semibold text-primary hover:underline" onClick={store.openRulesModal}>
                مشاهده قوانین
              </button>
            </div>
          </div>
          <Dialog open={store.showRulesModal} onOpenChange={(o) => !o && store.closeRulesModal()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>قوانین استفاده و رمزنگاری</DialogTitle>
              </DialogHeader>
              <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed">
                <li>پیام‌ها بین کاربرانی که کلید دارند، به صورت سرتاسری (E2EE) رمزنگاری می‌شود.</li>
                <li>اگر طرف مقابل هنوز کلید منتشر نکرده باشد، پیام شما به‌صورت متن ساده ارسال می‌شود تا قابل خواندن بماند.</li>
                <li>کلید خصوصی فقط به شکل رمزنگاری‌شده روی سرور پشتیبان‌گیری می‌شود و بدون رمز عبور شما قابل استفاده نیست.</li>
                <li>مسئولیت محتوای پیام‌ها، تخلفات و عواقب حقوقی بر عهده فرستنده و دریافت‌کننده است؛ سرویس مسئولیتی ندارد.</li>
                <li>از ارسال هرگونه محتوای غیرقانونی، آزاردهنده یا نقض‌کننده حقوق دیگران خودداری کنید.</li>
              </ul>
              <Button className="w-full" onClick={store.closeRulesModal}>
                متوجه شدم
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background md:flex-row">
          <aside
            className={cn(
              "relative flex w-full flex-col border-border bg-card md:max-w-[340px] md:border-l",
              store.chatListOpen ? "flex" : "hidden md:flex",
              "max-md:fixed max-md:inset-0 max-md:z-[200] max-md:bg-card"
            )}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 border-b border-border bg-gradient-to-b from-emerald-50/50 to-card px-4 py-3 pt-[max(0.65rem,env(safe-area-inset-top))] text-right transition-colors hover:bg-emerald-50/80 active:bg-emerald-50"
              onClick={() => {
                set((d) => {
                  d.showProfileModal = true;
                });
              }}
            >
              <span className="min-w-0 flex-1">
                <div className="truncate font-semibold">{store.profileDisplayName || store.username}</div>
                <div className="text-xs font-medium text-emerald-700">{userProfileStatusText}</div>
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-700 to-teal-600 text-sm font-bold text-white shadow-md">
                {store.myAvatarUrl ? (
                  <img src={store.myAvatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  (store.username || "?").charAt(0).toUpperCase()
                )}
              </span>
            </button>
            <ScrollArea className="flex-1 pb-16">
              <div className="p-1">
                {store.loadingConversations ? (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex animate-pulse gap-3 rounded-lg p-3">
                        <div className="flex-1 space-y-2 pt-1">
                          <div className="ms-auto h-3 w-2/3 rounded-full bg-muted" />
                          <div className="ms-auto h-2 w-1/2 rounded-full bg-muted" />
                        </div>
                        <div className="size-11 shrink-0 rounded-full bg-muted" />
                      </div>
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <p className="p-8 text-center font-semibold text-muted-foreground">هیچ مکالمه‌ای نیست</p>
                ) : (
                  filteredConversations.map((conv: Conversation) => (
                    <button
                      key={conv.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-right transition-colors hover:bg-muted/60",
                        conv.user_id === store.currentConversationId && "border-s-4 border-s-primary bg-emerald-50/70"
                      )}
                      onClick={() => void store.selectConversation(conv)}
                    >
                      <div className="flex shrink-0 flex-col items-start gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(conv.last_message_at)}
                        </span>
                        {conv.unread_count ? (
                          <span className="flex min-h-[26px] min-w-[26px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                            {conv.unread_count}
                          </span>
                        ) : null}
                        <span
                          role="button"
                          tabIndex={0}
                          className="rounded-md px-1 text-muted-foreground hover:bg-muted hover:text-primary"
                          aria-label="گزینه‌های مکالمه"
                          onClick={(e) => {
                            e.stopPropagation();
                            store.openConversationMenu(e, conv);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              store.openConversationMenu(e, conv);
                            }
                          }}
                        >
                          ⋯
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{conv.display_name || conv.username}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {getConversationPreview(conv, store.messages)}
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <div className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-700 to-teal-600 text-sm font-bold text-white shadow-sm">
                          {conv.avatar_url ? (
                            <img src={conv.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            (conv.username || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        {conv.is_online ? (
                          <span className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-card bg-green-500" />
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <Button
              type="button"
              size="icon"
              className="absolute bottom-5 left-5 z-10 size-14 rounded-full bg-gradient-to-br from-emerald-700 to-teal-600 shadow-lg hover:from-emerald-800 hover:to-teal-700"
              aria-label="مکالمه جدید"
              onClick={store.openNewChat}
            >
              <MessageSquarePlus className="size-6" />
            </Button>
          </aside>

          <section
            className={cn(
              "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#fbfcfb]",
              !store.chatListOpen ? "flex" : "hidden md:flex"
            )}
          >
            <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 py-2 backdrop-blur-md pt-[max(0.5rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={store.goBackToList}
                  aria-label="بازگشت"
                >
                  <ArrowRight className="size-5" />
                </Button>
                {!store.currentConversationId ? (
                  <span className="text-muted-foreground">یک مکالمه را انتخاب کنید</span>
                ) : (
                  <>
                    <div className="relative">
                      {store.currentConversationAvatarUrl ? (
                        <img
                          src={store.currentConversationAvatarUrl}
                          alt=""
                          className="size-9 rounded-full object-cover shadow-md"
                        />
                      ) : (
                        <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-700 to-teal-600 text-sm font-semibold text-white">
                          {(store.currentConversationDisplayName || store.currentConversationUsername || "?")
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      )}
                      {store.currentConversationIsOnline ? (
                        <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-green-500" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold">
                        {store.currentConversationDisplayName || store.currentConversationUsername}
                      </div>
                      {store.currentConversationIsOnline ? (
                        <div className="text-xs font-medium text-emerald-700">آنلاین</div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              {store.currentConversationId ? (
                <Button type="button" variant="ghost" size="icon" className="text-green-600" onClick={() => void store.startCall()} aria-label="تماس صوتی">
                  <Phone className="size-5" />
                </Button>
              ) : null}
            </header>

            {store.activeCall ? (
              <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-2 text-sm text-white">
                <div className="flex items-center gap-2">
                  <span className="animate-pulse">●</span>
                  <span>در حال مکالمه با {store.activeCall.displayName || store.activeCall.username}</span>
                  {store.callDuration ? <span>{store.callDuration}</span> : null}
                </div>
                <Button variant="destructive" size="sm" onClick={() => store.endCall()}>
                  قطع تماس
                </Button>
              </div>
            ) : null}

            <div
              ref={(el) => {
                domRefs.messagesContainer = el;
              }}
              className="messages-container relative min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-50 to-[#fbfcfb] px-4 pb-24 pt-4"
              onScroll={store.handleMessagesScroll}
              onTouchStart={store.handlePullStart}
              onTouchMove={store.handlePullMove}
              onTouchEnd={() => void store.handlePullEnd()}
            >
              {!store.currentConversationId ? (
                <p className="py-16 text-center font-semibold text-muted-foreground">یک مکالمه را انتخاب کنید</p>
              ) : store.loadingMessages ? (
                <p className="py-16 text-center text-muted-foreground">در حال بارگذاری...</p>
              ) : messagesForCurrent.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">هنوز پیامی وجود ندارد</p>
              ) : (
                <>
                  {store.loadingOlderMessages ? (
                    <div className="mb-2 rounded-lg bg-muted py-2 text-center text-xs text-muted-foreground">
                      در حال بارگذاری پیام‌های قدیمی‌تر...
                    </div>
                  ) : null}
                  {store.hasMoreMessages[store.currentConversationId] && !store.loadingOlderMessages ? (
                    <div className="mb-2 text-center text-xs text-muted-foreground opacity-70">
                      برای بارگذاری پیام‌های قدیمی‌تر به بالا اسکرول کنید
                    </div>
                  ) : null}
                  {messagesForCurrent.map((msg, msgIndex) => (
                    <div
                      key={msg.id || msg.client_message_id || msgIndex}
                      className={cn(
                        "mb-2 flex w-full flex-col",
                        Number(msg.sender_id) === Number(store.userId) ? "items-start" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl border px-4 py-2 text-start text-base leading-relaxed shadow-sm",
                          Number(msg.sender_id) === Number(store.userId)
                            ? "border-emerald-700 bg-gradient-to-br from-emerald-700 to-teal-600 text-white"
                            : "border-border bg-stone-100 text-foreground"
                        )}
                      >
                        {msg.file_url ? (
                          <>
                            {isImageMessage(msg) ? (
                              <a href={msg.file_url} target="_blank" rel="noreferrer" className="block">
                                <img src={msg.file_url} alt="" className="max-h-72 w-full rounded-xl object-cover" />
                              </a>
                            ) : isVideoMessage(msg) ? (
                              <video src={msg.file_url} className="max-h-72 w-full rounded-xl bg-black" controls preload="metadata" />
                            ) : isAudioMessage(msg) ? (
                              <audio src={msg.file_url} controls preload="metadata" className="w-full min-w-[200px]" />
                            ) : (
                              <a href={msg.file_url} download target="_blank" rel="noreferrer" className="underline">
                                📎 {msg.file_name || "دانلود فایل"}
                              </a>
                            )}
                          </>
                        ) : (
                          msg.content
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 px-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {shouldShowMessageStatus(msg, msgIndex, messagesForCurrent, store.userId) ? (
                            <span>{formatStatus(msg)}</span>
                          ) : null}
                          <span>{formatTime(msg.created_at)}</span>
                          <span className="text-border">{formatDate(msg.created_at)}</span>
                        </div>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-1.5 text-muted-foreground hover:bg-muted"
                          aria-label="گزینه‌های پیام"
                          onClick={(e) => {
                            e.stopPropagation();
                            store.openContextMenu(e, msg);
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {store.currentConversationId ? (
              <div
                className={cn(
                  "pointer-events-none fixed bottom-20 left-0 right-0 z-20 flex h-14 items-center justify-center opacity-0 transition-opacity",
                  (store.pullToRefresh.pulling || store.pullToRefresh.refreshing) && "opacity-100"
                )}
                style={{
                  bottom: `calc(var(--input-area-offset) + env(safe-area-inset-bottom, 0px))`,
                  transform:
                    store.pullToRefresh.pulling || store.pullToRefresh.refreshing
                      ? `translateY(-${store.pullToRefresh.currentY}px)`
                      : undefined,
                }}
              >
                {store.pullToRefresh.refreshing ? (
                  <span className="animate-spin text-xl text-primary">↻</span>
                ) : store.pullToRefresh.currentY >= store.pullToRefresh.threshold ? (
                  <span className="text-sm text-muted-foreground">رها کنید</span>
                ) : (
                  <span className="text-sm text-muted-foreground">برای بروزرسانی به بالا بکشید</span>
                )}
              </div>
            ) : null}

            {store.currentConversationId ? (
              <div className="sticky bottom-0 z-[4] border-t border-border bg-card/95 px-3 py-2 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-1 rounded-2xl border border-border bg-stone-100/90 p-1">
                  <input ref={(el) => { domRefs.fileInput = el; }} type="file" className="hidden" onChange={(e) => void store.handleFileSelect(e)} />
                  <Button type="button" variant="ghost" size="icon" aria-label="پیوست فایل" onClick={() => domRefs.fileInput?.click()}>
                    <Paperclip className="size-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(store.recordingVoice && "bg-red-100 text-red-700")}
                    disabled={store.uploadingFile || store.sendingVoice}
                    aria-label={store.recordingVoice ? "توقف ضبط" : "ضبط صدا"}
                    onClick={() => void store.toggleVoiceRecording()}
                  >
                    <Mic className="size-5" />
                  </Button>
                  <Textarea
                    ref={(el) => {
                      domRefs.messageInput = el;
                    }}
                    rows={1}
                    placeholder="پیام..."
                    value={store.messageText}
                    onChange={(e) => {
                      set((d) => {
                        d.messageText = e.target.value;
                      });
                      queueMicrotask(() => useMessenger.getState().resizeMessageInput());
                    }}
                    onInput={() => useMessenger.getState().resizeMessageInput()}
                    className="max-h-[120px] min-h-[42px] flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="size-11 shrink-0 rounded-full bg-primary text-primary-foreground"
                    aria-label="ارسال"
                    dir="ltr"
                    onClick={() => void store.sendMessage()}
                  >
                    <Send className="size-5 rotate-180" />
                  </Button>
                </div>
                {store.recordingVoice ? (
                  <p className="mt-1 text-center text-sm text-red-700">
                    در حال ضبط صدا: {String(Math.floor(store.recordingElapsedSec / 60)).padStart(2, "0")}:
                    {String(store.recordingElapsedSec % 60).padStart(2, "0")}
                  </p>
                ) : null}
                {store.sendingVoice ? (
                  <p className="mt-1 text-center text-sm text-muted-foreground">در حال ارسال پیام صوتی...</p>
                ) : null}
                {store.uploadingFile ? (
                  <p className="mt-1 text-center text-sm text-muted-foreground">در حال آپلود...</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <Dialog open={store.showNewChatModal} onOpenChange={(o) => !o && store.closeNewChatModal()}>
            <DialogContent className="flex max-h-[min(88dvh,100%)] flex-col gap-0 p-0 sm:max-w-md">
              <DialogHeader className="shrink-0 border-b px-6 py-4 pe-12">
                <DialogTitle>مکالمه جدید</DialogTitle>
              </DialogHeader>
              <div className="shrink-0 border-b bg-card px-6 py-3">
                <Input
                  ref={(el) => {
                    domRefs.newChatSearchInput = el;
                  }}
                  className="w-full"
                  placeholder="نام کاربری را جستجو کنید..."
                  value={store.newChatSearchQuery}
                  onChange={(e) => {
                    set((d) => {
                      d.newChatSearchQuery = e.target.value;
                    });
                    useMessenger.getState().onNewChatSearchInput();
                  }}
                />
              </div>
              <ScrollArea className="min-h-0 flex-1 px-2">
                {!store.newChatSearchQuery.trim() ? (
                  <p className="p-8 text-center text-muted-foreground">نام کاربری را وارد کنید</p>
                ) : store.newChatSearchLoading ? (
                  <p className="p-8 text-center text-muted-foreground">در حال جستجو...</p>
                ) : store.newChatSearchError ? (
                  <p className="p-8 text-center text-red-600">{store.newChatSearchError}</p>
                ) : store.newChatSearchResults.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">کاربری یافت نشد</p>
                ) : (
                  store.newChatSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-3 border-b px-4 py-3 text-right hover:bg-muted"
                      onClick={() => void store.handleSelectSearchedUser(u)}
                    >
                      <span className="text-muted-foreground">‹</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{u.display_name || u.username}</div>
                        <div className="text-xs text-muted-foreground">
                          @{u.username}
                          {u.is_online ? <span className="ms-2 text-green-600">آنلاین</span> : null}
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            (u.display_name || u.username || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        {u.is_online ? (
                          <span className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-card bg-green-500" />
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </ScrollArea>
            </DialogContent>
          </Dialog>

          <Dialog
            open={store.showProfileModal}
            onOpenChange={(o) => !o && set((d) => { d.showProfileModal = false; })}
          >
            <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="border-b px-6 py-4">
                <DialogTitle>پروفایل</DialogTitle>
              </DialogHeader>
              <Tabs
                value={store.activeProfileTab}
                onValueChange={(v) => {
                  set((d) => {
                    d.activeProfileTab = v as typeof d.activeProfileTab;
                  });
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="mx-4 mt-2 grid w-auto grid-cols-4 rounded-lg bg-muted p-1">
                  <TabsTrigger value="profile">پروفایل</TabsTrigger>
                  <TabsTrigger value="notifications">اعلان‌ها</TabsTrigger>
                  <TabsTrigger value="account">حساب</TabsTrigger>
                  <TabsTrigger value="about">درباره</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ScrollArea className="max-h-[55vh] px-6 pt-4">
                    <div className="flex flex-col items-center gap-2 border-b pb-6">
                      <button
                        type="button"
                        className="relative flex size-[88px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-700 to-teal-600 text-3xl font-bold text-white shadow-lg"
                        onClick={() => domRefs.avatarInput?.click()}
                      >
                        {store.myAvatarUrl ? (
                          <img src={store.myAvatarUrl} alt="" className="size-full object-cover" />
                        ) : (
                          (store.username || "?").charAt(0).toUpperCase()
                        )}
                        <span className="absolute inset-x-0 bottom-0 flex h-8 items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100">
                          <span className="text-xs">تغییر</span>
                        </span>
                      </button>
                      <input
                        ref={(el) => {
                          domRefs.avatarInput = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void store.handleAvatarUpload(e)}
                      />
                      <div className="font-bold">{store.profileDisplayName || store.username}</div>
                      {store.uploadingAvatar ? (
                        <div className="text-sm text-emerald-700">در حال آپلود...</div>
                      ) : null}
                    </div>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>نام کاربری</Label>
                        <Input value={store.username || ""} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>نام نمایشی</Label>
                        <Input
                          value={store.profileDisplayName}
                          onChange={(e) => {
                            set((d) => {
                              d.profileDisplayName = e.target.value;
                            });
                          }}
                          placeholder="نام نمایشی خود را وارد کنید"
                        />
                      </div>
                    </div>
                  </ScrollArea>
                  <div className="border-t bg-card px-6 py-4">
                    <Button className="w-full" onClick={() => void store.saveProfile()}>
                      ذخیره تغییرات
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="notifications" className="px-6 py-6">
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <Label htmlFor="push-toggle">اعلان پیام جدید</Label>
                    <Switch
                      id="push-toggle"
                      checked={store.pushNotificationsEnabled}
                      onCheckedChange={(c) => {
                        set((d) => {
                          d.pushNotificationsEnabled = c;
                        });
                        queueMicrotask(() => void useMessenger.getState().togglePushNotifications());
                      }}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="account" className="space-y-4 px-6 py-6">
                  <Button variant="outline" className="w-full gap-2 text-red-600" onClick={store.handleLogout}>
                    خروج از حساب
                  </Button>
                  <p className="text-sm text-red-800">
                    برای حذف حساب، نام کاربری خود را وارد کنید. این عملیات غیرقابل بازگشت است.
                  </p>
                  <Input
                    placeholder="نام کاربری"
                    value={store.deleteAccountConfirm}
                    onChange={(e) => {
                      set((d) => {
                        d.deleteAccountConfirm = e.target.value;
                      });
                    }}
                  />
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={store.deletingAccount || store.deleteAccountConfirm.trim() !== store.username}
                    onClick={() => void store.deleteAccount()}
                  >
                    {store.deletingAccount ? "در حال حذف..." : "حذف حساب"}
                  </Button>
                </TabsContent>
                <TabsContent value="about" className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-2xl font-extrabold text-white shadow-lg">
                    P
                  </div>
                  <div className="text-lg font-bold">PayamBar</div>
                  <div className="mt-2 text-sm text-muted-foreground">نسخه {store.appVersion || "dev"}</div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Dialog open={!!store.incomingCall} onOpenChange={(o) => !o && store.rejectCall()}>
            <DialogContent className="sm:max-w-sm">
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-white">
                  {store.incomingCall?.avatar_url ? (
                    <img src={store.incomingCall.avatar_url} alt="" className="size-full object-cover" />
                  ) : store.incomingCall ? (
                    store.incomingCall.username.charAt(0).toUpperCase()
                  ) : null}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {store.incomingCall?.displayName || store.incomingCall?.username}
                  </h3>
                  <p className="text-muted-foreground">تماس صوتی ورودی...</p>
                </div>
                <div className="flex w-full gap-3">
                  <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700" onClick={() => void store.acceptCall()}>
                    <Phone className="size-4" /> پذیرفتن
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={store.rejectCall}>
                    رد کردن
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!store.outgoingCall} onOpenChange={(o) => !o && store.endCall()}>
            <DialogContent className="sm:max-w-sm">
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary text-2xl font-bold text-white">
                  {store.outgoingCall?.avatarUrl ? (
                    <img src={store.outgoingCall.avatarUrl} alt="" className="size-full object-cover" />
                  ) : store.outgoingCall ? (
                    store.outgoingCall.username.charAt(0).toUpperCase()
                  ) : null}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {store.outgoingCall?.displayName || store.outgoingCall?.username}
                  </h3>
                  <p className="text-muted-foreground">
                    {store.outgoingCall?.status === "ringing" ? "در حال زنگ خوردن..." : "در حال برقراری تماس..."}
                  </p>
                </div>
                <Button variant="destructive" className="w-full" onClick={() => store.endCall()}>
                  لغو
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {store.conversationMenu.show && store.conversationMenu.conversation ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[999] bg-transparent"
                aria-hidden
                onClick={store.closeConversationMenu}
              />
              <div
                className="fixed z-[1000] min-w-[140px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
                style={{ top: store.conversationMenu.y, left: store.conversationMenu.x }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-red-600 hover:bg-red-50"
                  onClick={() => void store.deleteConversation(store.conversationMenu.conversation!)}
                >
                  🗑 حذف مکالمه
                </button>
              </div>
            </>
          ) : null}

          {store.contextMenu.show && store.contextMenu.message ? (
            <>
              <button type="button" className="fixed inset-0 z-[999] bg-transparent" aria-hidden onClick={store.closeContextMenu} />
              <div
                className="fixed z-[1000] min-w-[140px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
                style={{ top: store.contextMenu.y, left: store.contextMenu.x }}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm hover:bg-muted"
                  onClick={() => void store.copyMessage()}
                >
                  📋 کپی پیام
                </button>
                {Number(store.contextMenu.message.sender_id) === Number(store.userId) ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-red-600 hover:bg-red-50"
                    onClick={() => void store.deleteMessage()}
                  >
                    🗑 حذف پیام
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
