export type Depoimento = {
  texto: string;
  nome: string;
  bairro: string;
  /** Caminho da foto da cliente em /public/fotos (opcional). */
  foto?: string;
};

/**
 * Depoimentos REAIS de clientes, com autorização. Enquanto a lista estiver vazia, a seção
 * não aparece na página. Exemplo de item:
 * { texto: "Os salgados chegaram quentinhos e no horário.", nome: "Maria", bairro: "Camboinha" }
 */
export const DEPOIMENTOS: Depoimento[] = [];
