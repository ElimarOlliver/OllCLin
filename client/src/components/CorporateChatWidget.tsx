import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, MessageCircle, Search, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

function profileLabel(role: string) {
  if (role === "admin") return "Administrador";
  if (role === "professional") return "Profissional de saúde";
  if (role === "receptionist") return "Recepção";
  return "Equipe OllCLin";
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function CorporateChatWidget() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();
  const contactsQuery = trpc.chat.contacts.useQuery(undefined, { refetchInterval: 30_000 });
  const threadsQuery = trpc.chat.threads.useQuery(undefined, { refetchInterval: 15_000 });
  const selectedContact = useMemo(
    () => (threadsQuery.data ?? contactsQuery.data ?? []).find((contact) => contact.id === selectedId) ?? null,
    [contactsQuery.data, selectedId, threadsQuery.data],
  );
  const messagesQuery = trpc.chat.messages.useQuery(
    { counterpartId: selectedId ?? 0 },
    { enabled: open && selectedId !== null, refetchInterval: 10_000 },
  );
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: async () => {
      setDraft("");
      await Promise.all([
        utils.chat.messages.invalidate({ counterpartId: selectedId ?? 0 }),
        utils.chat.threads.invalidate(),
      ]);
    },
  });
  const markReadMutation = trpc.chat.markRead.useMutation({
    onSuccess: () => utils.chat.threads.invalidate(),
  });

  const threads = threadsQuery.data ?? [];
  const contacts = (contactsQuery.data ?? []).filter((contact) =>
    contact.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const unreadCount = threads.reduce((total, thread) => total + thread.unreadCount, 0);

  useEffect(() => {
    if (!selectedId || !open) return;
    markReadMutation.mutate({ counterpartId: selectedId });
  }, [messagesQuery.dataUpdatedAt, open, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  function selectContact(id: number) {
    setSelectedId(id);
    setSearch("");
  }

  function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId || sendMutation.isPending) return;
    sendMutation.mutate({ recipientId: selectedId, body });
  }

  return (
    <>
      {open && (
        <section
          aria-label="Chat corporativo"
          className="fixed bottom-20 right-3 z-[70] flex h-[min(680px,calc(100vh-6rem))] w-[min(92vw,420px)] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-5"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-[#075e63] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              {selectedContact && (
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)} className="shrink-0 text-white hover:bg-white/15" aria-label="Voltar para contatos">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">{selectedContact?.name ?? "Comunicação interna"}</h2>
                <p className="truncate text-xs text-teal-100">{selectedContact ? profileLabel(selectedContact.role) : "Mensagens temporárias da equipe"}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} className="shrink-0 text-white hover:bg-white/15" aria-label="Fechar chat">
              <X className="h-4 w-4" />
            </Button>
          </header>

          {!selectedContact ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-slate-100 p-3">
                <label htmlFor="chatContactSearch" className="sr-only">Buscar membro da equipe</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input id="chatContactSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar membro da equipe" className="pl-9" />
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-1 p-2">
                  {contacts.map((contact) => {
                    const thread = threads.find((item) => item.id === contact.id);
                    return (
                      <button key={contact.id} type="button" onClick={() => selectContact(contact.id)} className="flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#075e63]">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-[#075e63]">{initials(contact.name)}</span>
                        <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm text-slate-900">{contact.name}</strong>{thread?.unreadCount ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#075e63] px-1.5 text-[10px] font-bold text-white">{thread.unreadCount}</span> : null}</span><span className="block truncate text-xs text-slate-500">{profileLabel(contact.role)}{thread?.lastMessage ? ` · ${thread.lastMessage}` : ""}</span></span>
                      </button>
                    );
                  })}
                  {!contacts.length && <p className="p-6 text-center text-sm text-slate-500">Nenhum membro encontrado.</p>}
                </div>
              </ScrollArea>
              <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">As mensagens são removidas automaticamente após 48 horas.</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="min-h-0 flex-1 bg-slate-50/70">
                <div className="space-y-3 p-4">
                  {(messagesQuery.data ?? []).map((message) => {
                    const mine = message.senderId !== selectedContact.id;
                    return <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className={cn("max-w-[82%] rounded-2xl px-3 py-2 shadow-sm", mine ? "rounded-br-md bg-[#075e63] text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800")}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><time className={cn("mt-1 block text-[10px]", mine ? "text-teal-100" : "text-slate-400")} dateTime={message.createdAt}>{format(new Date(message.createdAt), "dd/MM HH:mm", { locale: ptBR })}</time></div></div>;
                  })}
                  {!messagesQuery.data?.length && <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 text-center"><UserRound className="h-8 w-8 text-slate-300" /><p className="text-sm font-medium text-slate-600">Inicie uma conversa</p><p className="max-w-[240px] text-xs text-slate-500">Combine informações da operação com segurança e sem notificações invasivas.</p></div>}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <form onSubmit={sendMessage} className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white p-3">
                <label htmlFor="chatMessage" className="sr-only">Mensagem para {selectedContact.name}</label>
                <Textarea id="chatMessage" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem..." rows={1} className="max-h-24 min-h-10 resize-none" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} />
                <Button type="submit" size="icon" disabled={!draft.trim() || sendMutation.isPending} aria-label="Enviar mensagem" className="shrink-0 bg-[#075e63] hover:bg-[#064f53]"><Send className="h-4 w-4" /></Button>
              </form>
              {sendMutation.error && <p role="alert" className="bg-red-50 px-3 py-1 text-xs text-red-700">{sendMutation.error.message}</p>}
            </div>
          )}
        </section>
      )}
      <Button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Fechar chat corporativo" : "Abrir chat corporativo"} className={cn("fixed bottom-4 right-3 z-[71] h-12 rounded-full bg-[#075e63] px-4 text-white shadow-lg hover:bg-[#064f53] sm:right-5", unreadCount > 0 && !open && "animate-pulse ring-4 ring-teal-100")}>
        <MessageCircle className="h-5 w-5" />
        <span className="hidden sm:inline">Chat da equipe</span>
        {unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-[#075e63]">{unreadCount}</span>}
      </Button>
    </>
  );
}
