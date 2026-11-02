import { getSupabaseAdmin } from "../lib/supabase-server";

const CHAT_COLUMNS = "id, organization_id, sender_id, recipient_id, body, created_at, expires_at, read_at";

export type ChatContact = {
  id: number;
  name: string;
  email: string | null;
  role: string;
};

export type ChatMessage = {
  id: number;
  organizationId: number;
  senderId: number;
  recipientId: number;
  body: string;
  createdAt: string;
  expiresAt: string;
  readAt: string | null;
};

export type ChatThread = ChatContact & {
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

function toMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    senderId: Number(row.sender_id),
    recipientId: Number(row.recipient_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    readAt: row.read_at ? String(row.read_at) : null,
  };
}

function fail(context: string, error: { message: string } | null): never {
  console.error(`[ChatModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} as mensagens`);
}

async function cleanupExpired(organizationId: number) {
  const { error } = await getSupabaseAdmin()
    .from("chat_messages")
    .delete()
    .eq("organization_id", organizationId)
    .lte("expires_at", new Date().toISOString());
  if (error) fail("limpar", error);
}

export const chatModel = {
  async listContacts(organizationId: number, currentUserId: number): Promise<ChatContact[]> {
    await cleanupExpired(organizationId);
    const { data, error } = await getSupabaseAdmin()
      .from("users")
      .select("id, name, email, role")
      .eq("organization_id", organizationId)
      .neq("id", currentUserId)
      .order("name", { ascending: true });
    if (error) fail("listar contatos", error);
    return (data ?? []).map((row) => ({
      id: Number(row.id),
      name: String(row.name || "Usuário OllCLin"),
      email: row.email ? String(row.email) : null,
      role: String(row.role || "user"),
    }));
  },

  async listMessages(organizationId: number, currentUserId: number, counterpartId: number): Promise<ChatMessage[]> {
    await cleanupExpired(organizationId);
    const { data, error } = await getSupabaseAdmin()
      .from("chat_messages")
      .select(CHAT_COLUMNS)
      .eq("organization_id", organizationId)
      .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${counterpartId}),and(sender_id.eq.${counterpartId},recipient_id.eq.${currentUserId})`)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) fail("listar", error);
    return (data ?? []).map(toMessage);
  },

  async listThreads(organizationId: number, currentUserId: number): Promise<ChatThread[]> {
    await cleanupExpired(organizationId);
    const [contacts, messagesResult] = await Promise.all([
      this.listContacts(organizationId, currentUserId),
      getSupabaseAdmin()
        .from("chat_messages")
        .select(CHAT_COLUMNS)
        .eq("organization_id", organizationId)
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (messagesResult.error) fail("listar conversas", messagesResult.error);
    const messages = (messagesResult.data ?? []).map(toMessage);
    return contacts
      .map((contact) => {
        const conversation = messages.filter(
          (message) => message.senderId === contact.id || message.recipientId === contact.id,
        );
        const latest = conversation[0];
        return {
          ...contact,
          lastMessage: latest?.body ?? null,
          lastMessageAt: latest?.createdAt ?? null,
          unreadCount: conversation.filter(
            (message) => message.senderId === contact.id && message.recipientId === currentUserId && !message.readAt,
          ).length,
        };
      })
      .sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
        return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
      });
  },

  async sendMessage(input: { organizationId: number; senderId: number; recipientId: number; body: string }): Promise<ChatMessage> {
    await cleanupExpired(input.organizationId);
    const body = input.body.trim();
    if (!body || body.length > 2000) throw new Error("A mensagem deve ter entre 1 e 2.000 caracteres");
    const { data: recipient, error: recipientError } = await getSupabaseAdmin()
      .from("users")
      .select("id")
      .eq("id", input.recipientId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (recipientError) fail("validar destinatário", recipientError);
    if (!recipient) throw new Error("Destinatário não encontrado nesta organização");
    const { data, error } = await getSupabaseAdmin()
      .from("chat_messages")
      .insert({
        organization_id: input.organizationId,
        sender_id: input.senderId,
        recipient_id: input.recipientId,
        body,
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select(CHAT_COLUMNS)
      .single();
    if (error) fail("enviar", error);
    return toMessage(data);
  },

  async markRead(organizationId: number, currentUserId: number, counterpartId: number) {
    const { error } = await getSupabaseAdmin()
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("sender_id", counterpartId)
      .eq("recipient_id", currentUserId)
      .is("read_at", null)
      .gt("expires_at", new Date().toISOString());
    if (error) fail("marcar mensagens como lidas", error);
  },
};
