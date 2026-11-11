/**
 * OllCLin — Etapa 1: tela de administração da configuração fiscal.
 *
 * - Uma config por organização; campos editáveis pelo administrador.
 * - Segredos NUNCA aparecem aqui: credencial entra por configuraarEmpresa
 *   e vive cifrada no cofre do backend (R05/R07).
 * - Sugestões pré-preenchidas para o Consultório Mágico (Brasília): município
 *   5300108 e "Consulta médica" são SUGESTÕES de formulário, não constantes
 *   de emissão (códigos/alíquotas ficam configuráveis, como pedido).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Sugestões de PRÉ-PREENCHIMENTO — editáveis pelo administrador na tela. */
const SUGESTAO_BRASILIA = {
  municipioIbge: "5300108",
  uf: "DF",
  descricaoServico: "Consulta médica",
};

const SERVICOS_SUGERIDOS = [
  { descricao: "Consulta médica", lc116: "8.02.01" },
];

export default function ConfigFiscalView() {
  const salvarEmpresa = trpc.fiscal.configurarEmpresa.useMutation({});
  const salvarSerie = trpc.fiscal.configurarSerie.useMutation({});
  const credencial = trpc.fiscal.statusCredencial.useQuery({});

  const [form, setForm] = useState({
    cnpj: "",
    razaoSocial: "",
    im: "",
    municipioIbge: SUGESTAO_BRASILIA.municipioIbge,
    uf: SUGESTAO_BRASILIA.uf,
    emailFiscal: "",
    regimeTributario: "SIMPLES_NACIONAL",
    opcaoSimplesNacional: true,
    codigoTributacaoServico: "",
    itemListaServico: "",
    descricaoServicoPadrao: SUGESTAO_BRASILIA.descricaoServico,
    aliquotaIssPadrao: "2",
    issRetido: false,
    ambiente: "HOMOLOGACAO" as "HOMOLOGACAO" | "PRODUCAO",
    provedor: "mock", // gateway-mock (homologação) ou provedor-real (produção)
    serie: "1",
    modoCertificado: "A1_SERVIDOR" as "A1_SERVIDOR" | "ASSINATURA_LOCAL" | "MANUAL_DF",
    credencialMaterial: "",
    credencialSenha: "",
    credencialValidade: "",
  });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    setSaving(true);
    try {
      await salvarEmpresa.mutateAsync({
        cnpj: form.cnpj,
        razaoSocial: form.razaoSocial,
        municipioIbge: form.municipioIbge,
        uf: form.uf,
        emailFiscal: form.emailFiscal,
        regimeTributario: form.opcaoSimplesNacional ? "SIMPLES_NACIONAL" : form.regimeTributario,
        credencialMaterial: form.credencialMaterial,
        credencialSenha: form.credencialSenha || undefined,
        credencialTipo: form.modoCertificado === "A1_SERVIDOR" ? "A1" : form.modoCertificado === "ASSINATURA_LOCAL" ? "A3" : "TOKEN_GATEWAY",
        credencialValidade: form.credencialValidade,
      });
      await salvarSerie.mutateAsync({
        tipoDocumento: "NFS_E",
        ambiente: form.ambiente,
        provedor: form.provedor,
        serie: form.serie,
        codigoMunicipio: form.municipioIbge,
        itemListaServico: form.itemListaServico,
        aliquotaIssPadrao: Number(form.aliquotaIssPadrao) || 0,
        permiteEmissaoRetroativa: true,
        diasLimiteRetroativo: 90,
        opcaoSimplesNacional: form.opcaoSimplesNacional,
        codigoTributacaoServico: form.codigoTributacaoServico,
        descricaoServicoPadrao: form.descricaoServicoPadrao,
        issRetido: form.issRetido,
        modoCertificado: form.modoCertificado,
      });
      toast.success("Configuração fiscal salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Configuração fiscal</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>CNPJ</Label>
          <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
        </div>
        <div>
          <Label>Razão social</Label>
          <Input value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} />
        </div>
        <div>
          <Label>Inscrição municipal</Label>
          <Input value={form.im} onChange={(e) => setForm({ ...form, im: e.target.value })} />
        </div>
        <div>
          <Label>E-mail fiscal</Label>
          <Input value={form.emailFiscal} onChange={(e) => setForm({ ...form, emailFiscal: e.target.value })} />
        </div>
        <div>
          <Label>Código do município (IBGE)</Label>
          <Input value={form.municipioIbge} onChange={(e) => setForm({ ...form, municipioIbge: e.target.value })} maxLength={7} />
        </div>
        <div>
          <Label>UF</Label>
          <Input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} maxLength={2} />
        </div>
        <div>
          <Label>Regime tributário</Label>
          <Select value={form.regimeTributario} onValueChange={(v) => setForm({ ...form, regimeTributario: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SIMPLES_NACIONAL">Simples Nacional</SelectItem>
              <SelectItem value="LUCRO_PRESUMIDO">Lucro presumido</SelectItem>
              <SelectItem value="LUCRO_REAL">Lucro real</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.opcaoSimplesNacional}
              onCheckedChange={(v) => setForm({ ...form, opcaoSimplesNacional: v === true })}
            />
            Optante pelo Simples Nacional
          </label>
        </div>
        <div>
          <Label>Descrição padrão do serviço</Label>
          <Input value={form.descricaoServicoPadrao} onChange={(e) => setForm({ ...form, descricaoServicoPadrao: e.target.value })} />
        </div>
        <div>
          <Label>Código de tributação do serviço</Label>
          <Input value={form.codigoTributacaoServico} onChange={(e) => setForm({ ...form, codigoTributacaoServico: e.target.value })} maxLength={10} />
          <p className="mt-1 text-xs text-muted-foreground">
            Sugestão para consulta: {SERVICOS_SUGERIDOS[0].lc116} ({SERVICOS_SUGERIDOS[0].descricao}) — confirme com a Fazenda do DF.
          </p>
        </div>
        <div>
          <Label>Item lista LC 116</Label>
          <Input value={form.itemListaServico} onChange={(e) => setForm({ ...form, itemListaServico: e.target.value })} maxLength={10} />
        </div>
        <div>
          <Label>Alíquota de ISS (%)</Label>
          <Input type="number" step="0.01" min="0" max="100" value={form.aliquotaIssPadrao} onChange={(e) => setForm({ ...form, aliquotaIssPadrao: e.target.value })} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.issRetido} onCheckedChange={(v) => setForm({ ...form, issRetido: v === true })} />
            ISS retido na fonte
          </label>
        </div>
        <div>
          <Label>Ambiente</Label>
          <Select value={form.ambiente} onValueChange={(v) => setForm({ ...form, ambiente: v as typeof form.ambiente })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="HOMOLOGACAO">Homologação</SelectItem>
              <SelectItem value="PRODUCAO">Produção</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Provedor fiscal</Label>
          <Select value={form.provedor} onValueChange={(v) => setForm({ ...form, provedor: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mock">gateway-mock (homologação/testes)</SelectItem>
              <SelectItem value="provedor-real">Provedor real (stub — configure antes)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Série</Label>
          <Input value={form.serie} onChange={(e) => setForm({ ...form, serie: e.target.value })} maxLength={10} />
        </div>
        <div>
          <Label>Modo de certificado</Label>
          <Select value={form.modoCertificado} onValueChange={(v) => setForm({ ...form, modoCertificado: v as typeof form.modoCertificado })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A1_SERVIDOR">A1 no servidor (recomendado)</SelectItem>
              <SelectItem value="ASSINATURA_LOCAL">Assinatura local (A3/token)</SelectItem>
              <SelectItem value="MANUAL_DF">Contingência manual (portal DF)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Credencial — entra uma vez, nunca mais volta (R05/R07). */}
      {credencial.data?.existe ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Credencial cadastrada ({credencial.data.tipo}) · válida até{" "}
          {credencial.data.validoAte ? new Date(credencial.data.validoAte).toLocaleDateString("pt-BR") : "—"}
          {credencial.data.venceEm != null && ` · vence em ${credencial.data.venceEm} dia(s)`}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Material da credencial (.pfx ou token)</Label>
            <Input type="password" value={form.credencialMaterial} onChange={(e) => setForm({ ...form, credencialMaterial: e.target.value })} />
          </div>
          <div>
            <Label>Senha (opcional — vai direto ao cofre)</Label>
            <Input type="password" value={form.credencialSenha} onChange={(e) => setForm({ ...form, credencialSenha: e.target.value })} />
          </div>
          <div>
            <Label>Validade da credencial</Label>
            <Input type="date" value={form.credencialValidade} onChange={(e) => setForm({ ...form, credencialValidade: e.target.value })} />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Credenciais vivem cifradas no backend (cofre AES-256-GCM). Elas NUNCA voltam ao navegador nem aparecem em logs.
        Provedor real precisa ser contratado e configurado antes de emitir em produção.
      </p>

      <Button onClick={() => void salvar()} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar configuração
      </Button>
    </div>
  );
}
