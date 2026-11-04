/**
 * OllCLin - Serviço de e-mail (interface + implementação Supabase)
 *
 * A interface permite trocar o provedor (Resend, SendGrid, SMTP...) sem
 * tocar nos chamadores. A implementação padrão usa o envio nativo do
 * Supabase Auth (inviteUserByEmail / generateLink), que já entrega o link
 * mágico ao destinatário.
 */

export type EmailInviteInput = {
  to: string;
  /** URL absoluta do link de ativação/convite. */
  linkUrl: string;
  organizationName: string;
  role: string;
  /** Horas até o link expirar (apenas informativo no e-mail). */
  expiresInHours: number;
};

export interface EmailService {
  /** Envia convite/ativação com link de definição de senha. */
  sendInvitationEmail(input: EmailInviteInput): Promise<void>;
}

/**
 * Implementação padrão: Supabase Auth. O `generateLink` (tipo invite)
 * dispara o e-mail nativo do Supabase com o link — sem guardar senha.
 * NUNCA enviamos senha por e-mail (LGPD/SEGURANCA_LGPD.md).
 */
export class SupabaseEmailService implements EmailService {
  async sendInvitationEmail(input: EmailInviteInput): Promise<void> {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL ?? "";
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
    if (!url || !key) throw new Error("Supabase não configurado para envio de convite");

    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Se o usuário não existe no Auth, o invite cria a conta e envia o e-mail.
    // Se existe, reenviamos o link mágico de recuperação (define nova senha).
    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users?.some(
      (u) => (u.email ?? "").toLowerCase() === input.to.toLowerCase(),
    );

    if (alreadyExists) {
      const { error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: input.to,
        options: { redirectTo: input.linkUrl },
      });
      if (error) throw new Error(`Falha ao enviar link de acesso: ${error.message}`);
    } else {
      const { error } = await supabase.auth.admin.inviteUserByEmail(input.to, {
        redirectTo: input.linkUrl,
        data: { organization_name: input.organizationName, invited_role: input.role },
      });
      if (error) throw new Error(`Falha ao enviar convite: ${error.message}`);
    }
  }
}

/** Registry simples para trocar o provedor via env (EMAIL_PROVIDER). */
export function getEmailService(): EmailService {
  // Por enquanto apenas Supabase; novos provedores entram aqui.
  return new SupabaseEmailService();
}
