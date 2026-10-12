import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import type { PortalRequestMessageDto } from "@shared/portal-requests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDateNl } from "@/lib/format-date-nl";

/**
 * The conversation on a request, oldest first, with a box to add to it.
 * Used by the customer (portal) and by staff; `send` does the actual call and
 * `mine` says which side the reader is on, so their own messages sit right.
 */
export function RequestThread({ messages, mine, canPost, send, onSent, placeholder, testId = "request-thread", sendLabel, hint }: {
  messages: PortalRequestMessageDto[]; mine: "customer" | "staff"; canPost: boolean;
  send: (body: string) => Promise<unknown>; onSent?: () => void; placeholder?: string; testId?: string;
  /** Staff name this button after what it does, since a second reply button sits further down. */
  sendLabel?: string;
  /** One line under the box saying what posting does. */
  hint?: string;
}) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () => send(body.trim()),
    onSuccess: () => { setBody(""); onSent?.(); },
    onError: (e: Error) => toast({ title: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  return (
    <div className="space-y-2" data-testid={testId}>
      {messages.length === 0 && <p className="text-sm text-muted-foreground">{t("thread.empty")}</p>}
      <ul className="space-y-2">
        {messages.map((m) => {
          const own = m.author === mine;
          return (
            <li key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`} data-testid={`thread-message-${m.id}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${own ? "rounded-br-sm bg-[#1a1d62] text-white" : "rounded-bl-sm bg-[#eef0fb] text-[#0f172a]"}`}>
                <div className={`mb-0.5 text-[11px] ${own ? "text-[#c7cbf5]" : "text-[#64748b]"}`}>
                  {m.author === "staff" ? t("thread.staffName", { name: m.authorName }) : m.authorName} · {formatDateNl(m.createdAt, "dd-MM-yyyy HH:mm")}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {canPost && (
        <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }} className="flex items-end gap-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder ?? t("thread.placeholder")} className="flex-1" data-testid={`${testId}-input`} />
          <Button type="submit" size="sm" disabled={!body.trim() || post.isPending} data-testid={`${testId}-send`}><Send className="mr-1 h-4 w-4" />{sendLabel ?? t("thread.send")}</Button>
        </form>
      )}
      {canPost && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
