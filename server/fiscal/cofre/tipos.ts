/**
 * OllCLin — Status da credencial fiscal (FISCAL.md §5).
 * Compartilhado entre cofre e router — nunca expõe material.
 */

export interface StatusCredencial {
  existe: boolean;
  valido: boolean;
  tipo?: "A1" | "A3" | "TOKEN_GATEWAY";
  validoAte?: Date;
  /** Dias restantes quando ≤ 30 (janela de alerta R08). */
  diasRestantes?: number;
  venceEm?: number;
  vencido?: boolean;
}

/** Janelas de alerta do job diário (R08): 30/15/7/1 dias. */
export const ALERTAS_VALIDADE = [30, 15, 7, 1] as const;
