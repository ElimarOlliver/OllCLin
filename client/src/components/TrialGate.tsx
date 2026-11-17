import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Lock, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

// TODO(comercial): substituir pelo número real da equipe de vendas
// (formato wa.me: "55" + DDD + número, só dígitos) e pelo rótulo legível.
const WHATSAPP_NUMBER = "5511999999999";
const SUPPORT_PHONE_LABEL = "(11) 99999-9999";

const TRIAL_EVENT = "ollclin:trial-expired";
const AUTO_SHOWN_KEY = "ollclin-trial-dialog-shown";

const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Quero contratar um plano do OllCLin para a nossa clínica."
)}`;

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Modo somente leitura pós-trial: banner fixo de aviso + popup de contratação.
 * O servidor bloqueia as mutações (middleware no tRPC); aqui a experiência é
 * proativa — consulta o estado do trial e abre o popup de conversão.
 */
export function TrialGate() {
  const [open, setOpen] = useState(false);

  const trial = trpc.saas.trialStatus.useQuery(undefined, {
    staleTime: 5 * 60_000,
    retry: false,
  });
  const plans = trpc.saas.plans.useQuery(undefined, {
    enabled: open,
    retry: false,
  });

  const expired =
    !!trial.data && trial.data.plan === "trial" && trial.data.trialExpired;

  // Mutation bloqueada pelo servidor → o evento global abre o popup na hora.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(TRIAL_EVENT, show);
    return () => window.removeEventListener(TRIAL_EVENT, show);
  }, []);

  // Ao carregar com trial expirado, o popup abre uma vez por sessão — sem
  // bombardear quem só quer consultar (a banner segue visível).
  useEffect(() => {
    if (!expired) return;
    let shown: string | null = null;
    try {
      shown = sessionStorage.getItem(AUTO_SHOWN_KEY);
    } catch {
      // sessionStorage indisponível (navegação privada) — trata como não visto.
    }
    if (!shown) {
      setOpen(true);
      try {
        sessionStorage.setItem(AUTO_SHOWN_KEY, "1");
      } catch {
        // idem
      }
    }
  }, [expired]);

  return (
    <>
      {expired && !open && (
        <div
          role="status"
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-sticky mx-auto flex max-w-md items-center gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 shadow-md backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:max-w-sm"
        >
          <Lock className="h-4 w-4 shrink-0 text-warning-strong" />
          <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
            Trial encerrado — modo somente leitura.
          </p>
          <Button size="sm" className="h-9 shrink-0" onClick={() => setOpen(true)}>
            Contratar
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft">
              <Lock className="h-6 w-6 text-warning-strong" />
            </span>
            <DialogTitle className="text-left font-heading text-2xl font-bold tracking-tight text-foreground">
              Seu período de teste terminou
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed text-muted-foreground">
              A clínica continua em modo consulta: navegue por pacientes,
              agenda e financeiro à vontade. Para criar e editar de novo,
              contrate um plano — leva menos de um minuto com a nossa equipe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {plans.isLoading ? (
              <>
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </>
            ) : (
              (plans.data ?? []).map((plan) => (
                <div
                  key={plan.key}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {plan.name}
                    </p>
                    <p className="shrink-0 text-sm font-bold text-primary">
                      {formatPrice(plan.priceCents)}
                      <span className="text-xs font-normal text-muted-foreground">/mês</span>
                    </p>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {(plan.features ?? []).slice(0, 3).map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <Check className="h-3 w-3 text-success" />
                        {feature}
                      </li>
                    ))}
                    {plan.maxUsers > 0 && (
                      <li className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3 w-3 text-success" />
                        Até {plan.maxUsers} usuários
                      </li>
                    )}
                  </ul>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="flex-col gap-2">
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="w-full">
              <Button className="h-11 w-full">
                <MessageCircle />
                Falar com a equipe no WhatsApp
              </Button>
            </a>
            <p className="text-center text-xs text-muted-foreground">
              Prefere ligar? {SUPPORT_PHONE_LABEL}
            </p>
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => setOpen(false)}
            >
              Continuar consultando
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
